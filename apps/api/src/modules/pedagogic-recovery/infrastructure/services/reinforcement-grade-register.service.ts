import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import { extractGradingConfig } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { computePeriodGrades } from '../../../../shared/infrastructure/services/period-grades.service'
import { activityKind, effectiveActivityScore, type InsumoGroupInput } from '../../../../shared/domain/grade-math'
import { applyFormativeReinforcement, validateFormativePolicy } from '../../../../shared/domain/formative-reinforcement'
import { automaticRegisterInput, type RegisterEvidence } from '../../../../shared/domain/reinforcement-register'

type Attendance = 'present' | 'absent' | 'justified'
export interface RegisterCell {
  sessionId: string; studentId: string; score: number | null; status: Attendance
  observation?: string | null
  expected?: { score: number | null; status: Attendance | null }
}
export type RegisterSessionChange = { sessionId: string; remove?: boolean; data?: { date?: string; title?: string; description?: string | null; targetActivityId?: string | null } }

/** Notas, cálculo e historial se confirman juntos. No hay una segunda acción de «aplicar». */
export async function saveReinforcementRegister(institutionId: string, actor: Actor, planId: string, cells: RegisterCell[], sessionChange?: RegisterSessionChange, transaction?: Prisma.TransactionClient) {
  if (!hasPermission(actor, 'grades', 'write', 'own')) throw new ForbiddenError()
  if (!Array.isArray(cells) || cells.length > 5000) throw new BadRequestError('Registro de notas inválido')
  const execute = async (tx: Prisma.TransactionClient) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reinforcement-plan:${institutionId}:${planId}`}))`
    const plan = await tx.reinforcementPlan.findFirst({ where: { id: planId, institutionId, planType: 'academico' }, include: { participants: true, courseAssignment: true } })
    if (!plan) throw new NotFoundError('Plan de refuerzo no encontrado')
    if (plan.courseAssignment.teacherId !== actor.userId && !isAuthority(actor)) throw new ForbiddenError()
    if (plan.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está cerrado')
    const period = await tx.academicPeriod.findFirst({ where: { id: plan.academicPeriodId, academicYearId: plan.courseAssignment.academicYearId, academicYear: { institutionId } }, select: { isClosed: true } })
    if (!period || period.isClosed) throw new ConflictError('El período está cerrado')
    const institution = await tx.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
    const config = extractGradingConfig(institution?.settings)
    const policy = config.formativeReinforcement
    if (!policy.mode && !cells.length && !sessionChange) return { ok: true }
    if (!policy.mode) throw new BadRequestError('La institución debe seleccionar la regla de refuerzo formativo en Configuración de calificación')
    const error = validateFormativePolicy(policy, config.gradingScaleMax)
    if (error) throw new BadRequestError(error)
    const students = [...new Set([plan.studentId, ...plan.participants.map((student) => student.studentId)])].sort()
    for (const studentId of students) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${institutionId}:${studentId}:${plan.courseAssignmentId}:${plan.academicPeriodId}`}))`
    const enrollments = await tx.studentEnrollment.findMany({ where: { institutionId, studentId: { in: students }, parallelId: plan.courseAssignment.parallelId, academicYearId: plan.courseAssignment.academicYearId, status: 'active' }, select: { studentId: true } })
    const enrolled = new Set(enrollments.map((entry) => entry.studentId))
    const sessions = await tx.reinforcementSession.findMany({ where: { institutionId, planId }, include: { attendances: true } })
    const acts = await tx.activity.findMany({ where: { institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, isPublished: true }, orderBy: { id: 'asc' }, include: { activityType: true, grades: { where: { institutionId, studentId: { in: students } } } } })
    const regular = new Set(acts.filter((activity) => activityKind(activity.activityType.code) === 'regular').map((activity) => activity.id))
    const seen = new Set<string>()
    const changes: Array<Record<string, unknown>> = []
    for (const cell of cells) {
      const key = `${cell.studentId}:${cell.sessionId}`
      if (seen.has(key)) throw new BadRequestError('Hay una celda repetida en el registro')
      seen.add(key)
      if (!students.includes(cell.studentId) || !enrolled.has(cell.studentId)) throw new BadRequestError('El estudiante debe participar en el plan y tener matrícula activa')
      if (!['present', 'absent', 'justified'].includes(cell.status) || (cell.score != null && (!Number.isFinite(cell.score) || cell.score < 0 || cell.score > config.gradingScaleMax))) throw new BadRequestError(`Las notas deben estar entre 0 y ${config.gradingScaleMax}`)
      if (cell.status !== 'present' && cell.score != null) throw new BadRequestError('Una ausencia no puede tener calificación')
      const session = sessions.find((entry) => entry.id === cell.sessionId)
      if (!session) throw new BadRequestError('La actividad no pertenece a este plan')
      const old = session.attendances.find((entry) => entry.studentId === cell.studentId)
      if (old?.appliedScore != null || (session.targetActivityId && !regular.has(session.targetActivityId))) throw new ConflictError('Esta actividad usa una mejora individual o sumativa. Revísala en Notas; no se cuenta dos veces en el plan')
      const oldScore = old?.score == null ? null : Number(old.score) * config.gradingScaleMax / Number(old.scoreScaleMax ?? config.gradingScaleMax)
      if (cell.expected && (cell.expected.status !== (old?.status ?? null) || (cell.expected.score == null ? oldScore != null : oldScore == null || Math.abs(cell.expected.score - oldScore) > 0.000001))) throw new ConflictError('Otra persona cambió una de las notas. Actualiza el registro antes de guardar')
      if (policy.mode === 'activity_set' && cell.score != null && !session.targetActivityId) throw new BadRequestError(`Selecciona la actividad original en la columna «${session.title}» antes de calificar`)
      if (oldScore === cell.score && old?.status === cell.status && (cell.observation === undefined || (old.observation ?? null) === cell.observation)) continue
      changes.push({ sessionId: session.id, studentId: cell.studentId, before: { score: oldScore, status: old?.status ?? null }, after: { score: cell.score, status: cell.status } })
      const data = { status: cell.status, score: cell.score, scoreScaleMax: cell.score == null ? null : config.gradingScaleMax, ...(cell.observation !== undefined ? { observation: cell.observation?.trim() || null } : {}) }
      await tx.reinforcementSessionAttendance.upsert({ where: { sessionId_studentId: { sessionId: session.id, studentId: cell.studentId } }, create: { sessionId: session.id, studentId: cell.studentId, ...data }, update: data })
    }
    if (sessionChange) {
      const session = sessions.find((entry) => entry.id === sessionChange.sessionId)
      if (!session) throw new NotFoundError('Actividad no encontrada en este plan')
      if (session.attendances.some((entry) => entry.appliedScore != null)) throw new ConflictError('La actividad ya modificó una nota individual; conserva ese registro')
      if (sessionChange.remove) await tx.reinforcementSession.delete({ where: { id: session.id } })
      else {
        const data = sessionChange.data ?? {}
        if (data.title !== undefined && !data.title.trim()) throw new BadRequestError('La actividad necesita un título')
        if (data.date !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date)))) throw new BadRequestError('Fecha inválida')
        if (data.targetActivityId && !regular.has(data.targetActivityId)) throw new BadRequestError('Selecciona una actividad formativa publicada de esta asignatura y período')
        if (policy.mode === 'activity_set' && data.targetActivityId === null && session.attendances.some((entry) => entry.score != null)) throw new BadRequestError('La actividad calificada debe conservar un vínculo con su actividad original')
        await tx.reinforcementSession.update({ where: { id: session.id }, data: { ...(data.date ? { date: new Date(data.date) } : {}), ...(data.title !== undefined ? { title: data.title.trim().slice(0, 200) } : {}), ...(data.description !== undefined ? { description: data.description?.trim() || null } : {}), ...(data.targetActivityId !== undefined ? { targetActivityId: data.targetActivityId } : {}) } })
      }
      changes.push({ sessionId: session.id, action: sessionChange.remove ? 'delete_activity' : 'update_activity', before: { title: session.title, date: session.date.toISOString(), targetActivityId: session.targetActivityId }, after: sessionChange.data ?? null })
    }
    const allSessions = await tx.reinforcementSession.findMany({ where: { institutionId, plan: { institutionId, planType: 'academico', courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId } }, include: { attendances: { where: { studentId: { in: students } } } }, orderBy: { id: 'asc' } })
    const initial = await computePeriodGrades(institutionId, { assignmentIds: [plan.courseAssignmentId], periodIds: [plan.academicPeriodId], studentIds: students, gradingScaleMax: config.gradingScaleMax, ignoreFormativeApplications: true }, tx)
    for (const studentId of students) {
      if (!enrolled.has(studentId)) continue
      const previous = await tx.formativeReinforcementResult.findFirst({ where: { institutionId, studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
      const groups = new Map<string, InsumoGroupInput>()
      const validIds = new Set<string>()
      for (const activity of acts) {
        const score = effectiveActivityScore(activity.grades.find((grade) => grade.studentId === studentId))
        if (regular.has(activity.id) && score != null) validIds.add(activity.id)
        const id = activity.insumoId ?? 'no-insumo'
        if (!groups.has(id)) groups.set(id, { id, name: id, activities: [] })
        groups.get(id)!.activities.push({ id: activity.id, kind: activityKind(activity.activityType.code), score, maxScore: Number(activity.maxScore) })
      }
      const rows: RegisterEvidence[] = allSessions.flatMap((session) => session.attendances.filter((entry) => entry.studentId === studentId).map((entry) => ({ sessionId: session.id, planId: session.planId, title: session.title, date: session.date.toISOString(), targetActivityId: session.targetActivityId, status: entry.status, score: entry.score == null ? null : Number(entry.score), scoreScaleMax: entry.scoreScaleMax == null ? null : Number(entry.scoreScaleMax), appliedScore: entry.appliedScore == null ? null : Number(entry.appliedScore) })))
      // En modalidad integral, un vínculo a una actividad formativa sin nota sigue siendo válido.
      const { application, evidence } = automaticRegisterInput(policy, config.gradingScaleMax, rows, policy.mode === 'activity_set' ? validIds : regular, previous?.payload as any)
      if (policy.mode === 'activity_set' && cells.some((cell) => cell.studentId === studentId && cell.score != null && !validIds.has(sessions.find((session) => session.id === cell.sessionId)?.targetActivityId ?? ''))) throw new BadRequestError('Registra primero la nota de la actividad original del estudiante')
      if (application.score != null) {
        if (await tx.pedagogicRecovery.findFirst({ where: { institutionId, studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, score: { not: null } }, select: { id: true } })) throw new ConflictError('Existe una recuperación aplicada al total del período. Debe retirarse antes para no contar dos veces la mejora')
        if (policy.mode === 'activity_set' && await tx.manualInsumoAverage.count({ where: { institutionId, studentId, score: { not: null }, insumo: { courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId } } })) throw new ConflictError('Los promedios manuales no permiten calcular el refuerzo por actividades. Revisa la regla institucional o los promedios manuales')
      }
      const base = initial.get(`${studentId}:${plan.courseAssignmentId}:${plan.academicPeriodId}`)
      if (!base || base.insumosBase == null) {
        if (application.score != null) throw new BadRequestError('El estudiante necesita una nota formativa inicial antes de registrar su refuerzo')
        continue
      }
      const adjusted = applyFormativeReinforcement(base, [...groups.values()], application, plan.courseAssignment.examWeight, config.gradingScaleMax)
      const originalActivities = acts.filter((activity) => regular.has(activity.id)).map((activity) => ({ id: activity.id, insumoId: activity.insumoId, score: effectiveActivityScore(activity.grades.find((grade) => grade.studentId === studentId)), maxScore: Number(activity.maxScore) }))
      const calculation = { ...application, evidence, originalActivities, initialFormative: base.insumosBase, adjustedFormative: adjusted.insumosBase, initialTotal: base.total, adjustedTotal: adjusted.total }
      const previousCalculation = (previous?.payload as Record<string, unknown> | undefined)?.calculation
      if (JSON.stringify(previousCalculation) === JSON.stringify(calculation)) continue
      if (!previous && application.score == null && !changes.some((change) => change.studentId === studentId)) continue
      await tx.formativeReinforcementResult.create({ data: { institutionId, studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, planId, recordedBy: actor.userId, reason: 'Cálculo automático al guardar el registro de actividades de refuerzo', createdAt: new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)), payload: { ...calculation, source: 'grade_register', calculation, changes: changes.filter((change) => !change.studentId || change.studentId === studentId) } as unknown as Prisma.InputJsonValue } })
    }
    return { ok: true }
  }
  return transaction ? execute(transaction) : prisma.$transaction(execute, { timeout: 60000 })
}
