import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  isPrivilegedStaff,
  getTeacherParallelIds,
} from '../../../../shared/infrastructure/services/teacher-scope.service'
import type {
  FolderActor,
  ListStudentsQuery,
  PaginatedStudents,
} from '../../application/dtos/student-folder.dto'

const personSelect = {
  id: true,
  profile: { select: { firstName: true, lastName: true, dni: true } },
}

function fullName(
  p: { profile: { firstName: string; lastName: string } | null } | null,
  fallback = '',
): string {
  if (!p?.profile) return fallback
  return `${p.profile.lastName} ${p.profile.firstName}`.trim()
}

export class PrismaStudentFolderRepository {
  /**
   * Estudiantes cuyo expediente puede abrir el actor (paginado + búsqueda + filtro):
   * - staff privilegiado (admin/rector/dece/inspector) → todos los `student`.
   * - docente → solo estudiantes matriculados en sus paralelos (dicta o es tutor).
   * Búsqueda por nombre o cédula; filtro opcional por paralelo.
   */
  async listAccessibleStudents(
    institutionId: string,
    actor: FolderActor,
    query: ListStudentsQuery,
  ): Promise<PaginatedStudents> {
    const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20))
    const search = (query.search ?? '').trim()

    // Alcance de paralelos: privilegiado = todos; docente = solo los suyos.
    let scopedParallelIds: string[] | null = null
    if (!isPrivilegedStaff(actor.roles)) {
      if (!actor.roles.includes('teacher')) {
        return { data: [], total: 0, page, pageSize }
      }
      scopedParallelIds = await getTeacherParallelIds(institutionId, actor.userId)
      if (scopedParallelIds.length === 0) return { data: [], total: 0, page, pageSize }
    }

    // Paralelos efectivos = filtro pedido ∩ alcance del actor.
    let effectiveParallelIds: string[] | null = scopedParallelIds
    if (query.parallelId) {
      if (scopedParallelIds && !scopedParallelIds.includes(query.parallelId)) {
        return { data: [], total: 0, page, pageSize }
      }
      effectiveParallelIds = [query.parallelId]
    }

    const where: Prisma.UserWhereInput = {
      institutionId,
      userRoles: { some: { role: { name: 'student' } } },
      ...(effectiveParallelIds
        ? { studentEnrollments: { some: { parallelId: { in: effectiveParallelIds } } } }
        : {}),
      ...(search
        ? {
            AND: search.split(/\s+/).filter(Boolean).map((term) => ({ OR: [
              { profile: { firstName: { contains: term, mode: 'insensitive' as const } } },
              { profile: { lastName: { contains: term, mode: 'insensitive' as const } } },
              { profile: { dni: { contains: term, mode: 'insensitive' as const } } },
            ] })),
          }
        : {}),
    }

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          profile: { select: { firstName: true, lastName: true, dni: true } },
          studentEnrollments: {
            where: { institutionId, ...(effectiveParallelIds ? { parallelId: { in: effectiveParallelIds } } : {}) },
            select: {
              parallel: { select: { name: true, level: { select: { name: true } } } },
              academicYear: { select: { startDate: true } },
            },
            orderBy: { academicYear: { startDate: 'desc' } },
            take: 1,
          },
        },
        orderBy: [
          { profile: { lastName: 'asc' } },
          { profile: { firstName: 'asc' } },
          { id: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    return {
      data: rows.map((s) => {
        const enr = s.studentEnrollments[0]
        return {
          id: s.id,
          fullName: fullName(s),
          dni: s.profile?.dni ?? null,
          levelName: enr?.parallel.level?.name ?? null,
          parallelName: enr?.parallel.name ?? null,
        }
      }),
      total,
      page,
      pageSize,
    }
  }

  /** Expediente consolidado del estudiante: datos, matrículas, incidentes, actas y atenciones. */
  async getFolder(studentId: string, institutionId: string) {
    const student = await prisma.user.findFirst({
      where: { id: studentId, institutionId },
      include: {
        profile: true,
        userRoles: { include: { role: { select: { name: true } } } },
      },
    })
    if (!student) throw new NotFoundError('Estudiante no encontrado')

    const [enrollments, incidents, parentMeetings] = await Promise.all([
      prisma.studentEnrollment.findMany({
        where: { institutionId, studentId },
        include: {
          parallel: { include: { level: { select: { name: true, code: true } } } },
          academicYear: { select: { id: true, name: true, startDate: true } },
        },
        orderBy: { academicYear: { startDate: 'desc' } },
      }),
      prisma.disciplinaryIncident.findMany({
        where: { institutionId, studentId },
        include: {
          incidentType: { select: { id: true, name: true, severity: true } },
          reporter: { select: personSelect },
          commitments: {
            orderBy: { createdAt: 'desc' },
            include: { creator: { select: personSelect } },
          },
        },
        orderBy: { incidentDate: 'desc' },
      }),
      prisma.parentMeeting.findMany({
        where: { institutionId, studentId },
        include: { recorder: { select: personSelect } },
        orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
      }),
    ])

    // Apartado "Actas": actas de compromiso de incidentes + actas de atención a padres.
    const actas = [
      ...incidents.flatMap((inc) =>
        inc.commitments.map((c) => ({
          kind: 'incident_commitment' as const,
          id: c.id,
          incidentId: inc.id,
          title: `Acta de compromiso — ${inc.incidentType?.name ?? inc.category}`,
          createdAt: c.createdAt,
          status: c.status,
          downloadUrl: `incidents/${inc.id}/commitments/${c.id}/pdf`,
        })),
      ),
      ...parentMeetings.map((m) => ({
        kind: 'parent_meeting' as const,
        id: m.id,
        incidentId: null,
        title: `Acta de atención — ${m.subject}`,
        createdAt: m.createdAt,
        status: m.signedAt ? 'signed' : 'draft',
        downloadUrl: `parent-meetings/${m.id}/acta.pdf`,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return {
      student: {
        id: student.id,
        email: student.email,
        fullName: fullName(student),
        roles: student.userRoles.map((ur) => ur.role.name),
        profile: student.profile,
      },
      enrollments,
      incidents,
      parentMeetings,
      actas,
    }
  }

  /** Matrícula + datos para el certificado de matrícula (PDF). */
  async getEnrollmentForCertificate(studentId: string, enrollmentId: string, institutionId: string) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { id: enrollmentId, studentId, institutionId },
      include: {
        parallel: { include: { level: { select: { name: true } } } },
        academicYear: { select: { name: true, startDate: true, endDate: true } },
        student: { select: personSelect },
        institution: { select: { name: true, settings: true } },
      },
    })
    if (!enrollment) throw new NotFoundError('Matrícula no encontrada')
    return enrollment
  }
}
