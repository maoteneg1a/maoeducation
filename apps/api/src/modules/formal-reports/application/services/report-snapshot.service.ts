import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { applyDecimals, extractAgreementRules } from '../../../../shared/domain/agreement-rules'
import type { ReportSnapshotSource } from '../../../../shared/domain/reports-flow'
import { computePeriodGrades } from '../../../../shared/infrastructure/services/period-grades.service'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'

export interface SnapshotContext {
  institutionId: string
  studentId: string | null
  parallelId: string | null
  courseAssignmentId: string | null
  academicPeriodId: string | null
  alertId: string | null
  reinforcementPlanId: string | null
}

export interface GradesSnapshotRow {
  subject: string
  teacher: string
  insumos: Array<{ name: string; avg: number | null }>
  formative: number | null
  summative: number | null
  total: number | null
}

const name = (u: { email: string; profile: { firstName: string; lastName: string } | null } | null) =>
  !u ? '' : u.profile ? `${u.profile.firstName} ${u.profile.lastName}`.trim() : u.email

const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

/**
 * Datos que el sistema agrega al informe y que quedan CONGELADOS al enviarlo.
 * Vienen solo del motor de notas y del caso de refuerzo (sin destrezas).
 */
export async function buildSnapshot(source: ReportSnapshotSource, ctx: SnapshotContext): Promise<Record<string, unknown>> {
  const base: Record<string, unknown> = { generatedAt: new Date().toISOString() }
  const [header, alert] = await Promise.all([contextHeader(ctx), ctx.alertId ? alertInfo(ctx) : null])
  Object.assign(base, header)
  if (alert) base.alert = alert
  if (source === 'grades') base.grades = await gradesSnapshot(ctx)
  if (source === 'reinforcement_case') base.reinforcementCase = await caseSnapshot(ctx)
  if (source === 'reinforcement_sessions') base.sessions = await sessionsSnapshot(ctx)
  return base
}

async function contextHeader(ctx: SnapshotContext) {
  const [student, parallel, assignment, period] = await Promise.all([
    ctx.studentId
      ? prisma.user.findFirst({ where: { id: ctx.studentId, institutionId: ctx.institutionId }, select: { email: true, profile: { select: { firstName: true, lastName: true, dni: true } } } })
      : null,
    ctx.parallelId
      ? prisma.parallel.findFirst({ where: { id: ctx.parallelId, institutionId: ctx.institutionId }, select: { name: true, level: { select: { name: true } }, tutor: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } } })
      : null,
    ctx.courseAssignmentId
      ? prisma.courseAssignment.findFirst({ where: { id: ctx.courseAssignmentId, institutionId: ctx.institutionId }, select: { subject: { select: { name: true } }, teacher: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } } })
      : null,
    ctx.academicPeriodId ? prisma.academicPeriod.findFirst({ where: { id: ctx.academicPeriodId }, select: { name: true } }) : null,
  ])
  return {
    student: student ? { name: name(student), dni: student.profile?.dni ?? null } : null,
    parallel: parallel ? { name: `${parallel.level.name} ${parallel.name}`, tutor: name(parallel.tutor) || null } : null,
    subject: assignment ? { name: assignment.subject.name, teacher: name(assignment.teacher) } : null,
    period: period ? { name: period.name } : null,
  }
}

async function alertInfo(ctx: SnapshotContext) {
  const a = await prisma.earlyAlert.findFirst({ where: { id: ctx.alertId!, institutionId: ctx.institutionId } })
  if (!a) return null
  return {
    source: a.source,
    scoreAtDetection: a.scoreAtDetection != null ? Number(a.scoreAtDetection) : null,
    currentScore: a.currentScore != null ? Number(a.currentScore) : null,
    qualitativeCode: a.qualitativeCode,
    detectedAt: iso(a.detectedAt),
    status: a.status,
  }
}

/** Notas del periodo según el motor: una asignatura o todas las del paralelo del estudiante. */
async function gradesSnapshot(ctx: SnapshotContext): Promise<GradesSnapshotRow[]> {
  if (!ctx.studentId || !ctx.academicPeriodId) return []
  const settings = await institutionSettings(ctx.institutionId)
  const rules = extractAgreementRules(settings)
  const gradingScaleMax = ((settings.gradingConfig ?? {}) as { gradingScaleMax?: number }).gradingScaleMax ?? 10
  const assignments = await prisma.courseAssignment.findMany({
    where: {
      institutionId: ctx.institutionId,
      isActive: true,
      ...(ctx.courseAssignmentId ? { id: ctx.courseAssignmentId } : ctx.parallelId ? { parallelId: ctx.parallelId } : { id: '__none__' }),
    },
    select: { id: true, subject: { select: { name: true } }, teacher: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
    orderBy: { subject: { name: 'asc' } },
  })
  const summaries = await computePeriodGrades(ctx.institutionId, {
    assignmentIds: assignments.map((a) => a.id),
    periodIds: [ctx.academicPeriodId],
    studentIds: [ctx.studentId],
    gradingScaleMax,
  })
  const d = (v: number | null) => applyDecimals(v, rules.decimals)
  return assignments.map((a) => {
    const s = summaries.get(`${ctx.studentId}:${a.id}:${ctx.academicPeriodId}`)
    return {
      subject: a.subject.name,
      teacher: name(a.teacher),
      insumos: (s?.insumoAvgs ?? []).map((i) => ({ name: i.name, avg: d(i.avg) })),
      formative: d(s?.insumosBase ?? null),
      summative: d(s?.summativeAvg ?? null),
      total: d(s?.total ?? null),
    }
  })
}

async function caseSnapshot(ctx: SnapshotContext) {
  if (!ctx.reinforcementPlanId) return null
  const p = await prisma.reinforcementPlan.findFirst({
    where: { id: ctx.reinforcementPlanId, institutionId: ctx.institutionId },
    include: {
      communications: { orderBy: { date: 'asc' } },
      commitments: { orderBy: { createdAt: 'asc' } },
      followUps: { orderBy: { date: 'asc' } },
      reevaluations: { orderBy: { date: 'asc' }, include: { outcomes: true } },
      units: { orderBy: { temporalIndex: 'asc' } },
      sessions: { orderBy: { date: 'asc' }, include: { attendances: true } },
    },
  })
  if (!p) return null
  return {
    caseStatus: p.caseStatus,
    cycleNumber: p.cycleNumber,
    detection: {
      source: p.detectionSourceCode,
      observation: p.detectionObservation,
      initialResult: p.detectionInitialResult,
      detectedOn: iso(p.detectedOn),
    },
    learningTarget: p.learningTargetTitle,
    proposal: {
      objective: p.proposalObjective,
      strategy: p.proposalActiveStrategy,
      activity: p.proposalConcreteActivity,
      resource: p.proposalResource,
      evidence: p.proposalEvidence,
      evaluation: p.proposalEvaluation,
      durationFrequency: p.proposalDurationFrequency,
      expectedResult: p.proposalExpectedResult,
    },
    plan: p.units.map((u) => ({ week: u.temporalIndex, phase: u.phase, objective: u.specificObjective, activity: u.concreteActivity })),
    communications: p.communications.map((c) => ({ date: iso(c.date), medium: c.mediumLabel, text: c.institutionalText })),
    commitments: p.commitments.map((c) => ({ label: c.commitmentLabel, responsible: c.responsible, targetDate: iso(c.targetDate), note: c.note })),
    followUps: p.followUps.map((f) => ({ date: iso(f.date), strategy: f.strategyApplied, evidence: f.evidence, observation: f.observation, progress: f.observedProgress })),
    reevaluations: p.reevaluations.map((r) => ({
      date: iso(r.date),
      evaluation: r.evaluation,
      initialResult: r.initialResult,
      subsequentResult: r.subsequentResult,
      decision: r.pedagogicalDecision,
      outcomes: r.outcomes.map((o) => ({ result: o.result, value: o.assessmentValue })),
    })),
    sessions: p.sessions.map((s) => ({
      date: iso(s.date),
      title: s.title,
      attendance: s.attendances.map((a) => ({ status: a.status, score: a.score != null ? Number(a.score) : null, applied: a.appliedScore != null ? Number(a.appliedScore) : null })),
    })),
  }
}

async function sessionsSnapshot(ctx: SnapshotContext) {
  if (!ctx.reinforcementPlanId) return []
  const sessions = await prisma.reinforcementSession.findMany({
    where: { planId: ctx.reinforcementPlanId, institutionId: ctx.institutionId },
    include: { attendances: { include: { student: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } } } },
    orderBy: { date: 'asc' },
  })
  return sessions.map((s) => ({
    date: iso(s.date),
    title: s.title,
    description: s.description,
    attendance: s.attendances.map((a) => ({
      student: name(a.student),
      status: a.status,
      score: a.score != null ? Number(a.score) : null,
      appliedScore: a.appliedScore != null ? Number(a.appliedScore) : null,
      observation: a.observation,
    })),
  }))
}
