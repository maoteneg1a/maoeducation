import { prisma } from '../database/prisma'
import { ForbiddenError, NotFoundError } from '../../domain/errors/app.errors'

/** Todos los hijos vinculados a un representante, con contexto de matrícula activa. */
export async function getGuardianChildren(guardianId: string) {
  const links = await prisma.guardianStudent.findMany({
    where: { guardianId },
    select: {
      relationship: true,
      isPrimary: true,
      student: {
        select: {
          id: true,
          profile: { select: { firstName: true, lastName: true, dni: true } },
          studentEnrollments: {
            where: { status: 'active' },
            take: 1,
            include: {
              parallel: { include: { level: { select: { name: true } } } },
              academicYear: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }, { studentId: 'asc' }],
  })

  return links.map((l) => {
    const enrollment = l.student.studentEnrollments[0]
    return {
      id: l.student.id,
      fullName: l.student.profile
        ? `${l.student.profile.lastName} ${l.student.profile.firstName}`
        : '—',
      dni: l.student.profile?.dni ?? null,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      parallel: enrollment
        ? `${enrollment.parallel.level.name} "${enrollment.parallel.name}"`
        : null,
      academicYear: enrollment?.academicYear.name ?? null,
    }
  })
}

/**
 * Resuelve qué estudiante debe ver el representante.
 * - Si pasa studentId: valida que sea uno de sus hijos.
 * - Si no pasa studentId: usa el primero (para padres con un solo hijo).
 * - Si no tiene hijos vinculados: lanza NotFoundError.
 */
export async function resolveGuardianStudentId(
  guardianId: string,
  requestedStudentId?: string,
): Promise<string> {
  const links = await prisma.guardianStudent.findMany({
    where: { guardianId },
    select: { studentId: true },
    orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }, { studentId: 'asc' }],
  })

  if (links.length === 0) throw new NotFoundError('No tienes alumnos vinculados')

  if (requestedStudentId) {
    if (!links.some((l) => l.studentId === requestedStudentId)) throw new ForbiddenError()
    return requestedStudentId
  }

  return links[0].studentId
}
