import { saveReinforcementRegister, type RegisterCell } from '../services/reinforcement-grade-register.service'
import { Prisma } from '@prisma/client'
import { applyFormativeReinforcement, validateFormativePolicy, type FormativeApplication } from '../../../../shared/domain/formative-reinforcement'
import type { InsumoGroupInput } from '../../../../shared/domain/grade-math'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import crypto from 'crypto'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { average, activityKind, effectiveActivityScore } from '../../../../shared/domain/grade-math'
import { applyDecimals, extractAgreementRules } from '../../../../shared/domain/agreement-rules'
import { extractReportsFlow, type ReportsFlowConfig } from '../../../../shared/domain/reports-flow'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'
import { computePeriodGrades } from '../../../../shared/infrastructure/services/period-grades.service'
import { applyReinforcementToGrade } from '../../../../shared/infrastructure/services/grade-reinforcement.service'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import { storage } from '../../../../shared/infrastructure/services/storage.service'
import { assertUploader } from '../../../formal-reports/infrastructure/repositories/prisma-formal-report.repository'
import { PrismaPedagogicRecoveryRepository } from './prisma-pedagogic-recovery.repository'

const institutionRepo = new PrismaInstitutionRepository()

export interface FormativeResultDto { studentId: string; activityIds: string[]; sessionIds: string[]; reason?: string; revoke?: boolean; expectedResultId?: string | null; expectedPreviewToken?: string }

const legacyRepo = new PrismaPedagogicRecoveryRepository()
const ATTENDANCE = ['present', 'absent', 'justified'] as const
type Attendance = (typeof ATTENDANCE)[number]

const fullName = (u: { email?: string; profile: { firstName: string; lastName: string } | null } | null) =>
  !u ? '' : u.profile ? `${u.profile.lastName} ${u.profile.firstName}`.trim() : u.email ?? ''

export interface ListCasesQuery {
  periodId?: string
  yearId?: string
  parallelId?: string
  courseAssignmentId?: string
  studentId?: string
  caseStatus?: string
}

/**
 * Mesa de consulta del caso de refuerzo: lectura por rol (docente, tutor,
 * autoridad, inspección), archivos del caso, sesiones con asistencia y la nota
 * del motor antes/después. Sin destrezas ni planificación.
 */
export class PrismaReinforcementDeskRepository {
  private async access(institutionId: string, actor: Actor, planId: string) {
    const plan = await prisma.reinforcementPlan.findFirst({
      where: { id: planId, institutionId, planType: 'academico' },
      select: {
        id: true,
        createdBy: true,
        caseStatus: true,
        studentId: true,
        courseAssignmentId: true,
        academicPeriodId: true,
        participants: { select: { studentId: true } },
        courseAssignment: { select: { teacherId: true, parallelId: true, academicYearId: true, parallel: { select: { tutorId: true } } } },
      },
    })
    if (!plan) throw new NotFoundError('Caso de refuerzo no encontrado')
    const isTeacher = plan.courseAssignment.teacherId === actor.userId || plan.createdBy === actor.userId
    const isTutor = plan.courseAssignment.parallel.tutorId === actor.userId
    const readAll = hasPermission(actor, 'reinforcement_cases', 'read', 'all')
    // DECE / otros: solo si recibieron un informe vinculado al caso
    const viaReport = !isTeacher && !isTutor && !readAll
      ? !!(await prisma.formalReport.findFirst({
          where: { institutionId, reinforcementPlanId: planId, status: { not: 'DRAFT' }, recipients: { some: { userId: actor.userId } } },
          select: { id: true },
        }))
      : false
    if (!isTeacher && !isTutor && !readAll && !viaReport) throw new ForbiddenError()
    return { plan, canEdit: isTeacher || isAuthority(actor), isTutor, readAll }
  }

  private studentIdsOf(plan: { studentId: string; participants: Array<{ studentId: string }> }) {
    return [...new Set([plan.studentId, ...plan.participants.map((p) => p.studentId)])]
  }

  async list(institutionId: string, actor: Actor, q: ListCasesQuery) {
    const readAll = hasPermission(actor, 'reinforcement_cases', 'read', 'all')
    const received = readAll ? [] : await prisma.formalReport.findMany({ where: { institutionId, reinforcementPlanId: { not: null }, status: { not: 'DRAFT' }, recipients: { some: { userId: actor.userId } } }, select: { reinforcementPlanId: true } })
    const plans = await prisma.reinforcementPlan.findMany({
      where: {
        institutionId,
        planType: 'academico',
        ...(readAll ? {} : { AND: [{ OR: [{ courseAssignment: { OR: [{ teacherId: actor.userId }, { parallel: { tutorId: actor.userId } }] } }, { id: { in: received.flatMap((report) => report.reinforcementPlanId ? [report.reinforcementPlanId] : []) } }] }] }),
        ...(q.periodId ? { academicPeriodId: q.periodId } : {}),
        ...(q.yearId ? { academicPeriod: { academicYearId: q.yearId } } : {}),
        ...(q.courseAssignmentId ? { courseAssignmentId: q.courseAssignmentId } : {}),
        ...(q.caseStatus ? { caseStatus: q.caseStatus } : {}),
        ...(q.studentId ? { OR: [{ studentId: q.studentId }, { participants: { some: { studentId: q.studentId } } }] } : {}),
        courseAssignment: {
          ...(q.parallelId ? { parallelId: q.parallelId } : {}),

        },
      },
      select: {
        id: true,
        caseStatus: true,
        mode: true,
        cycleNumber: true,
        createdAt: true,
        detectionInitialResult: true,
        learningTargetTitle: true,
        academicPeriod: { select: { id: true, name: true } },
        student: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } },
        participants: { select: { student: { select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } } } },
        courseAssignment: { select: { id: true, teacherId: true, subject: { select: { name: true } }, parallel: { select: { id: true, name: true, tutorId: true, level: { select: { name: true } } } } } },
        _count: { select: { sessions: true, attachments: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    })
    const reports = plans.length
      ? await prisma.formalReport.groupBy({
          by: ['reinforcementPlanId', 'status'],
          where: { institutionId, reinforcementPlanId: { in: plans.map((p) => p.id) } },
          _count: { _all: true },
        })
      : []
    return plans.map((p) => {
      const mine = reports.filter((r) => r.reinforcementPlanId === p.id)
      const students = p.participants.length ? p.participants.map((x) => x.student) : [p.student]
      return {
        id: p.id,
        caseStatus: p.caseStatus,
        mode: p.mode,
        cycleNumber: p.cycleNumber,
        createdAt: p.createdAt,
        learningTarget: p.learningTargetTitle,
        initialResult: p.detectionInitialResult,
        period: p.academicPeriod,
        students: students.map((s) => ({ id: s.id, name: fullName(s) })),
        subject: p.courseAssignment.subject.name,
        parallel: { id: p.courseAssignment.parallel.id, name: `${p.courseAssignment.parallel.level.name} ${p.courseAssignment.parallel.name}` },
        sessions: p._count.sessions,
        attachments: p._count.attachments,
        reports: {
          drafts: mine.filter((r) => r.status === 'DRAFT').reduce((a, r) => a + r._count._all, 0),
          sent: mine.filter((r) => r.status !== 'DRAFT').reduce((a, r) => a + r._count._all, 0),
        },
        canEdit: p.courseAssignment.teacherId === actor.userId || isAuthority(actor),
      }
    })
  }

  /** Notas del motor por participante: al detectar (snapshot) y actual (periodo del caso). */
  private async engineScores(institutionId: string, plan: { courseAssignmentId: string; academicPeriodId: string }, studentIds: string[]) {
    const settings = await institutionSettings(institutionId)
    const rules = extractAgreementRules(settings)
    const gradingScaleMax = ((settings.gradingConfig ?? {}) as { gradingScaleMax?: number }).gradingScaleMax ?? 10
    const summaries = await computePeriodGrades(institutionId, {
      assignmentIds: [plan.courseAssignmentId],
      periodIds: [plan.academicPeriodId],
      studentIds,
      gradingScaleMax,
    })
    const alerts = await prisma.earlyAlert.findMany({
      where: { institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, studentId: { in: studentIds } },
      select: { id: true, studentId: true, scoreAtDetection: true, status: true },
    })
    const d = (v: number | null | undefined) => applyDecimals(v ?? null, rules.decimals)
    return studentIds.map((sId) => {
      const s = summaries.get(`${sId}:${plan.courseAssignmentId}:${plan.academicPeriodId}`)
      const alert = alerts.find((a) => a.studentId === sId)
      return {
        studentId: sId,
        alertId: alert?.id ?? null,
        alertStatus: alert?.status ?? null,
        atDetection: alert?.scoreAtDetection != null ? Number(alert.scoreAtDetection) : null,
        formative: d(s?.insumosBase),
        beforeReinforcement: d(s?.formativeReinforcement?.initial ?? s?.insumosBase),
        reinforcementAverage: d(s?.formativeReinforcement?.result),
        summative: d(s?.summativeAvg),
        total: d(s?.total),
        target: rules.formativeReinforcement.cap,
      }
    })
  }

  async detail(institutionId: string, actor: Actor, planId: string) {
    const { plan, canEdit } = await this.access(institutionId, actor, planId)
    const flow = extractReportsFlow(await institutionSettings(institutionId))
    const gradingConfig = await institutionRepo.getGradingConfig(institutionId)
    const studentIds = this.studentIdsOf(plan)
    const [kase, sessions, attachments, reports, scores, students] = await Promise.all([
      legacyRepo.getReinforcementCase(planId, institutionId),
      prisma.reinforcementSession.findMany({
        where: { planId, institutionId },
        include: { attendances: true },
        orderBy: { date: 'asc' },
      }),
      prisma.reinforcementAttachment.findMany({
        where: { planId, institutionId },
        include: { uploader: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.formalReport.findMany({
        where: { institutionId, reinforcementPlanId: planId, OR: [{ status: { not: 'DRAFT' } }, { authorId: actor.userId }] },
        select: { id: true, folio: true, typeKey: true, typeLabel: true, status: true, sentAt: true, recipientInstanceLabel: true, confidential: true, authorId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.engineScores(institutionId, plan, studentIds),
      prisma.user.findMany({ where: { id: { in: studentIds } }, select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } }),
    ])
    const visible = attachments.filter((a) => this.canSeeAttachment(flow, actor, a))
    const caseReportTypes = flow.reportTypes.filter((t) => t.enabled && !!t.pdfTemplate && (t.requiresReinforcementCase || t.triggeredByAlert))
    return {
      case: kase,
      canEdit,
      students: students.map((s) => ({ id: s.id, name: fullName(s) })),
      scores,
      sessions: sessions.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        title: s.title,
        description: s.description,
        targetActivityId: s.targetActivityId,
        attendances: s.attendances.map((a) => ({
          studentId: a.studentId,
          status: a.status,
          score: a.score != null ? Number(a.score) * (a.scoreScaleMax ? gradingConfig.gradingScaleMax / Number(a.scoreScaleMax) : 1) : null,
          observation: a.observation,
          appliedScore: a.appliedScore != null ? Number(a.appliedScore) : null,
          appliedMode: a.appliedMode,
        })),
      })),
      attachments: visible.map((a) => ({
        id: a.id,
        category: a.category,
        categoryLabel: flow.attachments.categories.find((c) => c.key === a.category)?.label ?? a.category,
        fileName: a.fileName,
        mimeType: a.mimeType,
        fileSize: a.fileSize,
        sessionId: a.sessionId,
        uploadedBy: fullName(a.uploader),
        canDelete: a.uploadedBy === actor.userId || isAuthority(actor),
        createdAt: a.createdAt,
      })),
      reports: reports.filter((report) => flow.reportTypes.some((type) => type.key === report.typeKey && !!type.pdfTemplate)),
      reportTypes: caseReportTypes.map((t) => ({ key: t.key, label: t.label, to: t.to, requiresReinforcementCase: t.requiresReinforcementCase })),
      attachmentConfig: {
        categories: flow.attachments.categories.map((c) => ({ key: c.key, label: c.label })),
        maxSizeMb: flow.attachments.maxSizeMb,
        allowedMime: flow.attachments.allowedMime,
      },
    }
  }

  private canSeeAttachment(flow: ReportsFlowConfig, actor: Actor, a: { uploadedBy: string; category: string }) {
    if (a.uploadedBy === actor.userId || isAuthority(actor)) return true
    const cat = flow.attachments.categories.find((c) => c.key === a.category)
    if (!cat || !cat.visibleToRoles.length) return true
    return actor.roles.some((r) => cat.visibleToRoles.includes(r))
  }

  /** Actividades del caso (asignatura + periodo) con la nota vigente de cada participante. */
  async activities(institutionId: string, actor: Actor, planId: string) {
    const { plan } = await this.access(institutionId, actor, planId)
    const studentIds = this.studentIdsOf(plan)
    const acts = await prisma.activity.findMany({
      where: { institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, isPublished: true },
      select: {
        id: true,
        name: true,
        maxScore: true,
        activityDate: true,
        activityType: { select: { code: true, name: true } },
        insumo: { select: { name: true } },
        grades: { where: { studentId: { in: studentIds } }, select: { studentId: true, score: true, baseScore: true, reinforcementScore: true, reinforcementMode: true } },
      },
      orderBy: [{ activityDate: 'asc' }, { createdAt: 'asc' }],
    })
    return acts.map((a) => ({
      id: a.id,
      name: a.name,
      maxScore: Number(a.maxScore),
      date: a.activityDate?.toISOString().slice(0, 10) ?? null,
      type: a.activityType.name,
      summative: activityKind(a.activityType.code) !== 'regular',
      insumo: a.insumo?.name ?? null,
      grades: a.grades.map((g) => ({
        studentId: g.studentId,
        original: g.baseScore != null ? Number(g.baseScore) : g.score != null ? Number(g.score) : null,
        effective: effectiveActivityScore(g),
        reinforced: g.reinforcementScore != null,
      })),
    }))
  }

  /** La configuración se elige institucionalmente; el docente selecciona evidencias del plan. */
  async formativeOptions(institutionId: string, actor: Actor, planId: string) {
    const { plan, canEdit } = await this.access(institutionId, actor, planId)
    const config = await institutionRepo.getGradingConfig(institutionId)
    const studentIds = this.studentIdsOf(plan)
    const history = await prisma.formativeReinforcementResult.findMany({
      where: { institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, studentId: { in: studentIds } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: { recorder: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
    })
    return { policy: config.formativeReinforcement, scale: config.gradingScaleMax, canApply: canEdit && (plan.courseAssignment.teacherId === actor.userId || isAuthority(actor)) && hasPermission(actor, 'grades', 'write', 'own'), history: history.map(({ recorder, ...row }) => ({ ...row, recordedByName: fullName(recorder) })) }
  }

  private async prepareFormative(institutionId: string, actor: Actor, planId: string, dto: FormativeResultDto) {
    const { plan } = await this.editable(institutionId, actor, planId)
    if (!hasPermission(actor, 'grades', 'write', 'own') || (plan.courseAssignment.teacherId !== actor.userId && !isAuthority(actor))) throw new ForbiddenError()
    if (!this.studentIdsOf(plan).includes(dto.studentId)) throw new BadRequestError('El estudiante no participa en este plan')
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { institutionId, studentId: dto.studentId, parallelId: plan.courseAssignment.parallelId, academicYearId: plan.courseAssignment.academicYearId, status: 'active' }, select: { id: true } })
    if (!enrollment) throw new BadRequestError('El estudiante no tiene matrícula activa en el paralelo y año del plan')
    const legacy = await prisma.pedagogicRecovery.findFirst({ where: { institutionId, studentId: dto.studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, score: { not: null } }, select: { id: true } })
    if (legacy && !dto.revoke) throw new ConflictError('Existe una recuperación aplicada al total del período. Retírala antes de aplicar refuerzo a la base formativa para evitar contar dos veces el proceso.')
    const period = await prisma.academicPeriod.findFirst({ where: { id: plan.academicPeriodId }, select: { isClosed: true } })
    if (!period || period.isClosed) throw new ConflictError('El período está cerrado')
    const config = await institutionRepo.getGradingConfig(institutionId)
    const policy = config.formativeReinforcement
    const policyError = validateFormativePolicy(policy, config.gradingScaleMax)
    if (policyError && !dto.revoke) throw new BadRequestError(policyError)
    if (!dto.revoke && !policy.mode) throw new BadRequestError('La institución debe configurar el refuerzo formativo en su MIEE')
    if (!Array.isArray(dto.activityIds) || !Array.isArray(dto.sessionIds) || dto.activityIds.length > 500 || dto.sessionIds.length > 500) throw new BadRequestError('Selección inválida')
    const activities = await prisma.activity.findMany({
      where: { institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId, isPublished: true },
      include: { activityType: true, grades: { where: { institutionId, studentId: dto.studentId } } },
      orderBy: { id: 'asc' },
    })
    const groups = new Map<string, InsumoGroupInput>()
    for (const a of activities) {
      const key = a.insumoId ?? 'no-insumo'
      if (!groups.has(key)) groups.set(key, { id: key, name: key, activities: [] })
      groups.get(key)!.activities.push({ id: a.id, kind: activityKind(a.activityType.code), score: effectiveActivityScore(a.grades[0]), maxScore: Number(a.maxScore) })
    }
    const ids = [...new Set(dto.activityIds)].sort()
    if (!dto.revoke && policy.mode === 'activity_set') {
      if (!ids.length) throw new BadRequestError('Selecciona las actividades formativas atendidas por el plan')
      for (const id of ids) {
        const a = activities.find((a) => a.id === id)
        if (!a || activityKind(a.activityType.code) !== 'regular' || effectiveActivityScore(a.grades[0]) == null) throw new BadRequestError('Selecciona actividades formativas publicadas con nota del estudiante')
      }
      const manual = await prisma.manualInsumoAverage.count({ where: { institutionId, studentId: dto.studentId, score: { not: null }, insumo: { courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId } } })
      if (manual) throw new ConflictError('El período tiene promedios manuales por insumo. No se puede atribuir el peso de cada actividad; revisa esos promedios antes de aplicar refuerzo por conjunto.')
    }
    const sessions = await prisma.reinforcementSession.findMany({
      where: { institutionId, planId, id: { in: [...new Set(dto.sessionIds)] } },
      include: { attendances: { where: { studentId: dto.studentId } } },
      orderBy: { id: 'asc' },
    })
    if (!dto.revoke && (!sessions.length || sessions.length !== new Set(dto.sessionIds).size)) throw new BadRequestError('Selecciona actividades de refuerzo de este plan')
    const evidence = sessions.map((s) => {
      const a = s.attendances[0]
      const target = s.targetActivityId ? activities.find((x) => x.id === s.targetActivityId) : null
      if (a?.appliedScore != null) throw new ConflictError('Una sesión seleccionada ya modificó una nota individual. Retira esa aplicación antes de incluirla en el resultado del plan.')
      if (s.targetActivityId && (!target || activityKind(target.activityType.code) !== 'regular')) throw new BadRequestError('Las evaluaciones sumativas siguen su procedimiento de mejora individual')
      if (!dto.revoke && (a?.status !== 'present' || a.score == null)) throw new BadRequestError('Cada actividad de refuerzo seleccionada debe tener asistencia y nota del estudiante')
      return { sessionId: s.id, title: s.title, date: s.date.toISOString(), score: a?.score == null ? null : Number(a.score) * (a.scoreScaleMax ? config.gradingScaleMax / Number(a.scoreScaleMax) : 1), sourceScore: a?.score == null ? null : Number(a.score), maxScore: a?.scoreScaleMax ? Number(a.scoreScaleMax) : config.gradingScaleMax }
    })
    const application: FormativeApplication = {
      ...policy,
      gradingScaleMax: config.gradingScaleMax,
      activityIds: policy.mode === 'activity_set' ? ids : [],
      score: dto.revoke ? null : average(evidence.map((e) => e.score)),
    }
    if (application.score != null && (application.score < 0 || application.score > config.gradingScaleMax)) throw new BadRequestError('Hay notas de refuerzo fuera de la escala institucional')
    const summaries = await computePeriodGrades(institutionId, {
      assignmentIds: [plan.courseAssignmentId], periodIds: [plan.academicPeriodId], studentIds: [dto.studentId], gradingScaleMax: config.gradingScaleMax, ignoreFormativeApplications: true,
    })
    const initial = summaries.get(`${dto.studentId}:${plan.courseAssignmentId}:${plan.academicPeriodId}`)
    if (!initial || initial.insumosBase == null) throw new BadRequestError('El estudiante aún no tiene un promedio formativo')
    const assignment = await prisma.courseAssignment.findFirstOrThrow({ where: { id: plan.courseAssignmentId, institutionId }, select: { examWeight: true } })
    const adjusted = applyFormativeReinforcement(initial, [...groups.values()], application, assignment.examWeight, config.gradingScaleMax)
    const originalActivities = [...groups.values()].flatMap((g) => g.activities.map((a) => ({ ...a, insumoId: g.id }))).sort((a, b) => (a.id ?? '').localeCompare(b.id ?? ''))
    const previewToken = crypto.createHash('sha256').update(JSON.stringify({ institutionId, planId, studentId: dto.studentId, application, evidence, originalActivities, initial, adjusted })).digest('hex')
    return { plan, application, evidence, originalActivities, initial, adjusted, previewToken }
  }

  async previewFormative(institutionId: string, actor: Actor, planId: string, dto: FormativeResultDto) {
    const { application, initial, adjusted, previewToken } = await this.prepareFormative(institutionId, actor, planId, dto)
    return { application, previewToken, initial: { formative: initial.insumosBase, total: initial.total }, adjusted: { formative: adjusted.insumosBase, total: adjusted.total } }
  }

  async applyFormative(institutionId: string, actor: Actor, planId: string, dto: FormativeResultDto) {
    if (!dto.reason?.trim() || dto.reason.trim().length < 5 || dto.reason.length > 2000) throw new BadRequestError('Registra un motivo de entre 5 y 2000 caracteres')
    const { plan, application, evidence, originalActivities, initial, adjusted, previewToken } = await this.prepareFormative(institutionId, actor, planId, dto)
    if (dto.expectedPreviewToken !== previewToken) throw new ConflictError('Las notas o la configuración cambiaron. Revisa nuevamente la vista previa antes de aplicar.')
    return prisma.$transaction(async (tx) => {
      const scope = `${institutionId}:${dto.studentId}:${plan.courseAssignmentId}:${plan.academicPeriodId}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`
      const previous = await tx.formativeReinforcementResult.findFirst({
        where: { institutionId, studentId: dto.studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      })
      if ((previous?.id ?? null) !== (dto.expectedResultId ?? null)) throw new ConflictError('El resultado cambió. Actualiza la página y revisa la nueva versión antes de aplicar.')
      return tx.formativeReinforcementResult.create({ data: {
        institutionId, studentId: dto.studentId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId,
        planId, recordedBy: actor.userId, reason: dto.reason!.trim(),
        createdAt: new Date(Math.max(Date.now(), (previous?.createdAt.getTime() ?? 0) + 1)),
        payload: { ...application, evidence, originalActivities, initialFormative: initial.insumosBase, adjustedFormative: adjusted.insumosBase, initialTotal: initial.total, adjustedTotal: adjusted.total } as unknown as Prisma.InputJsonValue,
      } })
    })
  }

  // ─── Sesiones de refuerzo ───────────────────────────────────────────────

  private async editable(institutionId: string, actor: Actor, planId: string) {
    const ctx = await this.access(institutionId, actor, planId)
    if (!ctx.canEdit) throw new ForbiddenError('Solo el docente del caso puede modificarlo')
    return ctx
  }

  private async validateTarget(institutionId: string, plan: { courseAssignmentId: string; academicPeriodId: string }, targetActivityId?: string | null) {
    if (!targetActivityId) return null
    const a = await prisma.activity.findFirst({
      where: { id: targetActivityId, institutionId, courseAssignmentId: plan.courseAssignmentId, academicPeriodId: plan.academicPeriodId },
      select: { id: true },
    })
    if (!a) throw new BadRequestError('La actividad original debe ser de la misma asignatura y periodo del caso')
    return a.id
  }

  async createSession(institutionId: string, actor: Actor, planId: string, dto: { date: string; title: string; description?: string; targetActivityId?: string | null }) {
    const { plan } = await this.editable(institutionId, actor, planId)
    const current = await prisma.reinforcementPlan.findFirstOrThrow({ where: { id: planId, institutionId }, select: { caseStatus: true } })
    if (current.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está cerrado')
    if (!dto.title?.trim()) throw new BadRequestError('La sesión necesita un título')
    if (!dto.date || Number.isNaN(Date.parse(dto.date))) throw new BadRequestError('Fecha inválida')
    const targetActivityId = await this.validateTarget(institutionId, plan, dto.targetActivityId)
    const grading = await institutionRepo.getGradingConfig(institutionId)
    const s = await prisma.reinforcementSession.create({
      data: {
        institutionId,
        planId,
        date: new Date(dto.date),
        title: dto.title.trim().slice(0, 200),
        description: dto.description?.trim() || null,
        targetActivityId,
        createdBy: actor.userId,
        ...(grading.formativeReinforcement.mode ? {} : { attendances: { create: this.studentIdsOf(plan).map((studentId) => ({ studentId, status: 'present' })) } }),
      },
    })
    await prisma.reinforcementPlan.updateMany({ where: { id: planId, institutionId, caseStatus: { in: ['PLANNED', 'CONTINUES_REINFORCEMENT'] } }, data: { caseStatus: 'IN_REINFORCEMENT' } })
    return s
  }

  async updateSession(institutionId: string, actor: Actor, planId: string, sessionId: string, dto: { date?: string; title?: string; description?: string | null; targetActivityId?: string | null }) {
    const { plan } = await this.editable(institutionId, actor, planId)
    if (plan.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está finalizado. Usa «Corregir notas» para habilitar una corrección registrada.')
    const s = await prisma.reinforcementSession.findFirst({ where: { id: sessionId, planId, institutionId }, include: { attendances: true } })
    if (!s) throw new NotFoundError('Sesión no encontrada')
    if (dto.targetActivityId !== undefined && dto.targetActivityId !== s.targetActivityId && s.attendances.some((a) => a.appliedScore != null)) {
      throw new ConflictError('La sesión ya aplicó notas: quítalas antes de cambiar la actividad original')
    }
    const config = await institutionRepo.getGradingConfig(institutionId)
    if (config.formativeReinforcement.mode && !s.attendances.some((a) => a.appliedScore != null)) {
      await saveReinforcementRegister(institutionId, actor, planId, [], { sessionId, data: dto })
      return { id: sessionId }
    }
    const targetActivityId = dto.targetActivityId !== undefined ? await this.validateTarget(institutionId, plan, dto.targetActivityId) : undefined
    return prisma.reinforcementSession.update({
      where: { id: sessionId },
      data: {
        ...(dto.date ? { date: new Date(dto.date) } : {}),
        ...(dto.title !== undefined ? { title: dto.title.trim().slice(0, 200) } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(targetActivityId !== undefined ? { targetActivityId } : {}),
      },
    })
  }

  async deleteSession(institutionId: string, actor: Actor, planId: string, sessionId: string) {
    const { plan } = await this.editable(institutionId, actor, planId)
    if (plan.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está finalizado. Usa «Corregir notas» para habilitar una corrección registrada.')
    const s = await prisma.reinforcementSession.findFirst({ where: { id: sessionId, planId, institutionId }, include: { attendances: true } })
    if (!s) throw new NotFoundError('Sesión no encontrada')
    const config = await institutionRepo.getGradingConfig(institutionId)
    if (config.formativeReinforcement.mode && !s.attendances.some((a) => a.appliedScore != null)) {
      await saveReinforcementRegister(institutionId, actor, planId, [], { sessionId, remove: true })
      return
    }
    // Revierte las notas aplicadas a la actividad original
    if (s.targetActivityId) {
      for (const a of s.attendances.filter((x) => x.appliedScore != null)) {
        await applyReinforcementToGrade({ institutionId, activityId: s.targetActivityId, studentId: a.studentId, reinforcementScore: null, gradedBy: actor.userId })
      }
    }
    await prisma.reinforcementSession.delete({ where: { id: sessionId } })
  }

  /**
   * Guarda asistencia y nota por participante. Si la sesión apunta a una
   * actividad original y el estudiante asistió con nota, se aplica al refuerzo
   * de esa nota con las reglas configuradas (tope, mejora, límites).
   */
  async saveGradeRegister(institutionId: string, actor: Actor, planId: string, cells: RegisterCell[]) {
    await saveReinforcementRegister(institutionId, actor, planId, cells)
    return this.detail(institutionId, actor, planId)
  }

  async saveAttendance(
    institutionId: string,
    actor: Actor,
    planId: string,
    sessionId: string,
    items: Array<{ studentId: string; status: Attendance; score?: number | null; observation?: string | null }>,
  ) {
    const { plan } = await this.editable(institutionId, actor, planId)
    if (plan.caseStatus === 'CLOSED') throw new ConflictError('El seguimiento está finalizado. Usa «Corregir notas» para habilitar una corrección registrada.')
    const s = await prisma.reinforcementSession.findFirst({ where: { id: sessionId, planId, institutionId } })
    if (!s) throw new NotFoundError('Sesión no encontrada')
    const allowed = new Set(this.studentIdsOf(plan))
    for (const it of items ?? []) {
      if (!allowed.has(it.studentId)) throw new BadRequestError('Hay estudiantes que no participan en el caso')
      if (!ATTENDANCE.includes(it.status)) throw new BadRequestError('Estado de asistencia inválido')
      if (it.score != null && (!Number.isFinite(it.score) || it.score < 0)) throw new BadRequestError('Nota inválida')
    }
    const config = await institutionRepo.getGradingConfig(institutionId)
    const target = s.targetActivityId ? await prisma.activity.findFirst({ where: { id: s.targetActivityId, institutionId }, include: { activityType: true } }) : null
    const formative = !!config.formativeReinforcement.mode && (!target || activityKind(target.activityType.code) === 'regular')
    if (formative && items.some((i) => i.score != null && i.score > config.gradingScaleMax)) throw new BadRequestError('La nota supera la escala institucional')
    const old = formative ? await prisma.reinforcementSessionAttendance.findMany({ where: { sessionId, appliedScore: { not: null } } }) : []
    if (formative && !old.length) return this.saveGradeRegister(institutionId, actor, planId, items.map((item) => ({ ...item, sessionId, score: item.status === 'present' ? item.score ?? null : null })))
    if (old.length) throw new ConflictError('Esta sesión ya aplicó notas con el procedimiento anterior. Conserva su registro y crea una sesión nueva para el plan formativo.')
    for (const it of items ?? []) {
      const score = it.status === 'present' && it.score != null ? it.score : null
      let applied: { score: number | null; mode: string | null } = { score: null, mode: null }
      if (s.targetActivityId && !formative) {
        applied = await applyReinforcementToGrade({ institutionId, activityId: s.targetActivityId, studentId: it.studentId, reinforcementScore: score, gradedBy: actor.userId })
      }
      await prisma.reinforcementSessionAttendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: it.studentId } },
        create: {
          sessionId, studentId: it.studentId, status: it.status, score, observation: it.observation?.trim() || null,
          scoreScaleMax: formative && score != null ? config.gradingScaleMax : null,
          appliedScore: s.targetActivityId && !formative && score != null ? applied.score : null,
          appliedMode: s.targetActivityId && !formative && score != null ? applied.mode : null,
        },
        update: {
          status: it.status, score, observation: it.observation?.trim() || null,
          scoreScaleMax: formative && score != null ? config.gradingScaleMax : null,
          appliedScore: s.targetActivityId && !formative && score != null ? applied.score : null,
          appliedMode: s.targetActivityId && !formative && score != null ? applied.mode : null,
        },
      })
    }
    return this.detail(institutionId, actor, planId)
  }

  // ─── Archivos del caso ──────────────────────────────────────────────────

  async addAttachment(institutionId: string, actor: Actor, planId: string, file: { filename: string; mimetype: string; buffer: Buffer }, category: string, sessionId?: string) {
    await this.editable(institutionId, actor, planId)
    const flow = extractReportsFlow(await institutionSettings(institutionId))
    assertUploader(flow, actor)
    if (!flow.attachments.allowedMime.includes(file.mimetype)) throw new BadRequestError('Tipo de archivo no permitido')
    if (file.buffer.length > flow.attachments.maxSizeMb * 1024 * 1024) throw new BadRequestError(`El archivo supera ${flow.attachments.maxSizeMb} MB`)
    const cat = flow.attachments.categories.find((c) => c.key === category)?.key
    if (!cat) throw new BadRequestError('Categoría de archivo no configurada')
    if (sessionId) {
      const s = await prisma.reinforcementSession.findFirst({ where: { id: sessionId, planId, institutionId }, select: { id: true } })
      if (!s) throw new BadRequestError('Sesión inválida')
    }
    const ext = file.filename.includes('.') ? file.filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
    const key = `reinforcement/${crypto.randomUUID()}.${ext}`
    await storage.save(key, file.buffer, file.mimetype)
    await prisma.reinforcementAttachment.create({
      data: { institutionId, planId, sessionId: sessionId ?? null, category: cat, fileName: file.filename.slice(0, 255), storedName: key, mimeType: file.mimetype, fileSize: file.buffer.length, uploadedBy: actor.userId },
    })
    return this.detail(institutionId, actor, planId)
  }

  async attachmentForDownload(institutionId: string, actor: Actor, planId: string, attachmentId: string) {
    await this.access(institutionId, actor, planId)
    const flow = extractReportsFlow(await institutionSettings(institutionId))
    const a = await prisma.reinforcementAttachment.findFirst({ where: { id: attachmentId, planId, institutionId } })
    if (!a) throw new NotFoundError('Archivo no encontrado')
    if (!this.canSeeAttachment(flow, actor, a)) throw new ForbiddenError()
    return a
  }

  async removeAttachment(institutionId: string, actor: Actor, planId: string, attachmentId: string) {
    await this.access(institutionId, actor, planId)
    const a = await prisma.reinforcementAttachment.findFirst({ where: { id: attachmentId, planId, institutionId } })
    if (!a) throw new NotFoundError('Archivo no encontrado')
    if (a.uploadedBy !== actor.userId && !isAuthority(actor)) throw new ForbiddenError()
    await storage.remove(a.storedName)
    await prisma.reinforcementAttachment.delete({ where: { id: attachmentId } })
    return this.detail(institutionId, actor, planId)
  }
}
