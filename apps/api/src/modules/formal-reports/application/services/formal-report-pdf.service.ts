import PDFDocument from 'pdfkit'
import { resolveLogo, drawHeader, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'
import type { ReportField } from '../../../../shared/domain/reports-flow'
import type { ReportPdfTemplate } from '../../../../shared/domain/reinforcement-annexes'
import { buildOriginalAnnexPdf } from './original-annex-document.service'

export interface FormalReportPdfData {
  institutionName: string
  logoUrl?: string | null
  title: string
  pdfTemplate?: ReportPdfTemplate
  footer?: string | null
  folio: string | null
  status: string
  typeLabel: string
  authorName: string
  recipientLabel: string
  recipientNames: string[]
  sentAt: Date | null
  receivedAt: Date | null
  receivedByName: string | null
  fields: ReportField[]
  content: Record<string, string>
  snapshot: Record<string, unknown>
  attachments: string[]
  signatures: string[]
  returnNote?: string | null
  responseNote?: string | null
}

const fmtDate = (d: Date | null) =>
  d ? new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d) : '—'
const n = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—')
const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Borrador', SENT: 'Enviado', RECEIVED: 'Recibido', RETURNED: 'Devuelto con observaciones', ATTENDED: 'Atendido',
}
const ATTENDANCE_LABEL: Record<string, string> = { present: 'Asistió', absent: 'No asistió', justified: 'Justificado' }

type Snap = {
  academicYear?: { name: string } | null
  framework?: string
  student?: { name: string; dni: string | null } | null
  parallel?: { name: string; tutor: string | null } | null
  subject?: { name: string; teacher: string } | null
  period?: { name: string } | null
  alert?: { scoreAtDetection: number | null; currentScore: number | null; qualitativeCode: string | null; detectedAt: string | null } | null
  grades?: Array<{ subject: string; teacher: string; formative: number | null; summative: number | null; total: number | null }>
  reinforcementCase?: {
    caseStatus: string
    learningTarget: string | null
    proposal: Record<string, string | null>
    commitments: Array<{ label: string; responsible: string; targetDate: string | null }>
    followUps: Array<{ date: string | null; strategy: string; observation: string }>
    reevaluations: Array<{ date: string | null; evaluation: string; initialResult: string | null; subsequentResult: string | null; decision: string | null }>
    sessions: Array<{ date: string | null; title: string }>
  } | null
  sessions?: Array<{ date: string | null; title: string; attendance: Array<{ student: string; status: string; score: number | null; appliedScore: number | null }> }>
}

/** PDF de un informe formal. Los borradores llevan marca "BORRADOR". */
export function buildFormalReportPdf(data: FormalReportPdfData): Promise<Buffer> {
  if (data.pdfTemplate) return buildOriginalAnnexPdf(data)
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logo = resolveLogo(data.logoUrl)
    drawWatermark(doc, logo, 0.06)
    drawHeader(doc, logo, data.institutionName, data.title)

    if (data.status === 'DRAFT') {
      const { x, y } = doc
      doc.save().rotate(-30, { origin: [300, 420] }).fontSize(70).fillColor('#dc2626').opacity(0.12)
        .text('BORRADOR', 80, 380, { width: 450, align: 'center' }).restore()
      doc.opacity(1).fillColor('black')
      doc.x = x; doc.y = y
    }

    const snap = data.snapshot as Snap
    const row = (label: string, value: string | null | undefined) => {
      doc.font('Helvetica-Bold').fontSize(9.5).text(`${label}: `, { continued: true })
      doc.font('Helvetica').text(value || '—')
    }
    const section = (title: string) => {
      doc.moveDown(0.7)
      doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#1e3a8a').text(title.toUpperCase())
      doc.fillColor('black').moveDown(0.25)
    }

    doc.fontSize(9.5)
    row('Folio', data.folio ?? 'Sin folio (borrador)')
    row('Tipo de informe', data.typeLabel)
    row('Estado', STATUS_LABEL[data.status] ?? data.status)
    row('Elaborado por', data.authorName)
    row('Dirigido a', `${data.recipientLabel}${data.recipientNames.length ? ` — ${data.recipientNames.join(', ')}` : ''}`)
    row('Fecha de envío', fmtDate(data.sentAt))
    if (snap.academicYear) row('Año lectivo', snap.academicYear.name)
    if (data.pdfTemplate && snap.framework) row('Marco normativo del año', snap.framework === 'LEGACY' ? 'Marco anterior (Acuerdo 2024-00031-A)' : snap.framework)
    if (data.receivedAt) row('Acuse de recibo', `${fmtDate(data.receivedAt)}${data.receivedByName ? ` — ${data.receivedByName}` : ''}`)

    if (snap.student || snap.parallel || snap.subject || snap.period) {
      section(snap.student ? 'Datos del estudiante' : 'Datos académicos')
      if (snap.student) row('Estudiante', `${snap.student.name}${snap.student.dni ? ` (C.I. ${snap.student.dni})` : ''}`)
      if (snap.parallel) row('Grado/curso', `${snap.parallel.name}${snap.parallel.tutor ? ` — Tutor: ${snap.parallel.tutor}` : ''}`)
      if (snap.subject) row('Asignatura', `${snap.subject.name} — Docente: ${snap.subject.teacher}`)
      if (snap.period) row('Periodo', snap.period.name)
    }

    if (snap.alert) {
      section('Alerta temprana')
      row('Nota al detectar', snap.alert.qualitativeCode ?? n(snap.alert.scoreAtDetection))
      row('Nota actual', n(snap.alert.currentScore))
      row('Detectada el', snap.alert.detectedAt)
    }

    if (snap.grades?.length) {
      section('Calificaciones del periodo (motor de notas)')
      doc.font('Helvetica-Bold').fontSize(9)
      const y0 = doc.y
      doc.text('Asignatura', 50, y0, { width: 220 }).text('Formativa', 270, y0, { width: 80 }).text('Sumativa', 350, y0, { width: 80 }).text('Total', 430, y0, { width: 80 })
      doc.font('Helvetica')
      for (const g of snap.grades) {
        const y = doc.y + 2
        doc.text(g.subject, 50, y, { width: 220 }).text(n(g.formative), 270, y, { width: 80 }).text(n(g.summative), 350, y, { width: 80 }).text(n(g.total), 430, y, { width: 80 })
      }
      doc.x = 50
    }

    if (data.fields.length) {
      section('Contenido')
      for (const f of data.fields) {
        doc.x = 50
        doc.font('Helvetica-Bold').fontSize(9.5).text(f.label)
        doc.font('Helvetica').text(data.content[f.key]?.trim() || '—', { align: 'justify' })
        doc.moveDown(0.4)
      }
    }

    const rc = snap.reinforcementCase
    if (rc && data.pdfTemplate !== 'annex_plan' && data.pdfTemplate !== 'annex_progress') {
      section('Plan de refuerzo pedagógico')
      if (rc.learningTarget) row('Aprendizaje a reforzar', rc.learningTarget)
      row('Objetivo', rc.proposal.objective)
      row('Estrategia', rc.proposal.strategy)
      row('Actividad', rc.proposal.activity)
      row('Recursos', rc.proposal.resource)
      row('Evaluación', rc.proposal.evaluation)
      row('Duración / frecuencia', rc.proposal.durationFrequency)
      if (rc.commitments.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Compromisos')
        for (const c of rc.commitments) doc.font('Helvetica').text(`• ${c.label} — ${c.responsible}${c.targetDate ? ` (hasta ${c.targetDate})` : ''}`)
      }
      if (rc.followUps.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Seguimientos')
        for (const f of rc.followUps) doc.font('Helvetica').text(`• ${f.date ?? ''}: ${f.strategy} — ${f.observation}`)
      }
      if (rc.reevaluations.length) {
        doc.moveDown(0.3).font('Helvetica-Bold').text('Resultados')
        for (const r of rc.reevaluations) {
          doc.font('Helvetica').text(`• ${r.date ?? ''}: ${r.evaluation}. Inicial: ${r.initialResult ?? '—'} → Posterior: ${r.subsequentResult ?? '—'}${r.decision ? ` · Decisión: ${r.decision}` : ''}`)
        }
      }
    }

    if (snap.sessions?.length && data.pdfTemplate !== 'annex_attendance') {
      section('Registro de asistencia al refuerzo')
      for (const s of snap.sessions) {
        doc.font('Helvetica-Bold').fontSize(9.5).text(`${s.date ?? ''} — ${s.title}`)
        for (const a of s.attendance) {
          const scores = a.score != null ? ` · Nota: ${n(a.score)}${a.appliedScore != null ? ` → registrada ${n(a.appliedScore)}` : ''}` : ''
          doc.font('Helvetica').text(`   ${a.student}: ${ATTENDANCE_LABEL[a.status] ?? a.status}${scores}`)
        }
        doc.moveDown(0.2)
      }
    }

    if (data.returnNote) { section('Observaciones del receptor'); doc.font('Helvetica').fontSize(9.5).text(data.returnNote) }
    if (data.responseNote) { section('Respuesta / atención'); doc.font('Helvetica').fontSize(9.5).text(data.responseNote) }

    if (data.attachments.length) {
      section('Anexos')
      for (const a of data.attachments) doc.font('Helvetica').fontSize(9.5).text(`• ${a}`)
    }

    // Firmas
    if (data.signatures.length) {
      if (doc.y > 640) doc.addPage()
      doc.moveDown(3)
      const per = Math.min(data.signatures.length, 3)
      const width = (495 - (per - 1) * 20) / per
      let y = doc.y
      data.signatures.forEach((label, i) => {
        const col = i % per
        if (i > 0 && col === 0) { y += 70 }
        const x = 50 + col * (width + 20)
        doc.moveTo(x, y).lineTo(x + width, y).stroke()
        doc.font('Helvetica').fontSize(9).text(label, x, y + 4, { width, align: 'center' })
      })
      doc.x = 50
    }

    if (data.footer) {
      doc.moveDown(2).font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(data.footer, 50, doc.y, { width: 495, align: 'center' })
    }
    doc.end()
  })
}
