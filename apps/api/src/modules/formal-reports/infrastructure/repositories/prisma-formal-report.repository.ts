import { captureDocumentSignature, getOwnSignature, type DocumentSignatureImage } from '../../../users/application/services/user-signature.service'
import { withDocumentDateDefault } from '../../application/services/report-content-defaults'
import { withPlanReportDefaults, type PlanReportDefaults } from '../../application/services/plan-report-defaults'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { extractReportsFlow, type ReportTypeConfig, type ReportsFlowConfig } from '../../../../shared/domain/reports-flow'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import { sendPushToUser } from '../../../../shared/infrastructure/services/push.service'
import { groupedReportNotification } from '../../application/services/grouped-report-notification'
import { storage } from '../../../../shared/infrastructure/services/storage.service'
import { resolveInstanceUsers } from '../../application/services/report-recipients.service'
import { buildSnapshot } from '../../application/services/report-snapshot.service'
import { PrismaEarlyAlertRepository } from '../../../early-alerts/infrastructure/repositories/prisma-early-alert.repository'
import type {
  CreateFormalReportDto,
  FormalReportStatus,
  ListFormalReportsQuery,
} from '../../application/dtos/formal-report.dto'

const personSelect = { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } as const
type Person = { id: string; email: string; profile: { firstName: string; lastName: string } | null }
export const personName = (u: Person | null | undefined) =>
  !u ? '' : u.profile ? `${u.profile.firstName} ${u.profile.lastName}`.trim() : u.email

const reportInclude = {
  author: { select: personSelect },
  student: { select: { ...personSelect, profile: { select: { firstName: true, lastName: true, dni: true } } } },
  recipients: { include: { user: { select: personSelect } } },
  attachments: { orderBy: { createdAt: 'asc' as const } },
  parentReport: { select: { id: true, folio: true, typeLabel: true } },
  derived: { select: { id: true, folio: true, typeLabel: true, status: true, recipientInstanceLabel: true } },
} satisfies Prisma.FormalReportInclude

type ReportRow = Prisma.FormalReportGetPayload<{ include: typeof reportInclude }>

function hashContent(content: unknown, snapshot: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify({ content, snapshot })).digest('hex')
}

/**
 * Motor de INFORMES formales entre instancias de la escuela. Todo (tipos,
 * destinatarios, plazos, campos, confidencialidad, derivaciones) sale de
 * `settings.reportsFlow` de la institución.
 */
export class PrismaFormalReportRepository {
  private async flow(institutionId: string): Promise<ReportsFlowConfig> {
    return extractReportsFlow(await institutionSettings(institutionId))
  }

  private typeOf(flow: ReportsFlowConfig, key: string): ReportTypeConfig {
    const t = flow.reportTypes.find((x) => x.key === key)
    if (!t) throw new BadRequestError('Tipo de informe no configurado en la institución')
    return t
  }

  private async snapshotFor(r: ReportRow, actor: Actor) {
    const source = (r.typeConfig as unknown as ReportTypeConfig).snapshot ?? 'none'
    if (source === 'early_alerts' && r.academicPeriodId && r.courseAssignmentId) {
      await new PrismaEarlyAlertRepository().list(r.institutionId, actor, {
        periodId: r.academicPeriodId, courseAssignmentId: r.courseAssignmentId,
      })
    }
    const snapshot = await buildSnapshot(source, r)
    if (source === 'early_alerts' && r.previousVersionId) {
      const previous = await prisma.formalReport.findFirst({ where: { id: r.previousVersionId, institutionId: r.institutionId, authorId: r.authorId, courseAssignmentId: r.courseAssignmentId, academicPeriodId: r.academicPeriodId }, select: { snapshot: true } })
      const prior = (previous?.snapshot as { alertRoster?: Array<{ studentId?: string; student: string; result: string }> } | null)?.alertRoster ?? []
      const current = snapshot.alertRoster as Array<{ studentId?: string; student: string; result: string }> ?? []
      snapshot.alertRoster = [...prior.filter((p) => !current.some((c) => p.studentId ? c.studentId === p.studentId : c.student === p.student)), ...current]
        .sort((a, b) => a.student.localeCompare(b.student, 'es'))
    }
    return snapshot
  }

  // ─── Visibilidad ────────────────────────────────────────────────────────────

  private isRecipient(r: { authorId?: string; recipients: Array<{ userId: string }> }, actor: Actor) {
    if (r.authorId === actor.userId) return false
    return r.recipients.some((x) => x.userId === actor.userId)
  }

  /** Puede ver el informe (metadatos). */
  private canView(r: ReportRow, actor: Actor) {
    if (r.authorId === actor.userId) return true
    if (r.status !== 'DRAFT' && this.isRecipient(r, actor)) return true
    if (r.status !== 'DRAFT' && hasPermission(actor, 'formal_reports', 'read', 'all')) return true
    return false
  }

  /** Puede ver el contenido (los confidenciales solo autor y destinatarios). */
  private canViewContent(r: ReportRow, actor: Actor) {
    if (r.authorId === actor.userId || this.isRecipient(r, actor)) return true
    if (r.confidential) return false
    return hasPermission(actor, 'formal_reports', 'read', 'all')
  }

  private present(r: ReportRow, actor: Actor) {
    const content = this.canViewContent(r, actor)
    const now = Date.now()
    return {
      id: r.id,
      folio: r.folio,
      typeKey: r.typeKey,
      typeLabel: r.typeLabel,
      scope: r.scope,
      status: r.status as FormalReportStatus,
      confidential: r.confidential,
      contentHidden: !content,
      academicYearId: r.academicYearId,
      studentId: r.studentId,
      student: r.student ? { id: r.student.id, name: personName(r.student), dni: r.student.profile?.dni ?? null } : null,
      parallelId: r.parallelId,
      courseAssignmentId: r.courseAssignmentId,
      academicPeriodId: r.academicPeriodId,
      alertId: r.alertId,
      reinforcementPlanId: r.reinforcementPlanId,
      parentReport: r.parentReport,
      previousVersionId: r.previousVersionId,
      derived: r.derived,
      author: { id: r.author.id, name: personName(r.author) },
      recipientInstance: r.recipientInstance,
      recipientInstanceLabel: r.recipientInstanceLabel,
      recipients: r.recipients.map((x) => ({ userId: x.userId, name: personName(x.user), readAt: x.readAt })),
      content: content ? (r.content as Record<string, string>) : {},
      snapshot: content ? (r.snapshot as Record<string, unknown>) : {},
      typeConfig: r.typeConfig as Partial<ReportTypeConfig>,
      contentHash: r.contentHash,
      signatures: {
        author: r.authorSignature && typeof r.authorSignature === 'object' ? { ...(r.authorSignature as Record<string, unknown>), imageData: undefined } : null,
        recipient: r.recipientSignature && typeof r.recipientSignature === 'object' ? { ...(r.recipientSignature as Record<string, unknown>), imageData: undefined } : null,
      },
      sentAt: r.sentAt,
      ackDeadlineAt: r.ackDeadlineAt,
      overdue: r.status === 'SENT' && !!r.ackDeadlineAt && r.ackDeadlineAt.getTime() < now,
      receivedAt: r.receivedAt,
      receivedById: r.receivedById,
      returnedAt: r.returnedAt,
      returnNote: r.returnNote,
      attendedAt: r.attendedAt,
      responseNote: r.responseNote,
      escalatedAt: r.escalatedAt,
      attachments: content ? r.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, fileSize: a.fileSize, category: a.category })) : [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      permissions: {
        isAuthor: r.authorId === actor.userId,
        isRecipient: this.isRecipient(r, actor),
        canEdit: r.authorId === actor.userId && r.status === 'DRAFT',
        canReceive: this.isRecipient(r, actor) && r.status === 'SENT',
        canReturn: this.isRecipient(r, actor) && (r.status === 'SENT' || r.status === 'RECEIVED'),
        canAttend: this.isRecipient(r, actor) && r.status === 'RECEIVED',
        canDerive: this.isRecipient(r, actor) && r.status !== 'DRAFT' && r.status !== 'RETURNED',
        canNewVersion: r.authorId === actor.userId && r.status === 'RETURNED',
      },
    }
  }

  private async load(institutionId: string, id: string): Promise<ReportRow> {
    const r = await prisma.formalReport.findFirst({ where: { id, institutionId }, include: reportInclude })
    if (!r) throw new NotFoundError('Informe no encontrado')
    return r
  }

  async get(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (!this.canView(r, actor)) throw new ForbiddenError()
    // Lectura del destinatario (no es acuse: el acuse es explícito)
    const mine = r.recipients.find((x) => x.userId === actor.userId)
    if (mine && !mine.readAt && r.status !== 'DRAFT') {
      await prisma.formalReportRecipient.update({ where: { id: mine.id }, data: { readAt: new Date() } })
    }
    const versions = await prisma.formalReport.findMany({ where: { institutionId, previousVersionId: id, ...(r.authorId === actor.userId ? {} : { status: { not: 'DRAFT' }, ...(hasPermission(actor, 'formal_reports', 'read', 'all') ? {} : { recipients: { some: { userId: actor.userId } } }) }) }, select: { id: true, folio: true, status: true }, orderBy: { createdAt: 'desc' } })
    return { ...this.present(r, actor), subsequentVersions: versions }
  }

  // ─── Listado y escalamiento ───────────────────────────────────────────────

  private async supersededGroupIds(institutionId: string, actor?: Actor) {
    const versions = await prisma.formalReport.findMany({
      where: { institutionId, status: { not: 'DRAFT' }, previousVersionId: { not: null },
        typeConfig: { path: ['pdfTemplate'], equals: 'annex_alerts' },
        ...(actor ? { OR: [{ authorId: actor.userId }, { recipients: { some: { userId: actor.userId } } }] } : {}),
      },
      select: { previousVersionId: true },
    })
    return [...new Set(versions.map((r) => r.previousVersionId).filter((id): id is string => !!id))]
  }

  /** Avisa una sola vez a la instancia de escalamiento cuando vence el plazo de acuse. */
  private async runEscalations(institutionId: string, flow: ReportsFlowConfig) {
    const supersededIds = await this.supersededGroupIds(institutionId)
    const overdue = await prisma.formalReport.findMany({
      where: { institutionId, id: { notIn: supersededIds }, status: 'SENT', escalatedAt: null, ackDeadlineAt: { lt: new Date() } },
      select: { id: true, folio: true, typeKey: true, typeLabel: true, studentId: true, parallelId: true, recipientInstanceLabel: true },
      take: 50,
    })
    for (const r of overdue) {
      const t = flow.reportTypes.find((x) => x.key === r.typeKey)
      const target = t?.escalateTo ? flow.instances.find((i) => i.key === t.escalateTo) : null
      // Se marca aunque no haya destino: evita reintentos infinitos
      const claimed = await prisma.formalReport.updateMany({ where: { id: r.id, escalatedAt: null }, data: { escalatedAt: new Date() } })
      if (!claimed.count || !target) continue
      const users = await resolveInstanceUsers(target, { institutionId, studentId: r.studentId, parallelId: r.parallelId })
      await Promise.allSettled(users.map((u) => sendPushToUser(u, {
        title: 'Informe sin acuse de recibo',
        body: `${r.typeLabel} (${r.folio}) dirigido a ${r.recipientInstanceLabel} venció su plazo de acuse.`,
        url: `/informes/${r.id}`,
      })))
    }
  }

  async list(institutionId: string, actor: Actor, q: ListFormalReportsQuery) {
    const flow = await this.flow(institutionId)
    await this.runEscalations(institutionId, flow)
    const box = q.box ?? 'inbox'
    const supersededIds = await this.supersededGroupIds(institutionId, box === 'all' ? undefined : actor)
    const where: Prisma.FormalReportWhereInput = { institutionId, id: { notIn: supersededIds } }
    if (box === 'inbox') Object.assign(where, { authorId: { not: actor.userId }, status: { not: 'DRAFT' }, recipients: { some: { userId: actor.userId } } })
    else if (box === 'sent') Object.assign(where, { authorId: actor.userId, status: { not: 'DRAFT' } })
    else if (box === 'drafts') Object.assign(where, { authorId: actor.userId, status: 'DRAFT' })
    else {
      if (!hasPermission(actor, 'formal_reports', 'read', 'all')) throw new ForbiddenError()
      Object.assign(where, { status: { not: 'DRAFT' } })
    }
    if (q.status) where.status = q.status
    if (q.typeKey) where.typeKey = q.typeKey
    if (q.studentId) where.studentId = q.studentId
    if (q.academicYearId) where.academicYearId = q.academicYearId
    if (q.overdue === 'true') Object.assign(where, { status: 'SENT', ackDeadlineAt: { lt: new Date() } })
    const rows = await prisma.formalReport.findMany({ where, include: reportInclude, orderBy: { updatedAt: 'desc' }, take: 300 })
    return rows.map((r) => {
      const p = this.present(r, actor)
      // El listado no necesita el contenido completo
      return { ...p, content: {}, snapshot: {} }
    })
  }

  async counts(institutionId: string, actor: Actor) {
    const supersededIds = await this.supersededGroupIds(institutionId, actor)
    const [inboxPending, overdueSent, drafts] = await Promise.all([
      prisma.formalReport.count({ where: { institutionId, id: { notIn: supersededIds }, authorId: { not: actor.userId }, status: 'SENT', recipients: { some: { userId: actor.userId } } } }),
      prisma.formalReport.count({ where: { institutionId, id: { notIn: supersededIds }, authorId: actor.userId, status: 'SENT', ackDeadlineAt: { lt: new Date() } } }),
      prisma.formalReport.count({ where: { institutionId, authorId: actor.userId, status: 'DRAFT' } }),
    ])
    return { inboxPending, overdueSent, drafts }
  }

  // ─── Creación y edición ───────────────────────────────────────────────────

  /** El actor puede redactar el tipo para este contexto. */
  private async assertAuthor(institutionId: string, actor: Actor, t: ReportTypeConfig, ctx: { parallelId: string | null; courseAssignmentId: string | null; studentId: string | null }) {
    if (actor.roles.includes('guardian') || actor.roles.includes('student')) {
      if (!actor.roles.some((r) => !['guardian', 'student'].includes(r))) throw new ForbiddenError('Representantes y estudiantes no redactan informes')
    }
    if (isAuthority(actor)) return
    const isTutor = ctx.parallelId
      ? !!(await prisma.parallel.findFirst({ where: { id: ctx.parallelId, institutionId, tutorId: actor.userId }, select: { id: true } }))
      : false
    const roleOk = actor.roles.some((r) => t.authorRoles.includes(r)) || (t.authorRoles.includes('tutor') && isTutor)
    if (!roleOk) throw new ForbiddenError(`Tu rol no puede redactar "${t.label}"`)
    // Docentes: solo sobre sus asignaturas o los paralelos que tutoran
    const onlyTeacher = actor.roles.includes('teacher') && !hasPermission(actor, 'formal_reports', 'read', 'all') &&
      !actor.roles.some((r) => ['dece', 'inspector'].includes(r))
    if (onlyTeacher && !isTutor) {
      if (ctx.courseAssignmentId) {
        const own = await prisma.courseAssignment.findFirst({ where: { id: ctx.courseAssignmentId, institutionId, teacherId: actor.userId }, select: { id: true } })
        if (!own) throw new ForbiddenError('Solo puedes redactar informes de tus asignaturas')
      } else if (ctx.parallelId) {
        const own = await prisma.courseAssignment.findFirst({ where: { parallelId: ctx.parallelId, institutionId, teacherId: actor.userId }, select: { id: true } })
        if (!own) throw new ForbiddenError('Solo puedes redactar informes de tus paralelos')
      }
    }
  }

  async create(institutionId: string, actor: Actor, dto: CreateFormalReportDto, opts: { parentReportId?: string; previousVersionId?: string; skipAuthorCheck?: boolean } = {}) {
    const flow = await this.flow(institutionId)
    const t = this.typeOf(flow, dto.typeKey)
    if (!t.enabled) throw new BadRequestError('Este tipo de informe está desactivado en la institución')
    const target = flow.instances.find((i) => i.key === t.to)
    if (!target) throw new BadRequestError('La instancia destino del informe no existe en la configuración')

    let { studentId = null, parallelId = null, courseAssignmentId = null, academicPeriodId = null, academicYearId = null } = dto as unknown as Record<string, string | null>
    let alertId = dto.alertId ?? null
    let planId = dto.reinforcementPlanId ?? null
    let planDefaults: PlanReportDefaults | null = null

    if (alertId) {
      const a = await prisma.earlyAlert.findFirst({ where: { id: alertId, institutionId } })
      if (!a) throw new NotFoundError('Alerta no encontrada')
      studentId = a.studentId; courseAssignmentId = a.courseAssignmentId; academicPeriodId = a.academicPeriodId; academicYearId = a.academicYearId
      planId = planId ?? a.reinforcementPlanId
    }
    if (planId) {
      const p = await prisma.reinforcementPlan.findFirst({ where: { id: planId, institutionId }, select: {
        studentId: true, courseAssignmentId: true, academicPeriodId: true, participants: { select: { studentId: true } },
        mode: true, proposalLearningToReinforce: true, proposalObjective: true, proposalActiveStrategy: true, proposalResource: true, proposalEvaluation: true,
        courseAssignment: { select: { subject: { select: { name: true } }, teacher: { select: personSelect } } },
        sessions: { orderBy: { date: 'asc' }, take: 1, select: { date: true } },
      } })
      if (!p) throw new NotFoundError('Caso de refuerzo no encontrado')
      if (courseAssignmentId && courseAssignmentId !== p.courseAssignmentId) throw new BadRequestError('La asignatura no corresponde al caso de refuerzo')
      if (academicPeriodId && academicPeriodId !== p.academicPeriodId) throw new BadRequestError('El periodo no corresponde al caso de refuerzo')
      if (studentId && studentId !== p.studentId && !p.participants.some((x) => x.studentId === studentId)) throw new BadRequestError('El estudiante no participa en el caso de refuerzo')
      studentId = studentId ?? p.studentId; courseAssignmentId = courseAssignmentId ?? p.courseAssignmentId; academicPeriodId = academicPeriodId ?? p.academicPeriodId
      planDefaults = {
        teacher: p.courseAssignment ? personName(p.courseAssignment.teacher) : '', mode: p.mode, subject: p.courseAssignment?.subject.name ?? '',
        learningTarget: p.proposalLearningToReinforce, objective: p.proposalObjective, strategy: p.proposalActiveStrategy,
        resources: p.proposalResource, evaluation: p.proposalEvaluation, startDate: p.sessions?.[0]?.date.toISOString().slice(0, 10) ?? null,
      }
    }
    if (t.requiresReinforcementCase && !planId) throw new BadRequestError('Este informe debe vincularse a un caso de refuerzo')
    if (courseAssignmentId) {
      const ca = await prisma.courseAssignment.findFirst({ where: { id: courseAssignmentId, institutionId }, select: { parallelId: true, academicYearId: true } })
      if (!ca) throw new NotFoundError('Asignatura no encontrada')
      if (parallelId && parallelId !== ca.parallelId) throw new BadRequestError('La asignatura no corresponde al paralelo')
      if (academicYearId && academicYearId !== ca.academicYearId) throw new BadRequestError('La asignatura no corresponde al año lectivo')
      parallelId = parallelId ?? ca.parallelId; academicYearId = academicYearId ?? ca.academicYearId
    }
    if (academicPeriodId) {
      const p = await prisma.academicPeriod.findFirst({ where: { id: academicPeriodId, academicYear: { institutionId } }, select: { academicYearId: true } })
      if (!p) throw new NotFoundError('Periodo no encontrado')
      if (academicYearId && academicYearId !== p.academicYearId) throw new BadRequestError('El periodo no corresponde al año lectivo')
      academicYearId = p.academicYearId
    }
    if (!academicYearId) {
      const y = await prisma.academicYear.findFirst({ where: { institutionId, isActive: true }, select: { id: true } })
      if (!y) throw new BadRequestError('No hay año lectivo activo')
      academicYearId = y.id
    }
    if (studentId) {
      const enr = await prisma.studentEnrollment.findFirst({ where: { institutionId, studentId, academicYearId }, select: { parallelId: true } })
      if (!enr) throw new BadRequestError('El estudiante no está matriculado en el año lectivo')
      if (parallelId && enr.parallelId !== parallelId) throw new BadRequestError('El estudiante no pertenece a ese paralelo')
      parallelId = enr.parallelId
    }
    if (t.scope === 'student' && !studentId) throw new BadRequestError('Este informe requiere un estudiante')
    if (t.scope === 'parallel' && !parallelId) throw new BadRequestError('Este informe requiere un paralelo')
    if (t.pdfTemplate && (!academicPeriodId || !courseAssignmentId)) throw new BadRequestError('Los anexos requieren asignatura y periodo académico')
    if (t.snapshot === 'early_alerts') {
      if (t.scope !== 'parallel' || target.resolver === 'guardians_of_student') throw new BadRequestError('La nómina de alertas solo se envía al personal de la institución')
      studentId = null; alertId = null; planId = null
    }
    if (t.pdfTemplate === 'annex_attendance') { studentId = null; alertId = null }
    if (parallelId) {
      const ok = await prisma.parallel.findFirst({ where: { id: parallelId, institutionId }, select: { id: true } })
      if (!ok) throw new NotFoundError('Paralelo no encontrado')
    }

    if (!opts.skipAuthorCheck) await this.assertAuthor(institutionId, actor, t, { parallelId, courseAssignmentId, studentId })

    const defaults = Object.fromEntries(t.fields.filter((f) => f.defaultValue !== undefined).map((f) => [f.key, f.defaultValue!]))
    const content = this.cleanContent(t, withDocumentDateDefault(t, withPlanReportDefaults(t, { ...defaults, ...(dto.content ?? {}) }, planDefaults)))
    const data: Prisma.FormalReportUncheckedCreateInput = {
        institutionId,
        academicYearId,
        typeKey: t.key,
        typeLabel: t.label,
        scope: t.scope,
        studentId,
        parallelId,
        courseAssignmentId,
        academicPeriodId,
        alertId,
        reinforcementPlanId: planId,
        parentReportId: opts.parentReportId ?? null,
        previousVersionId: opts.previousVersionId ?? null,
        authorId: actor.userId,
        recipientInstance: target.key,
        recipientInstanceLabel: target.label,
        confidential: t.confidential,
        content,
        typeConfig: t as unknown as Prisma.InputJsonValue,
    }
    const grouped = t.pdfTemplate === 'annex_alerts'
    const created = grouped ? await prisma.$transaction(async (tx) => {
      const scope = `annex-alerts:${institutionId}:${actor.userId}:${courseAssignmentId}:${academicPeriodId}:${t.key}`
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${scope}))`
      const existing = await tx.formalReport.findFirst({
        where: { institutionId, authorId: actor.userId, typeKey: t.key, courseAssignmentId, academicPeriodId, academicYearId, parallelId,
          ...(opts.previousVersionId ? { status: 'DRAFT', previousVersionId: opts.previousVersionId } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: { id: true },
      })
      return existing ?? tx.formalReport.create({ data })
    }) : await prisma.formalReport.create({ data })
    return this.get(institutionId, actor, created.id)
  }

  private cleanContent(t: ReportTypeConfig, content: Record<string, string>) {
    const out: Record<string, string> = {}
    for (const f of t.fields) {
      const v = content[f.key]
      if (typeof v === 'string') out[f.key] = v.slice(0, 20000)
    }
    return out
  }

  async update(institutionId: string, actor: Actor, id: string, content: Record<string, string>) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if (r.status !== 'DRAFT') throw new ConflictError('Un informe enviado no se puede editar: crea una nueva versión')
    const t = r.typeConfig as unknown as ReportTypeConfig
    await prisma.formalReport.update({ where: { id }, data: { content: this.cleanContent(t, content ?? {}) } })
    return this.get(institutionId, actor, id)
  }

  async remove(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if (r.status !== 'DRAFT') throw new ConflictError('Solo se pueden eliminar borradores')
    await Promise.all(r.attachments.map((a) => storage.remove(a.storedName)))
    await prisma.formalReport.delete({ where: { id } })
  }

  /** Vista previa del snapshot (lo que se congelará al enviar). */
  async previewSnapshot(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    return this.snapshotFor(r, actor)
  }

  // ─── Envío ────────────────────────────────────────────────────────────────

  async send(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if (r.status !== 'DRAFT') throw new ConflictError('El informe ya fue enviado')
    const flow = await this.flow(institutionId)
    const t = r.typeConfig as unknown as ReportTypeConfig
    const content = (r.content ?? {}) as Record<string, string>
    const missing = t.fields.filter((f) => f.required && !content[f.key]?.trim()).map((f) => f.label)
    if (missing.length) throw new BadRequestError(`Completa los campos obligatorios: ${missing.join(', ')}`)
    // La instancia se resuelve con la configuración ACTUAL (puede haber cambiado desde el borrador)
    const instance = flow.instances.find((i) => i.key === r.recipientInstance)
    if (!instance) throw new BadRequestError('La instancia destino ya no existe en la configuración')
    const recipients = (await resolveInstanceUsers(instance, { institutionId, studentId: r.studentId, parallelId: r.parallelId }))
      .filter((u) => u !== actor.userId)
    if (!recipients.length) throw new BadRequestError(`La instancia "${instance.label}" no tiene usuarios asignados para este caso. Revisa Configuración → Informes.`)

    if (t.snapshot === 'early_alerts' && instance.resolver === 'guardians_of_student') throw new BadRequestError('La nómina de alertas solo se envía al personal de la institución')
    if (t.snapshot === 'early_alerts') {
      const staffCount = await prisma.user.count({ where: {
        institutionId, id: { in: recipients },
        userRoles: { some: { role: { name: { notIn: ['guardian', 'student'] } } } },
      } })
      if (staffCount !== recipients.length) throw new BadRequestError('Los destinatarios de la nómina de alertas deben ser personal de la institución')
    }
    const snapshot = await this.snapshotFor(r, actor)
    const sentAt = new Date()
    const documentHash = hashContent(content, snapshot)
    const authorSignature = await captureDocumentSignature(institutionId, actor.userId, documentHash, sentAt)
    const ackDeadlineAt = t.ackDeadlineDays > 0 ? new Date(sentAt.getTime() + t.ackDeadlineDays * 86400000) : null
    const year = await prisma.academicYear.findFirst({ where: { id: r.academicYearId }, select: { name: true } })
    const yearTag = (year?.name ?? String(sentAt.getFullYear())).replace(/\s+/g, '')

    // Folio correlativo por institución y año (reintenta si dos envíos chocan)
    for (let attempt = 0; attempt < 5; attempt++) {
      const last = await prisma.formalReport.aggregate({ where: { institutionId, academicYearId: r.academicYearId }, _max: { sequence: true } })
      const sequence = (last._max.sequence ?? 0) + 1
      const folio = `${flow.folioPrefix}-${yearTag}-${String(sequence).padStart(5, '0')}`
      try {
        await prisma.$transaction([
          prisma.formalReport.update({
            where: { id, status: 'DRAFT' } as Prisma.FormalReportWhereUniqueInput,
            data: {
              status: 'SENT',
              folio,
              sequence,
              snapshot: snapshot as Prisma.InputJsonValue,
              contentHash: documentHash,
              ...(authorSignature ? { authorSignature: authorSignature as unknown as Prisma.InputJsonValue } : {}),
              sentAt,
              ackDeadlineAt,
              recipientInstanceLabel: instance.label,
            },
          }),
          prisma.formalReportRecipient.createMany({ data: recipients.map((userId) => ({ reportId: id, userId })), skipDuplicates: true }),
        ])
        break
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 4) continue
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new ConflictError('El informe ya fue enviado')
        throw e
      }
    }
    const studentName = personName(r.student)
    const previous = t.pdfTemplate === 'annex_alerts' && r.previousVersionId
      ? await prisma.formalReport.findFirst({ where: { id: r.previousVersionId, institutionId, authorId: r.authorId, courseAssignmentId: r.courseAssignmentId, academicPeriodId: r.academicPeriodId }, select: { snapshot: true } }) : null
    const notification = previous
      ? groupedReportNotification(personName(r.author), previous.snapshot, snapshot)
      : { title: `Nuevo informe: ${r.typeLabel}`, body: `${personName(r.author)} te envió un informe${studentName ? ` sobre ${studentName}` : ''}.` }
    await Promise.allSettled(recipients.map((u) => sendPushToUser(u, {
      ...notification,
      url: `/informes/${id}`,
    })))
    return this.get(institutionId, actor, id)
  }

  // ─── Acciones del receptor ────────────────────────────────────────────────

  private async asRecipient(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (!this.isRecipient(r, actor)) throw new ForbiddenError('Solo un destinatario puede realizar esta acción')
    return r
  }

  async receive(institutionId: string, actor: Actor, id: string) {
    const r = await this.asRecipient(institutionId, actor, id)
    if (r.status !== 'SENT') throw new ConflictError('El informe ya tiene acuse de recibo')
    const receivedAt = new Date()
    const recipientSignature = await captureDocumentSignature(institutionId, actor.userId, r.contentHash ?? hashContent(r.content, r.snapshot), receivedAt)
    await prisma.formalReport.update({ where: { id, status: 'SENT' }, data: { status: 'RECEIVED', receivedAt, receivedById: actor.userId, ...(recipientSignature ? { recipientSignature: recipientSignature as unknown as Prisma.InputJsonValue } : {}) } })
    await prisma.formalReportRecipient.updateMany({ where: { reportId: id, userId: actor.userId, readAt: null }, data: { readAt: new Date() } })
    await sendPushToUser(r.authorId, { title: 'Acuse de recibo', body: `${r.typeLabel} (${r.folio}) fue recibido.`, url: `/informes/${id}` }).catch(() => undefined)
    return this.get(institutionId, actor, id)
  }

  async returnReport(institutionId: string, actor: Actor, id: string, note: string) {
    if (!note?.trim()) throw new BadRequestError('Escribe las observaciones para el autor')
    const r = await this.asRecipient(institutionId, actor, id)
    if (r.status !== 'SENT' && r.status !== 'RECEIVED') throw new ConflictError('Este informe no se puede devolver')
    await prisma.formalReport.update({ where: { id }, data: { status: 'RETURNED', returnedAt: new Date(), returnNote: note.trim(), receivedById: r.receivedById ?? actor.userId } })
    await sendPushToUser(r.authorId, { title: 'Informe devuelto con observaciones', body: `${r.typeLabel} (${r.folio}): ${note.trim().slice(0, 120)}`, url: `/informes/${id}` }).catch(() => undefined)
    return this.get(institutionId, actor, id)
  }

  async attend(institutionId: string, actor: Actor, id: string, note?: string) {
    const r = await this.asRecipient(institutionId, actor, id)
    if (r.status !== 'RECEIVED') throw new ConflictError('Primero registra el acuse de recibo')
    await prisma.formalReport.update({ where: { id }, data: { status: 'ATTENDED', attendedAt: new Date(), attendedById: actor.userId, responseNote: note?.trim() || null } })
    await sendPushToUser(r.authorId, { title: 'Informe atendido', body: `${r.typeLabel} (${r.folio}) fue atendido.`, url: `/informes/${id}` }).catch(() => undefined)
    return this.get(institutionId, actor, id)
  }

  /** El receptor deriva el caso a otra instancia: crea un borrador hijo con el mismo contexto. */
  async derive(institutionId: string, actor: Actor, id: string, typeKey: string) {
    const r = await this.asRecipient(institutionId, actor, id)
    if (r.status === 'DRAFT' || r.status === 'RETURNED') throw new ConflictError('Este informe no se puede derivar')
    const flow = await this.flow(institutionId)
    const parentType = flow.reportTypes.find((x) => x.key === r.typeKey) ?? (r.typeConfig as unknown as ReportTypeConfig)
    const childType = this.typeOf(flow, typeKey)
    if (!(parentType.canDeriveTo ?? []).includes(childType.to)) {
      throw new BadRequestError(`"${parentType.label}" no permite derivar a ${childType.to}`)
    }
    return this.create(institutionId, actor, {
      typeKey,
      studentId: r.studentId ?? undefined,
      parallelId: r.parallelId ?? undefined,
      courseAssignmentId: r.courseAssignmentId ?? undefined,
      academicPeriodId: r.academicPeriodId ?? undefined,
      academicYearId: r.academicYearId,
      alertId: r.alertId ?? undefined,
      reinforcementPlanId: r.reinforcementPlanId ?? undefined,
    }, { parentReportId: r.id, skipAuthorCheck: true })
  }

  /** Corrección de un informe devuelto: nuevo borrador que referencia la versión anterior. */
  async newVersion(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if (r.status !== 'RETURNED') throw new ConflictError('Solo los informes devueltos admiten una nueva versión')
    const existing = await prisma.formalReport.findFirst({ where: { institutionId, previousVersionId: id, authorId: actor.userId, status: 'DRAFT' }, select: { id: true } })
    if (existing) return this.get(institutionId, actor, existing.id)
    return this.create(institutionId, actor, {
      typeKey: r.typeKey,
      studentId: r.studentId ?? undefined,
      parallelId: r.parallelId ?? undefined,
      courseAssignmentId: r.courseAssignmentId ?? undefined,
      academicPeriodId: r.academicPeriodId ?? undefined,
      academicYearId: r.academicYearId,
      alertId: r.alertId ?? undefined,
      reinforcementPlanId: r.reinforcementPlanId ?? undefined,
      content: r.content as Record<string, string>,
    }, { parentReportId: r.parentReportId ?? undefined, previousVersionId: r.id, skipAuthorCheck: true })
  }

  async amendment(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if ((r.typeConfig as unknown as ReportTypeConfig).pdfTemplate !== 'annex_alerts' || !['SENT', 'RECEIVED', 'ATTENDED'].includes(r.status)) throw new ConflictError('Solo un Anexo 1 enviado admite una ampliación')
    return this.create(institutionId, actor, {
      typeKey: r.typeKey, parallelId: r.parallelId ?? undefined, courseAssignmentId: r.courseAssignmentId ?? undefined,
      academicPeriodId: r.academicPeriodId ?? undefined, academicYearId: r.academicYearId,
      content: { ...(r.content as Record<string, string>), numero_acta: '', fecha_documento: '' },
    }, { previousVersionId: id })
  }

  // ─── Anexos ───────────────────────────────────────────────────────────────

  private async draftForAttachments(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (r.authorId !== actor.userId) throw new ForbiddenError()
    if (r.status !== 'DRAFT') throw new ConflictError('Los anexos solo se agregan mientras el informe es borrador')
    return r
  }

  async addAttachment(institutionId: string, actor: Actor, id: string, file: { filename: string; mimetype: string; buffer: Buffer }, category: string) {
    await this.draftForAttachments(institutionId, actor, id)
    const flow = await this.flow(institutionId)
    assertUploader(flow, actor)
    if (!flow.attachments.allowedMime.includes(file.mimetype)) throw new BadRequestError('Tipo de archivo no permitido')
    if (file.buffer.length > flow.attachments.maxSizeMb * 1024 * 1024) throw new BadRequestError(`El archivo supera ${flow.attachments.maxSizeMb} MB`)
    const cat = flow.attachments.categories.find((c) => c.key === category)?.key ?? 'otro'
    const ext = file.filename.includes('.') ? file.filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
    const key = `formal-reports/${crypto.randomUUID()}.${ext}`
    await storage.save(key, file.buffer, file.mimetype)
    await prisma.formalReportAttachment.create({
      data: { reportId: id, institutionId, category: cat, fileName: file.filename.slice(0, 255), storedName: key, mimeType: file.mimetype, fileSize: file.buffer.length, uploadedBy: actor.userId },
    })
    return this.get(institutionId, actor, id)
  }

  /** Copia archivos del caso de refuerzo como anexos (copia física: el informe no depende del caso). */
  async copyCaseAttachments(institutionId: string, actor: Actor, id: string, attachmentIds: string[]) {
    const r = await this.draftForAttachments(institutionId, actor, id)
    if (!r.reinforcementPlanId) throw new BadRequestError('El informe no está vinculado a un caso de refuerzo')
    const src = await prisma.reinforcementAttachment.findMany({ where: { id: { in: attachmentIds ?? [] }, planId: r.reinforcementPlanId, institutionId } })
    for (const a of src) {
      const stream = await storage.getStream(a.storedName)
      if (!stream) continue
      const chunks: Buffer[] = []
      for await (const c of stream) chunks.push(c as Buffer)
      const ext = a.storedName.split('.').pop() ?? 'bin'
      const key = `formal-reports/${crypto.randomUUID()}.${ext}`
      await storage.save(key, Buffer.concat(chunks), a.mimeType)
      await prisma.formalReportAttachment.create({
        data: { reportId: id, institutionId, category: a.category, fileName: a.fileName, storedName: key, mimeType: a.mimeType, fileSize: a.fileSize, uploadedBy: actor.userId },
      })
    }
    return this.get(institutionId, actor, id)
  }

  async removeAttachment(institutionId: string, actor: Actor, id: string, attachmentId: string) {
    const r = await this.draftForAttachments(institutionId, actor, id)
    const a = r.attachments.find((x) => x.id === attachmentId)
    if (!a) throw new NotFoundError('Anexo no encontrado')
    await storage.remove(a.storedName)
    await prisma.formalReportAttachment.delete({ where: { id: attachmentId } })
    return this.get(institutionId, actor, id)
  }

  async attachmentForDownload(institutionId: string, actor: Actor, id: string, attachmentId: string) {
    const r = await this.load(institutionId, id)
    if (!this.canView(r, actor) || !this.canViewContent(r, actor)) throw new ForbiddenError()
    const a = r.attachments.find((x) => x.id === attachmentId)
    if (!a) throw new NotFoundError('Anexo no encontrado')
    return a
  }

  /** Datos para el PDF (respeta visibilidad del contenido). */
  async forPdf(institutionId: string, actor: Actor, id: string) {
    const r = await this.load(institutionId, id)
    if (!this.canView(r, actor)) throw new ForbiddenError()
    if (!this.canViewContent(r, actor)) throw new ForbiddenError('Informe confidencial')
    const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { name: true, settings: true } })
    const receivedBy = r.receivedById ? await prisma.user.findFirst({ where: { id: r.receivedById }, select: personSelect }) : null
    const snapshot = r.status === 'DRAFT' ? await this.snapshotFor(r, actor) : (r.snapshot as Record<string, unknown>)
    // La previsualización no firma ni modifica el informe. Los envíos conservan su copia histórica.
    const previewSignature = r.status === 'DRAFT' && r.authorId === actor.userId ? await getOwnSignature(institutionId, actor.userId) : null
    const authorSignature: DocumentSignatureImage | null = r.status === 'DRAFT'
      ? previewSignature?.imageData ? { imageData: previewSignature.imageData } : null
      : r.authorSignature as unknown as DocumentSignatureImage | null
    return { report: r, institution: inst, receivedByName: receivedBy ? personName(receivedBy) : null, snapshot, authorSignature }
  }
}

export function assertUploader(flow: ReportsFlowConfig, actor: Actor) {
  // El representante y el estudiante nunca suben archivos, aunque se configure.
  const staffRoles = actor.roles.filter((r) => r !== 'guardian' && r !== 'student')
  if (!staffRoles.length) throw new ForbiddenError('Solo el personal de la institución puede subir archivos')
  if (isAuthority(actor)) return
  if (!staffRoles.some((r) => flow.attachments.uploaderRoles.includes(r))) {
    throw new ForbiddenError('Tu rol no puede subir archivos según la configuración de la institución')
  }
}
