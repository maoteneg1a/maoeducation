import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { dossierStatus } from '../../../../shared/domain/dossier-checklist'
import type { DossierItem } from '../../../../shared/domain/reports-flow'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import { dossierAccess } from './dossier-access.service'

export type DossierItemStatus = 'ok' | 'partial' | 'missing' | 'na'
interface Evidence {
  id: string; label: string; folio: string | null; status: string; date: string | null
  kind: 'formal_report' | 'parent_meeting' | 'reinforcement_case' | 'enrollment' | 'uploaded_file'
  subject?: string | null
  canOpen?: boolean
  canRemove?: boolean
  uploader?: string
  observation?: string | null
}

/** Checklist anual de respaldo: matrícula + materia seleccionada, independiente de alertas tempranas. */
export async function buildDossier(institutionId: string, actor: Actor, studentId: string, academicYearId: string, courseAssignmentId?: string) {
  const { enrollment, assignments, flow, applies, canUpload, isTutor } = await dossierAccess(institutionId, actor, { studentId, academicYearId, courseAssignmentId })
  const cfg = flow.dossier
  const [reports, meetings, cases, files, exceptions] = await Promise.all([
    prisma.formalReport.findMany({
      where: {
        institutionId, academicYearId,
        OR: [{ studentId }, { scope: 'parallel', parallelId: enrollment.parallelId }, { scope: 'institution' }],
        AND: [{ OR: [{ status: { not: 'DRAFT' } }, { authorId: actor.userId }] }],
      },
      select: { id: true, typeKey: true, typeLabel: true, folio: true, status: true, sentAt: true, courseAssignmentId: true,
        reinforcementPlanId: true, typeConfig: true, authorId: true, confidential: true, recipients: { select: { userId: true } },
      }, orderBy: { sentAt: 'asc' },
    }),
    prisma.parentMeeting.findMany({
      where: { institutionId, studentId, meetingDate: { gte: enrollment.academicYear.startDate, lte: enrollment.academicYear.endDate } },
      select: { id: true, subject: true, meetingDate: true, signedAt: true }, orderBy: { meetingDate: 'asc' },
    }),
    prisma.reinforcementPlan.findMany({
      where: { institutionId, planType: 'academico', academicPeriod: { academicYearId }, courseAssignmentId: { in: assignments.map((a) => a.id) }, OR: [{ studentId }, { participants: { some: { studentId } } }] },
      select: { id: true, caseStatus: true, createdAt: true, courseAssignmentId: true, academicPeriodId: true, academicPeriod: { select: { name: true } }, courseAssignment: { select: { subject: { select: { name: true } } } } },
    }),
    prisma.dossierFile.findMany({
      where: { institutionId, studentId, academicYearId },
      include: { uploader: { select: { profile: { select: { firstName: true, lastName: true } } } } }, orderBy: { createdAt: 'asc' },
    }),
    prisma.dossierException.findMany({ where: { institutionId, studentId, academicYearId } }),
  ])
  const subjectName = new Map(assignments.map((a) => [a.id, a.subject.name]))
  const iso = (d: Date | null) => d ? d.toISOString().slice(0, 10) : null

  const evaluate = (item: DossierItem) => {
    const scope = item.perSubject ? courseAssignmentId : undefined
    const scopeKey = scope || 'general'
    const scoped = (id: string | null) => !item.perSubject || (!!scope && id === scope)
    const template = flow.reportTypes.find((t) => t.key === item.reportType && t.enabled)
    const confidential = template?.confidential === true
    let evidence: Evidence[] = []
    let complete = 0, pending = 0

    if (item.source === 'formal_report') {
      const mine = reports.filter((r) => r.typeKey === item.reportType && !(r.typeKey === 'bajo_rendimiento_tutor' && (r.typeConfig as { pdfTemplate?: string }).pdfTemplate === 'annex_alerts') && scoped(r.courseAssignmentId) && (!r.reinforcementPlanId || cases.some((c) => c.id === r.reinforcementPlanId)))
      evidence = mine.map((r) => {
        const ownOrRecipient = r.authorId === actor.userId || r.recipients.some((u) => u.userId === actor.userId)
        return { id: r.id, label: r.typeLabel, folio: r.folio, status: r.status, date: iso(r.sentAt), kind: 'formal_report',
          subject: r.courseAssignmentId ? subjectName.get(r.courseAssignmentId) : null,
          canOpen: ownOrRecipient || (!r.confidential && hasPermission(actor, 'formal_reports', 'read', 'all')),
        }
      })
      complete = item.requiresSignature ? 0 : mine.filter((r) => r.status === 'RECEIVED' || r.status === 'ATTENDED').length
      pending = mine.length - complete
    } else if (item.source === 'parent_meetings') {
      evidence = meetings.map((m) => ({ id: m.id, label: m.subject, folio: null, status: m.signedAt ? 'SIGNED' : 'UNSIGNED', date: iso(m.meetingDate), kind: 'parent_meeting', canOpen: true }))
      complete = meetings.filter((m) => m.signedAt).length
      pending = meetings.length - complete
    } else if (item.source === 'reinforcement_case') {
      const mine = cases.filter((c) => scoped(c.courseAssignmentId))
      evidence = mine.map((c) => ({ id: c.id, label: `Caso de refuerzo — ${c.courseAssignment.subject.name}`, folio: null, status: c.caseStatus, date: iso(c.createdAt), kind: 'reinforcement_case', subject: c.courseAssignment.subject.name, canOpen: true }))
      pending = mine.length // Un caso registrado no sustituye el documento de respaldo.
    } else if (item.source === 'enrollment_adaptation' && enrollment.hasAdaptation) {
      evidence = [{ id: studentId, label: `Adaptación ${enrollment.adaptationType || ''} registrada; falta documento de respaldo`, folio: null, status: 'REGISTERED', date: null, kind: 'enrollment' }]
      pending = 1
    }

    const uploaded = files.filter((f) => f.itemKey === item.key && f.scopeKey === scopeKey && (!item.perSubject || !!scope))
    for (const file of uploaded) {
      const canOpen = !(file.confidential || confidential) || file.uploadedBy === actor.userId || isAuthority(actor) || actor.roles.includes('dece')
      evidence.push({ id: file.id, label: canOpen ? file.fileName : 'Documento reservado', folio: null, status: file.isSigned ? 'SIGNED_FILE' : 'UPLOADED', date: iso(file.createdAt), kind: 'uploaded_file',
        subject: file.courseAssignmentId ? subjectName.get(file.courseAssignmentId) : null, canOpen,
        canRemove: canOpen && (file.uploadedBy === actor.userId || isAuthority(actor)),
        uploader: file.uploader.profile ? `${file.uploader.profile.firstName} ${file.uploader.profile.lastName}` : undefined,
        observation: canOpen ? file.observation : null,
      })
      if (!item.requiresSignature || file.isSigned) complete++
      else pending++
    }
    const exception = item.optional ? exceptions.find((e) => e.itemKey === item.key && e.scopeKey === scopeKey) : undefined
    const status = dossierStatus(complete, pending, item.minCount, !!exception)
    return {
      key: item.key, label: item.label, source: item.source, reportType: item.reportType || null,
      minCount: item.minCount, perSubject: item.perSubject, optional: item.optional, requiresSignature: item.requiresSignature === true,
      status, acknowledged: complete, pending, uploaded: uploaded.length, notApplicableReason: exception?.reason || null,
      canUpload: canUpload && (!item.perSubject || !!scope),
      canGenerate: !!template && hasPermission(actor, 'formal_reports', 'write', 'own') && (isAuthority(actor) || template.authorRoles.some((r) => actor.roles.includes(r) || (r === 'tutor' && isTutor))),
      requiresReinforcementCase: template?.requiresReinforcementCase === true,
      subjects: scope ? [{ subject: subjectName.get(scope) || '—', count: complete, required: item.minCount, ok: status === 'ok' }] : [],
      evidence,
    }
  }
  const items = cfg.items.map(evaluate)
  const required = items.filter((i) => i.status !== 'na')
  return {
    student: { id: studentId, name: enrollment.student.profile ? `${enrollment.student.profile.lastName} ${enrollment.student.profile.firstName}` : enrollment.student.email, dni: enrollment.student.profile?.dni || null },
    parallel: { id: enrollment.parallelId, name: `${enrollment.parallel.level.name} ${enrollment.parallel.name}`, subnivel: enrollment.parallel.level.subnivel || '' },
    academicYear: { id: academicYearId, name: enrollment.academicYear.name }, applies,
    subjects: assignments.map((a) => ({ id: a.id, name: a.subject.name })), selectedSubjectId: courseAssignmentId || null,
    cases: cases.filter((c) => !courseAssignmentId || c.courseAssignmentId === courseAssignmentId).map((c) => ({ id: c.id, subject: c.courseAssignment.subject.name, periodId: c.academicPeriodId, period: c.academicPeriod.name })),
    completion: required.length ? Math.round(required.filter((i) => i.status === 'ok').length / required.length * 100) : 100,
    canUpload, uploadSettings: { maxSizeMb: flow.attachments.maxSizeMb, allowedMime: flow.attachments.allowedMime }, items,
  }
}
