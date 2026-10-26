import type { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  AGREEMENT_00082A_VALUE_SCALE,
  applyDecimals,
  extractAgreementRules,
  isAlertScore,
  type AgreementRules,
} from '../../../../shared/domain/agreement-rules'
import { toQualitativeCode, type QualitativeBand } from '../../../../shared/domain/grade-math'
import { extractReportsFlow } from '../../../../shared/domain/reports-flow'
import { computePeriodGrades } from '../../../../shared/infrastructure/services/period-grades.service'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import type {
  EarlyAlertItemDto,
  EarlyAlertStatus,
  ListEarlyAlertsQuery,
} from '../../application/dtos/early-alert.dto'

type AssignmentRow = {
  id: string
  teacherId: string
  parallelId: string
  subject: { name: string }
  teacher: { email: string; profile: { firstName: string; lastName: string } | null }
  parallel: { id: string; name: string; tutorId: string | null; level: { name: string; subnivel: string | null } }
}

const personName = (u: { email: string; profile: { firstName: string; lastName: string } | null }) =>
  u.profile ? `${u.profile.lastName} ${u.profile.firstName}`.trim() : u.email

/**
 * Alertas tempranas de bajo desempeño (art. 10). Se calculan SOLO con el motor
 * de notas — sin destrezas ni planificación — y con las reglas parametrizadas de
 * la institución (rango, fuente formativa/total, escala cualitativa, subniveles).
 */
export class PrismaEarlyAlertRepository {
  private canSeeAll(actor: Actor) {
    return hasPermission(actor, 'early_alerts', 'read', 'all')
  }

  /** Asignaciones visibles: todas (read:all) o las propias como docente o como tutor del paralelo. */
  private async scopedAssignments(institutionId: string, actor: Actor, yearId: string, q: { parallelId?: string; courseAssignmentId?: string }) {
    return prisma.courseAssignment.findMany({
      where: {
        institutionId,
        academicYearId: yearId,
        isActive: true,
        ...(q.parallelId ? { parallelId: q.parallelId } : {}),
        ...(q.courseAssignmentId ? { id: q.courseAssignmentId } : {}),
        ...(this.canSeeAll(actor) ? {} : { OR: [{ teacherId: actor.userId }, { parallel: { tutorId: actor.userId } }] }),
      },
      select: {
        id: true,
        teacherId: true,
        parallelId: true,
        subject: { select: { name: true } },
        teacher: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } },
        parallel: { select: { id: true, name: true, tutorId: true, level: { select: { name: true, subnivel: true } } } },
      },
      orderBy: [{ parallel: { name: 'asc' } }, { subject: { name: 'asc' } }],
    }) as Promise<AssignmentRow[]>
  }

  private async period(institutionId: string, periodId: string) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: periodId, academicYear: { institutionId } },
      select: { id: true, name: true, isClosed: true, academicYearId: true },
    })
    if (!period) throw new NotFoundError('Periodo no encontrado')
    return period
  }

  /**
   * Recalcula las alertas de las asignaciones dadas en el periodo:
   * abre las nuevas, actualiza la nota actual, resuelve las que salieron del
   * rango y reabre las resueltas que volvieron a caer. Las descartadas se respetan.
   */
  async scan(
    institutionId: string,
    period: { id: string; isClosed: boolean; academicYearId: string },
    assignments: AssignmentRow[],
    rules: AgreementRules,
    gradingScaleMax: number,
    valueScale: QualitativeBand[],
  ) {
    if (!assignments.length) return
    if (rules.earlyAlert.moment === 'period_close' && !period.isClosed) return

    const parallelIds = [...new Set(assignments.map((a) => a.parallelId))]
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, academicYearId: period.academicYearId, parallelId: { in: parallelIds }, status: 'active' },
      select: { studentId: true, parallelId: true },
    })
    const studentsByParallel = new Map<string, string[]>()
    for (const e of enrollments) {
      studentsByParallel.set(e.parallelId, [...(studentsByParallel.get(e.parallelId) ?? []), e.studentId])
    }
    const summaries = await computePeriodGrades(institutionId, {
      assignmentIds: assignments.map((a) => a.id),
      periodIds: [period.id],
      studentIds: enrollments.map((e) => e.studentId),
      gradingScaleMax,
    })
    const existing = await prisma.earlyAlert.findMany({
      where: { institutionId, academicPeriodId: period.id, courseAssignmentId: { in: assignments.map((a) => a.id) } },
    })
    const existingByKey = new Map(existing.map((e) => [`${e.studentId}:${e.courseAssignmentId}`, e]))

    const creates: Prisma.EarlyAlertCreateManyInput[] = []
    const updates: ReturnType<typeof prisma.earlyAlert.update>[] = []
    const now = new Date()
    for (const a of assignments) {
      const sub = a.parallel.level.subnivel ?? ''
      if (rules.earlyAlert.excludedSubniveles.includes(sub as never)) continue
      const qualitative = rules.earlyAlert.qualitativeSubniveles.includes(sub as never)
      for (const sId of studentsByParallel.get(a.parallelId) ?? []) {
        const summary = summaries.get(`${sId}:${a.id}:${period.id}`)
        const raw = summary ? (rules.earlyAlert.source === 'formative' ? summary.insumosBase : summary.total) : null
        if (raw == null) continue // sin notas: no se abre ni se resuelve nada
        const score = applyDecimals((raw * 10) / gradingScaleMax, rules.decimals) as number
        const code = qualitative ? toQualitativeCode(score, valueScale) : null
        const inAlert = qualitative ? !!code && rules.earlyAlert.qualitativeCodes.includes(code) : isAlertScore(rules, score)
        const prev = existingByKey.get(`${sId}:${a.id}`)
        if (!prev) {
          if (inAlert) {
            creates.push({
              institutionId,
              studentId: sId,
              courseAssignmentId: a.id,
              academicPeriodId: period.id,
              academicYearId: period.academicYearId,
              source: rules.earlyAlert.source,
              scoreAtDetection: score,
              currentScore: score,
              qualitativeCode: code,
            })
          }
          continue
        }
        if (prev.status === 'DISMISSED') {
          updates.push(prisma.earlyAlert.update({ where: { id: prev.id }, data: { currentScore: score, qualitativeCode: code } }))
          continue
        }
        const nextStatus: EarlyAlertStatus = inAlert ? 'OPEN' : 'RESOLVED'
        const changed = nextStatus !== prev.status || Number(prev.currentScore ?? -1) !== score || prev.qualitativeCode !== code
        if (!changed) continue
        updates.push(prisma.earlyAlert.update({
          where: { id: prev.id },
          data: {
            currentScore: score,
            qualitativeCode: code,
            status: nextStatus,
            resolvedAt: nextStatus === 'RESOLVED' ? (prev.resolvedAt ?? now) : null,
          },
        }))
      }
    }
    // skipDuplicates: dos consultas simultáneas no deben chocar con la unique (estudiante, asignación, periodo)
    if (creates.length || updates.length) {
      await prisma.$transaction([prisma.earlyAlert.createMany({ data: creates, skipDuplicates: true }), ...updates])
    }
  }

  async list(institutionId: string, actor: Actor, q: ListEarlyAlertsQuery) {
    if (!q.periodId) throw new BadRequestError('Se requiere el periodo')
    const period = await this.period(institutionId, q.periodId)
    const settings = await institutionSettings(institutionId)
    const rules = extractAgreementRules(settings)
    const flow = extractReportsFlow(settings)
    const gc = (settings.gradingConfig ?? {}) as { gradingScaleMax?: number; qualitativeValueScale?: QualitativeBand[] }
    const gradingScaleMax = gc.gradingScaleMax ?? 10
    const valueScale = gc.qualitativeValueScale?.length ? gc.qualitativeValueScale : AGREEMENT_00082A_VALUE_SCALE

    const assignments = await this.scopedAssignments(institutionId, actor, period.academicYearId, q)
    await this.scan(institutionId, period, assignments, rules, gradingScaleMax, valueScale)

    const byId = new Map(assignments.map((a) => [a.id, a]))
    const alerts = await prisma.earlyAlert.findMany({
      where: {
        institutionId,
        academicPeriodId: period.id,
        courseAssignmentId: { in: assignments.map((a) => a.id) },
        ...(q.studentId ? { studentId: q.studentId } : {}),
        ...(q.status && q.status !== 'all' ? { status: q.status } : q.status === 'all' ? {} : { status: 'OPEN' }),
      },
      include: { student: { select: { email: true, profile: { select: { firstName: true, lastName: true, dni: true } } } } },
      orderBy: [{ detectedAt: 'asc' }],
    })

    const alertIds = alerts.map((a) => a.id)
    const alertTypes = flow.reportTypes.filter((t) => t.enabled && t.triggeredByAlert)
    const [reports, plans] = await Promise.all([
      alertIds.length
        ? prisma.formalReport.findMany({
            where: { institutionId, alertId: { in: alertIds } },
            select: { alertId: true, typeKey: true, status: true, createdAt: true },
            orderBy: { createdAt: 'asc' },
          })
        : [],
      prisma.reinforcementPlan.findMany({
        where: { institutionId, id: { in: alerts.map((a) => a.reinforcementPlanId).filter((x): x is string => !!x) } },
        select: { id: true, caseStatus: true },
      }),
    ])
    const planById = new Map(plans.map((p) => [p.id, p]))
    const reportsByAlert = new Map<string, typeof reports>()
    for (const r of reports) reportsByAlert.set(r.alertId!, [...(reportsByAlert.get(r.alertId!) ?? []), r])

    const items: EarlyAlertItemDto[] = alerts.map((al) => {
      const a = byId.get(al.courseAssignmentId)!
      const rs = reportsByAlert.get(al.id) ?? []
      const plan = al.reinforcementPlanId ? planById.get(al.reinforcementPlanId) ?? null : null
      return {
        id: al.id,
        status: al.status as EarlyAlertStatus,
        source: al.source,
        scoreAtDetection: al.scoreAtDetection != null ? Number(al.scoreAtDetection) : null,
        currentScore: al.currentScore != null ? Number(al.currentScore) : null,
        qualitativeCode: al.qualitativeCode,
        detectedAt: al.detectedAt.toISOString(),
        resolvedAt: al.resolvedAt?.toISOString() ?? null,
        dismissedReason: al.dismissedReason,
        student: {
          id: al.studentId,
          name: al.student.profile ? `${al.student.profile.lastName} ${al.student.profile.firstName}` : al.student.email,
          dni: al.student.profile?.dni ?? null,
        },
        assignment: { id: a.id, subjectName: a.subject.name, teacherId: a.teacherId, teacherName: personName(a.teacher) },
        parallel: { id: a.parallel.id, name: a.parallel.name, levelName: a.parallel.level.name, tutorId: a.parallel.tutorId },
        reinforcementCase: plan ? { id: plan.id, caseStatus: plan.caseStatus } : null,
        reports: alertTypes.map((t) => {
          const mine = rs.filter((r) => r.typeKey === t.key)
          const sent = mine.filter((r) => r.status !== 'DRAFT')
          return { typeKey: t.key, label: t.label, sent: sent.length, drafts: mine.length - sent.length, lastStatus: sent.at(-1)?.status ?? null }
        }),
        canStartReinforcement: al.status === 'OPEN' && !plan && !period.isClosed && hasPermission(actor, 'grades', 'write', 'own') && (a.teacherId === actor.userId || isAuthority(actor)),
        canAct: this.canSeeAll(actor) || a.teacherId === actor.userId || a.parallel.tutorId === actor.userId,
      }
    })

    return {
      period: { id: period.id, name: period.name, isClosed: period.isClosed },
      rules: {
        source: rules.earlyAlert.source,
        moment: rules.earlyAlert.moment,
        range: [rules.earlyAlert.quantitativeMin, rules.earlyAlert.quantitativeMax],
        qualitativeCodes: rules.earlyAlert.qualitativeCodes,
      },
      reportTypes: alertTypes.map((t) => ({ key: t.key, label: t.label, to: t.to })),
      items,
    }
  }

  /** Resumen por paralelo para la autoridad: abiertas, con y sin informe enviado. */
  async summary(institutionId: string, actor: Actor, periodId: string) {
    if (!this.canSeeAll(actor)) throw new ForbiddenError()
    const data = await this.list(institutionId, actor, { periodId, status: 'OPEN' })
    const byParallel = new Map<string, { parallelId: string; parallel: string; open: number; withoutReports: number; withCase: number }>()
    for (const it of data.items) {
      const k = it.parallel.id
      const row = byParallel.get(k) ?? { parallelId: k, parallel: `${it.parallel.levelName} ${it.parallel.name}`, open: 0, withoutReports: 0, withCase: 0 }
      row.open++
      if (it.reports.every((r) => r.sent === 0)) row.withoutReports++
      if (it.reinforcementCase) row.withCase++
      byParallel.set(k, row)
    }
    return { period: data.period, parallels: [...byParallel.values()] }
  }

  private async getActionable(institutionId: string, actor: Actor, id: string) {
    const alert = await prisma.earlyAlert.findFirst({
      where: { id, institutionId },
    })
    if (!alert) throw new NotFoundError('Alerta no encontrada')
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: alert.courseAssignmentId, institutionId },
      select: { teacherId: true, parallel: { select: { tutorId: true } } },
    })
    const ok = this.canSeeAll(actor) || assignment?.teacherId === actor.userId || assignment?.parallel.tutorId === actor.userId
    if (!ok) throw new ForbiddenError()
    return alert
  }

  async dismiss(institutionId: string, actor: Actor, id: string, reason: string) {
    if (!reason?.trim()) throw new BadRequestError('Indica el motivo para descartar la alerta')
    await this.getActionable(institutionId, actor, id)
    return prisma.earlyAlert.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedReason: reason.trim(), dismissedBy: actor.userId },
    })
  }

  async reopen(institutionId: string, actor: Actor, id: string) {
    await this.getActionable(institutionId, actor, id)
    return prisma.earlyAlert.update({
      where: { id },
      data: { status: 'OPEN', dismissedReason: null, dismissedBy: null, resolvedAt: null },
    })
  }

  /** Vincula un caso de refuerzo del mismo estudiante, asignación y periodo. */
  async linkCase(institutionId: string, actor: Actor, id: string, planId: string) {
    const alert = await this.getActionable(institutionId, actor, id)
    const plan = await prisma.reinforcementPlan.findFirst({
      where: {
        id: planId,
        institutionId,
        courseAssignmentId: alert.courseAssignmentId,
        academicPeriodId: alert.academicPeriodId,
        OR: [{ studentId: alert.studentId }, { participants: { some: { studentId: alert.studentId } } }],
      },
      select: { id: true },
    })
    if (!plan) throw new BadRequestError('El caso de refuerzo no corresponde a este estudiante, asignatura y periodo')
    return prisma.earlyAlert.update({ where: { id }, data: { reinforcementPlanId: plan.id } })
  }
}
