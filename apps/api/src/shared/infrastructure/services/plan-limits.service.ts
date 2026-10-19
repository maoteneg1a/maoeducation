import { prisma } from '../database/prisma'
import { ConflictError } from '../../domain/errors/app.errors'

/**
 * Límites del plan contratado (subscriptions.max_students / max_teachers).
 * null = sin límite. Instituciones sin suscripción gestionada no tienen límite.
 */
export async function assertPlanCapacity(
  institutionId: string,
  kind: 'students' | 'teachers',
  adding: number,
): Promise<void> {
  if (adding <= 0) return
  const sub = await prisma.subscription.findUnique({
    where: { institutionId },
    select: { maxStudents: true, maxTeachers: true },
  })
  const max = kind === 'students' ? sub?.maxStudents : sub?.maxTeachers
  if (max == null) return

  const current =
    kind === 'students'
      ? await prisma.studentEnrollment.count({ where: { institutionId, status: 'active', academicYear: { isActive: true } } })
      : await prisma.userRole.count({ where: { user: { institutionId, isActive: true }, role: { name: 'teacher', institutionId } } })

  if (current + adding > max) {
    const label = kind === 'students' ? 'estudiantes matriculados' : 'docentes'
    throw new ConflictError(
      `Tu plan permite hasta ${max} ${label} y ya tienes ${current}. Contacta a Auleka para ampliar el plan.`,
    )
  }
}
