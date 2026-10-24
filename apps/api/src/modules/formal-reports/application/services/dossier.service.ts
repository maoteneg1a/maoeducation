import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { extractReportsFlow, type DossierItem } from '../../../../shared/domain/reports-flow'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'
import { hasPermission, type Actor } from '../../../../shared/infrastructure/services/actor'

export type DossierItemStatus = 'ok' | 'partial' | 'missing' | 'na'

interface Evidence {
  id: string
  label: string
  folio: string | null
  status: string
  date: string | null
  kind: 'formal_report' | 'parent_meeting' | 'reinforcement_case' | 'enrollment'
  subject?: string | null
}

/**
 * Expediente de respaldo (p. ej. en caso de reprobar): checklist CONFIGURABLE
 * por institución (`reportsFlow.dossier`). Solo cuenta informes con acuse
 * (RECEIVED/ATTENDED); los enviados sin acuse cuentan como "parcial".
 * Nunca expone contenido: solo folio, fecha y estado.
 */
export async function buildDossier(institutionId: string, actor: Actor, studentId: string, academicYearId: string) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { institutionId, studentId, academicYearId },
    select: {
      parallelId: true,
      hasAdaptation: true,
      adaptationType: true,
      adaptationNotes: true,
      parallel: { select: { name: true, tutorId: true, level: { select: { name: true, subnivel: true } } } },
      academicYear: { select: { name: true, startDate: true, endDate: true } },
      student: { select: { email: true, profile: { select: { firstName: true, lastName: true, dni: true } } } },
    },
  })
  if (!enrollment) throw new NotFoundError('El estudiante no tiene matrícula en ese año lectivo')

  // Acceso: lectura transversal, tutor del paralelo o docente con asignatura en el paralelo
  if (!hasPermission(actor, 'formal_reports', 'read', 'all') && !hasPermission(actor, 'student_folder', 'read', 'all')) {
    const isTutor = enrollment.parallel.tutorId === actor.userId
    const teaches = isTutor ? true : !!(await prisma.courseAssignment.findFirst({
      where: { institutionId, parallelId: enrollment.parallelId, teacherId: actor.userId },
      select: { id: true },
    }))
    if (!teaches) throw new ForbiddenError()
  }

  const flow = extractReportsFlow(await institutionSettings(institutionId))
  const cfg = flow.dossier
  const subnivel = enrollment.parallel.level.subnivel ?? ''
  const applies = cfg.enabled && (cfg.subniveles.length === 0 || cfg.subniveles.includes(subnivel))

  // Asignaturas en riesgo: con alerta temprana (no descartada) en el año
  const alerts = await prisma.earlyAlert.findMany({
    where: { institutionId, studentId, academicYearId, status: { not: 'DISMISSED' } },
    select: { courseAssignmentId: true },
  })
  const riskIds = [...new Set(alerts.map((a) => a.courseAssignmentId))]
  const riskSubjects = riskIds.length
    ? await prisma.courseAssignment.findMany({ where: { id: { in: riskIds }, institutionId }, select: { id: true, subject: { select: { name: true } } } })
    : []

  const [reports, meetings, cases] = await Promise.all([
    prisma.formalReport.findMany({
      where: {
        institutionId,
        academicYearId,
        status: { not: 'DRAFT' },
        OR: [{ studentId }, { scope: 'parallel', parallelId: enrollment.parallelId }, { scope: 'institution' }],
      },
      select: { id: true, typeKey: true, typeLabel: true, folio: true, status: true, sentAt: true, courseAssignmentId: true },
      orderBy: { sentAt: 'asc' },
    }),
    prisma.parentMeeting.findMany({
      where: {
        institutionId,
        studentId,
        meetingDate: { gte: enrollment.academicYear.startDate, lte: enrollment.academicYear.endDate },
      },
      select: { id: true, subject: true, meetingDate: true, signedAt: true },
      orderBy: { meetingDate: 'asc' },
    }),
    prisma.reinforcementPlan.findMany({
      where: {
        institutionId,
        planType: 'academico',
        academicPeriod: { academicYearId },
        OR: [{ studentId }, { participants: { some: { studentId } } }],
      },
      select: { id: true, caseStatus: true, createdAt: true, courseAssignmentId: true, courseAssignment: { select: { subject: { select: { name: true } } } } },
    }),
  ])

  const subjectName = new Map(riskSubjects.map((s) => [s.id, s.subject.name]))
  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

  const evaluate = (item: DossierItem) => {
    let evidence: Evidence[] = []
    let acknowledged = 0
    let pending = 0
    const perSubject: Array<{ subject: string; count: number; required: number; ok: boolean }> = []

    if (item.source === 'formal_report') {
      const mine = reports.filter((r) => r.typeKey === item.reportType)
      evidence = mine.map((r) => ({
        id: r.id, label: r.typeLabel, folio: r.folio, status: r.status, date: iso(r.sentAt), kind: 'formal_report' as const,
        subject: r.courseAssignmentId ? subjectName.get(r.courseAssignmentId) ?? null : null,
      }))
      const ack = (r: { status: string }) => r.status === 'RECEIVED' || r.status === 'ATTENDED'
      if (item.perSubject && riskIds.length) {
        for (const sid of riskIds) {
          const count = mine.filter((r) => r.courseAssignmentId === sid && ack(r)).length
          perSubject.push({ subject: subjectName.get(sid) ?? '—', count, required: item.minCount, ok: count >= item.minCount })
        }
      }
      acknowledged = mine.filter(ack).length
      pending = mine.filter((r) => r.status === 'SENT' || r.status === 'RETURNED').length
    } else if (item.source === 'parent_meetings') {
      evidence = meetings.map((m) => ({ id: m.id, label: m.subject, folio: null, status: m.signedAt ? 'SIGNED' : 'UNSIGNED', date: iso(m.meetingDate), kind: 'parent_meeting' as const }))
      acknowledged = meetings.length
    } else if (item.source === 'reinforcement_case') {
      evidence = cases.map((c) => ({ id: c.id, label: `Caso de refuerzo — ${c.courseAssignment.subject.name}`, folio: null, status: c.caseStatus, date: iso(c.createdAt), kind: 'reinforcement_case' as const, subject: c.courseAssignment.subject.name }))
      if (item.perSubject && riskIds.length) {
        for (const sid of riskIds) {
          const count = cases.filter((c) => c.courseAssignmentId === sid).length
          perSubject.push({ subject: subjectName.get(sid) ?? '—', count, required: item.minCount, ok: count >= item.minCount })
        }
      }
      acknowledged = cases.length
    } else if (item.source === 'enrollment_adaptation') {
      if (enrollment.hasAdaptation) {
        evidence = [{ id: studentId, label: `Adaptación ${enrollment.adaptationType ?? ''}`.trim(), folio: null, status: 'REGISTERED', date: null, kind: 'enrollment' as const }]
        acknowledged = 1
      }
    }

    let status: DossierItemStatus
    if (item.perSubject && perSubject.length) {
      status = perSubject.every((p) => p.ok) ? 'ok' : perSubject.some((p) => p.count > 0) || pending > 0 ? 'partial' : 'missing'
    } else if (acknowledged >= item.minCount) {
      status = 'ok'
    } else if (acknowledged > 0 || pending > 0) {
      status = 'partial'
    } else {
      status = item.optional ? 'na' : 'missing'
    }
    return { key: item.key, label: item.label, source: item.source, reportType: item.reportType ?? null, minCount: item.minCount, perSubject: item.perSubject, optional: item.optional, status, acknowledged, pending, subjects: perSubject, evidence }
  }

  const items = cfg.items.map(evaluate)
  const required = items.filter((i) => i.status !== 'na')
  return {
    student: {
      id: studentId,
      name: enrollment.student.profile ? `${enrollment.student.profile.lastName} ${enrollment.student.profile.firstName}` : enrollment.student.email,
      dni: enrollment.student.profile?.dni ?? null,
    },
    parallel: { id: enrollment.parallelId, name: `${enrollment.parallel.level.name} ${enrollment.parallel.name}`, subnivel },
    academicYear: { id: academicYearId, name: enrollment.academicYear.name },
    applies,
    riskSubjects: riskSubjects.map((s) => ({ id: s.id, name: s.subject.name })),
    completion: required.length ? Math.round((required.filter((i) => i.status === 'ok').length / required.length) * 100) : 100,
    items,
  }
}
