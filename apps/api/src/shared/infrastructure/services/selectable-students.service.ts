import { Prisma } from '@prisma/client'
import { prisma } from '../database/prisma'
import { ForbiddenError } from '../../domain/errors/app.errors'

/** Directorio para formularios: cada estudiante una vez, con sus cursos autorizados. */
export async function listSelectableStudents(institutionId: string, actor: { userId: string; roles: string[] }) {
  const privileged = actor.roles.some((r) => ['admin', 'rector', 'inspector', 'dece', 'autoridad'].includes(r))
  if (!privileged && !actor.roles.includes('teacher')) throw new ForbiddenError()
  const enrollmentWhere: Prisma.StudentEnrollmentWhereInput = {
    institutionId, status: 'active',
    parallel: {
      isActive: true,
      ...(!privileged && { OR: [
        { tutorId: actor.userId },
        { courseAssignments: { some: { institutionId, teacherId: actor.userId, isActive: true } } },
      ] }),
    },
  }
  const students = await prisma.user.findMany({
    where: {
      institutionId, isActive: true, userRoles: { some: { role: { name: 'student' } } },
      ...(!privileged && { studentEnrollments: { some: enrollmentWhere } }),
    },
    select: {
      id: true, profile: { select: { firstName: true, lastName: true, dni: true } },
      studentEnrollments: {
        where: enrollmentWhere,
        select: { parallel: { select: { id: true, name: true, level: { select: { name: true } }, academicYear: { select: { name: true } } } } },
        orderBy: [{ academicYear: { startDate: 'desc' } }, { parallel: { name: 'asc' } }],
      },
    },
    orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
  })
  return students.map((s) => ({
    id: s.id,
    fullName: s.profile ? `${s.profile.firstName} ${s.profile.lastName}`.trim() : '',
    dni: s.profile?.dni ?? null,
    groups: s.studentEnrollments.map(({ parallel: p }) => ({ id: p.id, name: p.name, levelName: p.level.name, yearName: p.academicYear.name })),
  }))
}
