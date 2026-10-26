import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'

export interface StartReinforcementDto {
  alertIds: string[]
  learningTarget: string
  objective?: string
  strategies?: string
  schedule?: string
}

export interface SaveReinforcementPlanDto {
  learningTarget: string
  objective: string
  strategies: string
  resources?: string
  evaluation?: string
  schedule?: string
  notes?: string
  action?: 'save' | 'close' | 'continue'
  outcomes?: Array<{ studentId: string; result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED'; observation?: string; assessmentValue?: string }>
}

/** Art. 10: parte de alertas reales y del criterio docente, sin exigir planificación curricular. */
export async function startReinforcementFromAlerts(institutionId: string, actor: Actor, dto: StartReinforcementDto) {
  if (!hasPermission(actor, 'grades', 'write', 'own')) throw new ForbiddenError()
  const ids = [...new Set(dto.alertIds)].sort()
  if (!ids.length || ids.length > 100) throw new BadRequestError('Selecciona entre 1 y 100 alertas')
  const target = dto.learningTarget?.trim()
  if (!target || target.length < 3 || target.length > 3000) throw new BadRequestError('Describe el aprendizaje a reforzar (entre 3 y 3000 caracteres)')
  return prisma.$transaction(async (tx) => {
    for (const id of ids) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reinforcement-alert:${institutionId}:${id}`}))`
    const alerts = await tx.earlyAlert.findMany({ where: { institutionId, id: { in: ids } }, orderBy: { id: 'asc' } })
    if (alerts.length !== ids.length) throw new NotFoundError('Una de las alertas no está disponible en esta institución')
    const first = alerts[0]
    if (alerts.some((a) => a.courseAssignmentId !== first.courseAssignmentId || a.academicPeriodId !== first.academicPeriodId)) throw new BadRequestError('El plan grupal requiere la misma asignatura y período')
    if (alerts.some((a) => a.status !== 'OPEN')) throw new ConflictError('Solo se inicia refuerzo desde alertas abiertas')
    const assignment = await tx.courseAssignment.findFirst({ where: { id: first.courseAssignmentId, institutionId, isActive: true } })
    if (!assignment) throw new NotFoundError('Asignación no encontrada')
    if (assignment.teacherId !== actor.userId && !isAuthority(actor)) throw new ForbiddenError('Solo el docente de la asignatura o la autoridad puede iniciar este plan')
    const period = await tx.academicPeriod.findFirst({ where: { id: first.academicPeriodId, academicYearId: assignment.academicYearId, academicYear: { institutionId } } })
    if (!period) throw new BadRequestError('El período no corresponde al año de la asignatura')
    if (period.isClosed) throw new ConflictError('El período está cerrado')
    const students = [...new Set(alerts.map((a) => a.studentId))]
    const enrolled = await tx.studentEnrollment.findMany({ where: { institutionId, studentId: { in: students }, parallelId: assignment.parallelId, academicYearId: assignment.academicYearId, status: 'active' } })
    if (new Set(enrolled.map((e) => e.studentId)).size !== students.length) throw new BadRequestError('Todos los participantes necesitan matrícula activa en el paralelo')
    const linked = alerts.map((a) => a.reinforcementPlanId).filter((id): id is string => !!id)
    if (linked.length) {
      if (linked.length === alerts.length && new Set(linked).size === 1) return { id: linked[0], alreadyLinked: true }
      throw new ConflictError('Hay alertas que ya tienen plan. Abre ese seguimiento o selecciona las alertas sin plan.')
    }
    const existing = await tx.reinforcementPlan.findFirst({
      where: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: period.id, planType: 'academico', caseStatus: { not: 'CLOSED' }, OR: [{ studentId: { in: students } }, { participants: { some: { studentId: { in: students } } } }] },
      include: { participants: { select: { studentId: true } } },
    })
    if (existing) {
      const members = new Set([existing.studentId, ...existing.participants.map((p) => p.studentId)])
      if (members.size !== students.length || students.some((id) => !members.has(id))) throw new ConflictError('Un participante ya tiene seguimiento abierto. Vincula el plan existente desde su alerta.')
      await tx.earlyAlert.updateMany({ where: { institutionId, id: { in: ids } }, data: { reinforcementPlanId: existing.id } })
      return { id: existing.id, alreadyLinked: true }
    }
    const plan = await tx.reinforcementPlan.create({ data: {
      institutionId, studentId: students[0], courseAssignmentId: assignment.id, academicPeriodId: period.id,
      planType: 'academico', status: 'activo', caseStatus: 'PLANNED', createdBy: actor.userId,
      mode: students.length > 1 ? 'GROUP' : 'INDIVIDUAL', modeAuthority: 'TEACHER_CONFIRMED',
      detectionSourceCode: 'FORMATIVE_ASSESSMENT', detectionObservation: 'Plan iniciado desde alertas tempranas de bajo desempeño.',
      detectionInitialResult: first.qualitativeCode ?? first.currentScore?.toString() ?? null,
      detectionEvidenceOrigin: 'Alertas tempranas de la asignatura y período', detectedOn: new Date(),
      needCodes: [], learningTargetTitle: target.slice(0, 250), learningTargetDescription: target, learningTargetActivities: [],
      objetivoGeneral: dto.objective?.trim() || null, estrategias: dto.strategies?.trim() || null,
      proposalLearningToReinforce: target, proposalObjective: dto.objective?.trim() || null,
      proposalActiveStrategy: dto.strategies?.trim() || null, proposalDurationFrequency: dto.schedule?.trim() || null,
      reinforcementFrequency: dto.schedule?.trim() || null, proposalAuthority: 'TEACHER_DEFINED', proposalTeacherConfirmed: true,
      participants: { create: students.map((studentId) => ({ studentId })) },
    } })
    await tx.earlyAlert.updateMany({ where: { institutionId, id: { in: ids } }, data: { reinforcementPlanId: plan.id } })
    return { id: plan.id, alreadyLinked: false }
  })
}

/** Guarda la planificación y la decisión docente dentro de la misma ficha. No modifica notas. */
export async function saveReinforcementPlan(institutionId: string, actor: Actor, planId: string, dto: SaveReinforcementPlanDto) {
  if (!hasPermission(actor, 'grades', 'write', 'own')) throw new ForbiddenError()
  if (![dto.learningTarget, dto.objective, dto.strategies].every((s) => typeof s === 'string' && s.trim().length >= 3 && s.length <= 6000)) throw new BadRequestError('Completa aprendizaje, objetivo y estrategias')
  const action = dto.action ?? 'save'
  if (!['save', 'close', 'continue'].includes(action)) throw new BadRequestError('Acción de seguimiento inválida')
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`reinforcement-plan:${institutionId}:${planId}`}))`
    const plan = await tx.reinforcementPlan.findFirst({ where: { id: planId, institutionId, planType: 'academico' }, include: { participants: true, courseAssignment: true } })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    if (plan.courseAssignment.teacherId !== actor.userId && !isAuthority(actor)) throw new ForbiddenError()
    if (plan.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está cerrado')
    const students = [...new Set([plan.studentId, ...plan.participants.map((p) => p.studentId)])]
    if (action !== 'save') {
      if (!dto.notes?.trim() || dto.notes.trim().length < 5) throw new BadRequestError('Registra la conclusión del seguimiento')
      if (!dto.outcomes || dto.outcomes.length !== students.length || new Set(dto.outcomes.map((o) => o.studentId)).size !== students.length || dto.outcomes.some((o) => !students.includes(o.studentId) || !['CONSOLIDATED', 'NOT_CONSOLIDATED'].includes(o.result))) throw new BadRequestError('Registra el resultado de aprendizaje de cada participante')
      const performed = await tx.reinforcementSession.count({ where: { institutionId, planId } })
      if (!performed) throw new ConflictError('Registra las actividades y su seguimiento antes de concluir')
      const allAchieved = dto.outcomes.every((o) => o.result === 'CONSOLIDATED')
      await tx.reinforcementReevaluation.create({ data: {
        planId, createdBy: actor.userId, date: new Date(), evaluation: dto.evaluation?.trim() || 'Valoración docente del plan de refuerzo',
        initialResult: plan.detectionInitialResult, subsequentResult: dto.outcomes.find((o) => o.studentId === plan.studentId)?.assessmentValue?.trim() || null,
        observedProgress: dto.notes.trim(), persistentDifficulty: !allAchieved,
        pedagogicalDecision: action === 'continue' ? 'CONTINUE_REINFORCEMENT' : allAchieved ? 'LEARNING_ACHIEVED' : 'INSTITUTIONAL_FOLLOW_UP',
        outcomes: { create: dto.outcomes.map((o) => ({ studentId: o.studentId, result: o.result, observation: o.observation?.trim() || null, assessmentValue: o.assessmentValue?.trim() || null })) },
      } })
    }
    return tx.reinforcementPlan.update({ where: { id: planId }, data: {
      learningTargetTitle: dto.learningTarget.trim().slice(0, 250), learningTargetDescription: dto.learningTarget.trim(),
      objetivoGeneral: dto.objective.trim(), estrategias: dto.strategies.trim(),
      proposalLearningToReinforce: dto.learningTarget.trim(), proposalObjective: dto.objective.trim(), proposalActiveStrategy: dto.strategies.trim(),
      proposalResource: dto.resources?.trim() || null, proposalEvaluation: dto.evaluation?.trim() || null,
      proposalDurationFrequency: dto.schedule?.trim() || null, reinforcementFrequency: dto.schedule?.trim() || null,
      proposalAuthority: 'TEACHER_DEFINED', proposalTeacherConfirmed: true,
      ...(action !== 'save' ? { observacionesFinales: dto.notes!.trim() } : {}),
      caseStatus: action === 'close' ? 'CLOSED' : action === 'continue' ? 'CONTINUES_REINFORCEMENT' : plan.caseStatus === 'DETECTED' ? 'PLANNED' : plan.caseStatus,
      status: action === 'close' ? 'cerrado' : 'activo',
    } })
  })
}
