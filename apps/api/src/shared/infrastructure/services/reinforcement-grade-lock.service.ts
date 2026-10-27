import type { Prisma } from '@prisma/client'
import { ConflictError } from '../../domain/errors/app.errors'

export async function closedReinforcementPlans(db: Prisma.TransactionClient, institutionId: string, scopes: Array<{ studentId: string; courseAssignmentId: string; academicPeriodId: string; recordedAt?: Date }>) {
  if (!scopes.length) return []
  const plans = await db.reinforcementPlan.findMany({
    where: { institutionId, planType: 'academico', caseStatus: 'CLOSED', OR: scopes.map((scope) => ({ courseAssignmentId: scope.courseAssignmentId, academicPeriodId: scope.academicPeriodId, OR: [{ studentId: scope.studentId }, { participants: { some: { studentId: scope.studentId } } }] })) },
    select: { updatedAt: true, id: true, studentId: true, courseAssignmentId: true, academicPeriodId: true, participants: { select: { studentId: true } } },
    orderBy: { id: 'asc' },
  })
  return plans.filter((plan) => scopes.some((scope) => scope.courseAssignmentId === plan.courseAssignmentId && scope.academicPeriodId === plan.academicPeriodId && (scope.studentId === plan.studentId || plan.participants.some((member) => member.studentId === scope.studentId)) && (!scope.recordedAt || scope.recordedAt <= plan.updatedAt)))
}

export async function assertReinforcementGradesOpen(db: Prisma.TransactionClient, institutionId: string, scopes: Array<{ studentId: string; courseAssignmentId: string; academicPeriodId: string; recordedAt?: Date }>) {
  for (const key of [...new Set(scopes.map((scope) => `${institutionId}:${scope.studentId}:${scope.courseAssignmentId}:${scope.academicPeriodId}`))].sort()) await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
  if ((await closedReinforcementPlans(db, institutionId, scopes)).length) throw new ConflictError('Estas notas tienen un refuerzo finalizado. Abre el seguimiento y pulsa «Corregir notas» antes de modificarlas; la corrección quedará registrada.')
}
