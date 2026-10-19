import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateParentMeetingDto,
  ListParentMeetingsQuery,
  UpdateParentMeetingDto,
} from '../../application/dtos/parent-meeting.dto'

const personSelect = {
  id: true,
  profile: { select: { firstName: true, lastName: true, dni: true } },
}

const listRelations = {
  student: { select: personSelect },
  recorder: { select: personSelect },
}

function fullName(
  p: { profile: { firstName: string; lastName: string } | null } | null,
  fallback = '',
): string {
  if (!p?.profile) return fallback
  return `${p.profile.firstName} ${p.profile.lastName}`.trim()
}

/** Actor autenticado, derivado del JWT (req.user). */
export interface ParentMeetingActor {
  userId: string
  roles: string[]
  permissions: string[]
}

export class PrismaParentMeetingRepository {
  // ─── Scope (visibilidad) ─────────────────────────────────────────────────
  /**
   * ¿El actor puede ver TODAS las atenciones de la institución?
   * admin, o cualquier permiso de parent_meetings con scope `all`.
   */
  private hasAllScope(actor: ParentMeetingActor): boolean {
    if (actor.roles.includes('admin') || actor.roles.includes('rector')) return true
    return actor.permissions.some((p) => {
      const [resource, action, scope] = p.split(':')
      const resourceMatch = resource === 'parent_meetings' || resource === '*'
      const actionMatch = action === 'read' || action === 'write' || action === 'manage'
      return resourceMatch && actionMatch && scope === 'all'
    })
  }

  /** Condición Prisma para scope `own`: solo lo que el actor registró. */
  private ownScopeWhere(actor: ParentMeetingActor): Prisma.ParentMeetingWhereInput {
    return { recordedBy: actor.userId }
  }

  // ─── Estudiantes seleccionables ───────────────────────────────────────────
  /**
   * Estudiantes que el actor puede asociar a una atención (selector del form):
   * - admin/inspector/dece/rector → todos los estudiantes de la institución.
   * - teacher → solo los matriculados en los paralelos de sus asignaciones.
   */
  async listSelectableStudents(
    institutionId: string,
    actor: { userId: string; roles: string[] },
  ): Promise<Array<{ id: string; fullName: string; dni: string | null }>> {
    const isAdminLike = actor.roles.some((r) =>
      ['admin', 'inspector', 'dece', 'rector', 'autoridad'].includes(r),
    )

    let students: Array<{
      id: string
      profile: { firstName: string; lastName: string; dni: string | null } | null
    }>

    if (isAdminLike) {
      students = await prisma.user.findMany({
        where: { institutionId, userRoles: { some: { role: { name: 'student' } } } },
        select: personSelect,
      })
    } else {
      const assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, teacherId: actor.userId },
        select: { parallelId: true, academicYearId: true },
      })
      if (assignments.length === 0) return []

      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          institutionId,
          OR: assignments.map((a) => ({ parallelId: a.parallelId, academicYearId: a.academicYearId })),
        },
        select: { student: { select: personSelect } },
      })
      const byId = new Map(enrollments.map((e) => [e.student.id, e.student]))
      students = [...byId.values()]
    }

    return students
      .map((s) => ({ id: s.id, fullName: fullName(s), dni: s.profile?.dni ?? null }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }

  // ─── Atenciones (bitácora) ────────────────────────────────────────────────

  async list(institutionId: string, query: ListParentMeetingsQuery, actor: ParentMeetingActor) {
    const scopeWhere = this.hasAllScope(actor) ? {} : this.ownScopeWhere(actor)

    return prisma.parentMeeting.findMany({
      where: {
        institutionId,
        ...(query.studentId && { studentId: query.studentId }),
        ...((query.from || query.to) && {
          meetingDate: {
            ...(query.from && { gte: new Date(query.from) }),
            ...(query.to && { lte: new Date(query.to) }),
          },
        }),
        ...scopeWhere,
      },
      include: listRelations,
      orderBy: [{ meetingDate: 'desc' }, { createdAt: 'desc' }],
    })
  }

  async create(institutionId: string, dto: CreateParentMeetingDto, recordedBy: string) {
    if (dto.studentId) {
      const student = await prisma.user.findFirst({ where: { id: dto.studentId, institutionId } })
      if (!student) throw new NotFoundError('Estudiante no encontrado')
    }

    return prisma.parentMeeting.create({
      data: {
        institutionId,
        studentId: dto.studentId ?? null,
        recordedBy,
        meetingDate: new Date(dto.meetingDate),
        meetingTime: dto.meetingTime ?? null,
        visitorName: dto.visitorName,
        visitorRelation: dto.visitorRelation ?? null,
        subject: dto.subject,
        details: dto.details,
        agreements: dto.agreements ?? null,
      },
      include: listRelations,
    })
  }

  async getById(id: string, institutionId: string, actor?: ParentMeetingActor) {
    const meeting = await prisma.parentMeeting.findFirst({
      where: { id, institutionId },
      include: listRelations,
    })
    if (!meeting) throw new NotFoundError('Atención no encontrada')

    // Scope `own`: solo se puede ver el detalle de una atención propia.
    if (actor && !this.hasAllScope(actor) && meeting.recordedBy !== actor.userId) {
      throw new NotFoundError('Atención no encontrada')
    }
    return meeting
  }

  async update(id: string, institutionId: string, dto: UpdateParentMeetingDto) {
    await this.ensureExists(id, institutionId)
    if (dto.studentId) {
      const student = await prisma.user.findFirst({ where: { id: dto.studentId, institutionId } })
      if (!student) throw new NotFoundError('Estudiante no encontrado')
    }

    return prisma.parentMeeting.update({
      where: { id },
      data: {
        ...(dto.studentId !== undefined && { studentId: dto.studentId }),
        ...(dto.meetingDate !== undefined && { meetingDate: new Date(dto.meetingDate) }),
        ...(dto.meetingTime !== undefined && { meetingTime: dto.meetingTime }),
        ...(dto.visitorName !== undefined && { visitorName: dto.visitorName }),
        ...(dto.visitorRelation !== undefined && { visitorRelation: dto.visitorRelation }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.details !== undefined && { details: dto.details }),
        ...(dto.agreements !== undefined && { agreements: dto.agreements }),
      },
      include: listRelations,
    })
  }

  async delete(id: string, institutionId: string) {
    await this.ensureExists(id, institutionId)
    await prisma.parentMeeting.delete({ where: { id } })
  }

  async setSignature(id: string, institutionId: string, signatureKey: string) {
    await this.ensureExists(id, institutionId)
    return prisma.parentMeeting.update({
      where: { id },
      data: { signatureKey, signedAt: new Date() },
      include: listRelations,
    })
  }

  /** Carga la atención + datos necesarios para generar el acta PDF. */
  async getForActaPdf(id: string, institutionId: string) {
    const meeting = await prisma.parentMeeting.findFirst({
      where: { id, institutionId },
      include: {
        student: { select: personSelect },
        recorder: { select: personSelect },
        institution: { select: { name: true, settings: true } },
      },
    })
    if (!meeting) throw new NotFoundError('Atención no encontrada')
    return meeting
  }

  private async ensureExists(id: string, institutionId: string) {
    const existing = await prisma.parentMeeting.findFirst({ where: { id, institutionId } })
    if (!existing) throw new NotFoundError('Atención no encontrada')
    return existing
  }
}
