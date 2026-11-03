import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError } from '../../../../shared/domain/errors/app.errors'
import { isPrivilegedStaff } from '../../../../shared/infrastructure/services/teacher-scope.service'

type Actor = { sub: string; institutionId: string; roles: string[] }

/** Un paralelo por curso, independientemente de cuántas materias imparte el docente. */
export async function recipientGroups(actor: Actor, parallelId?: string) {
  const privileged = isPrivilegedStaff(actor.roles)
  if (!privileged && !actor.roles.includes('teacher')) throw new ForbiddenError()
  const groups = await prisma.parallel.findMany({
    where: {
      institutionId: actor.institutionId, isActive: true, academicYear: { isActive: true },
      ...(parallelId && { id: parallelId }),
      ...(!privileged && { OR: [
        { tutorId: actor.sub },
        { courseAssignments: { some: { institutionId: actor.institutionId, teacherId: actor.sub, isActive: true } } },
      ] }),
    },
    select: { id: true, name: true, academicYearId: true, academicYear: { select: { name: true } }, level: { select: { name: true } } },
    orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
  })
  if (parallelId && groups.length === 0) throw new ForbiddenError('No tienes acceso a este paralelo')
  return groups
}

export async function classRecipientIds(actor: Actor, parallelId?: string, audience?: string) {
  const groups = await recipientGroups(actor, parallelId)
  if (groups.length === 0) return []
  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      institutionId: actor.institutionId, status: 'active',
      OR: groups.map((g) => ({ parallelId: g.id, academicYearId: g.academicYearId })),
    },
    select: { studentId: true, student: { select: { studentGuardians: { select: { guardianId: true } } } } },
  })
  const students = audience === 'guardians' ? [] : enrollments.map((e) => e.studentId)
  const guardians = audience === 'students' ? [] : enrollments.flatMap((e) => e.student.studentGuardians.map((g) => g.guardianId))
  return [...new Set([...students, ...guardians])].filter((id) => id !== actor.sub)
}
