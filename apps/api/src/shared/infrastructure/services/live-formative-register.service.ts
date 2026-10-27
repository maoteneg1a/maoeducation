import type { Prisma } from '@prisma/client'
import { extractGradingConfig } from '../../../modules/institution/infrastructure/repositories/prisma-institution.repository'
import { automaticRegisterInput } from '../../domain/reinforcement-register'
import type { FormativeApplication } from '../../domain/formative-reinforcement'
import type { InsumoGroupInput } from '../../domain/grade-math'

/** Las actividades guardadas son la fuente del cálculo. El historial no es un segundo libro de notas. */
export async function mergeLiveFormativeRegister(
  institutionId: string,
  scope: { assignmentIds: string[]; periodIds: string[]; studentIds: string[]; gradingScaleMax: number },
  applications: Map<string, FormativeApplication>,
  groups: Map<string, Map<string, InsumoGroupInput>>,
  db: Prisma.TransactionClient,
) {
  const sessions = await db.reinforcementSession.findMany({
    where: { institutionId, plan: { institutionId, planType: 'academico', courseAssignmentId: { in: scope.assignmentIds }, academicPeriodId: { in: scope.periodIds } } },
    include: { attendances: { where: { studentId: { in: scope.studentIds } } }, plan: { select: { courseAssignmentId: true, academicPeriodId: true, studentId: true, participants: { select: { studentId: true } } } } },
    orderBy: { id: 'asc' },
  })
  if (!sessions.length) return applications
  const institution = await db.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  const policy = extractGradingConfig(institution?.settings).formativeReinforcement
  if (!policy.mode) return applications
  for (const [key, insumos] of groups) {
    const [studentId, assignmentId, periodId] = key.split(':')
    const matching = sessions.filter((session) => session.plan.courseAssignmentId === assignmentId && session.plan.academicPeriodId === periodId && (session.plan.studentId === studentId || session.plan.participants.some((member) => member.studentId === studentId)))
    if (!matching.length) continue
    const previous = applications.get(key)
    // Respeta el peso, tope y escala ya confirmados. Una edición posterior guarda la nueva versión.
    const selectedPolicy = previous?.mode ? previous : policy
    const scale = previous?.gradingScaleMax ?? scope.gradingScaleMax
    const valid = new Set([...insumos.values()].flatMap((insumo) => insumo.activities.filter((activity) => activity.kind === 'regular' && (selectedPolicy.mode !== 'activity_set' || activity.score != null)).flatMap((activity) => activity.id ? [activity.id] : [])))
    const rows = matching.flatMap((session) => session.attendances.filter((attendance) => attendance.studentId === studentId).map((attendance) => ({ sessionId: session.id, planId: session.planId, title: session.title, date: session.date.toISOString(), targetActivityId: session.targetActivityId, status: attendance.status, score: attendance.score == null ? null : Number(attendance.score), scoreScaleMax: attendance.scoreScaleMax == null ? null : Number(attendance.scoreScaleMax), appliedScore: attendance.appliedScore == null ? null : Number(attendance.appliedScore) })))
    const { application } = automaticRegisterInput(selectedPolicy, scale, rows, valid, previous)
    applications.set(key, application)
  }
  return applications
}
