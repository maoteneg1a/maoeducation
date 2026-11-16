import { documentStyle, installBoardWatermark } from './board-pdf-style'
import PDFDocument from 'pdfkit'
import type PDFKit from 'pdfkit'
import { resolveLogo } from '../../../shared/infrastructure/services/pdf-helpers'
import type { BoardSnapshot, BoardReportDocument } from '../domain/course-board.types'
import type { MeetingDocumentKind } from '../domain/meeting-details'

type Doc = InstanceType<typeof PDFKit>
export const MEETING_TITLES: Record<MeetingDocumentKind, string> = { CALL: 'Convocatoria', ATTENDANCE: 'Registro de asistencia', MINUTES: 'Acta' }
const formatDate = (value: string) => value ? new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'long' }).format(new Date(`${value}T12:00:00Z`)) : '________________'

/** Los tres formatos comparten institución, grado/paralelo, jornada, número y año. */
export function drawMeetingContent(doc: Doc, snapshot: BoardSnapshot, kind: MeetingDocumentKind, options: { conclusions?: string; reports?: BoardReportDocument[] } = {}) {
  const m = snapshot.meeting!
  const style = documentStyle(snapshot)
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right
  const course = `${snapshot.parallelName} ${m.shift}`.trim()
  function header() {
    const y = doc.page.margins.top, logoWidth = 72, yearWidth = 90, centerWidth = width - logoWidth - yearWidth
    doc.font('Helvetica-Bold').fontSize(10)
    const lines = `${snapshot.institutionName.toUpperCase()}\n${snapshot.config.title.toUpperCase()} — ${course.toUpperCase()}\n${MEETING_TITLES[kind].toUpperCase()} N.º ${m.number}`
    const height = Math.max(76, doc.heightOfString(lines, { width: centerWidth - 16 }) + 20)
    doc.save().fillColor(style.headerBackground).rect(left, y, width, height).fill().restore()
    doc.fillColor(style.textColor).strokeColor(style.borderColor).lineWidth(0.6).rect(left, y, width, height).stroke()
    doc.moveTo(left + logoWidth, y).lineTo(left + logoWidth, y + height).stroke()
    doc.moveTo(left + width - yearWidth, y).lineTo(left + width - yearWidth, y + height).stroke()
    const logo = resolveLogo(snapshot.logoUrl)
    if (logo) { try { doc.image(logo, left + 8, y + 8, { fit: [logoWidth - 16, height - 16], align: 'center', valign: 'center' }) } catch { /* conserva el encabezado si el logo no es compatible */ } }
    doc.text(lines, left + logoWidth + 8, y + 10, { width: centerWidth - 16, align: 'center' })
    doc.fontSize(9).text(`AÑO LECTIVO\n${snapshot.yearName}`, left + width - yearWidth + 6, y + 22, { width: yearWidth - 12, align: 'center' })
    doc.font('Helvetica').fontSize(10).fillColor(style.textColor)
    doc.x = left; doc.y = y + height + 16
  }
  function room(height: number) { if (doc.y + height > doc.page.height - doc.page.margins.bottom - 15) doc.addPage({ size: 'A4', layout: 'portrait', margin: 34 }) }
  function paragraph(label: string, text: string) {
    room(42)
    const y = doc.y
    doc.save().fillColor(style.headerBackground).rect(left, y, width, 18).fill().restore()
    doc.font('Helvetica-Bold').fontSize(10).fillColor(style.textColor).text(label, left + 5, y + 3, { width: width - 10 })
    doc.x = left; doc.y = y + 21
    doc.font('Helvetica').text(text || '________________________________________________________________', left, doc.y + 3, { width, paragraphGap: 5 })
    doc.moveDown(0.7)
  }
  function row(label: string, text: string) {
    const labelWidth = 145
    doc.font('Helvetica').fontSize(9)
    const height = Math.max(26, doc.heightOfString(text || '—', { width: width - labelWidth - 14 }) + 12)
    room(height)
    const y = doc.y
    doc.save().fillColor(style.headerBackground).rect(left, y, labelWidth, height).fill().restore()
    doc.strokeColor(style.borderColor).rect(left, y, width, height).stroke()
    doc.moveTo(left + labelWidth, y).lineTo(left + labelWidth, y + height).stroke()
    doc.font('Helvetica-Bold').text(label, left + 6, y + 6, { width: labelWidth - 12 })
    doc.font('Helvetica').text(text || '—', left + labelWidth + 6, y + 6, { width: width - labelWidth - 12 })
    doc.x = left; doc.y = y + height
  }
  function signatures(people: Array<{ name: string; role: string }>) {
    const columns = [width * 0.41, width * 0.36, width * 0.23]
    function cells(values: string[], height: number, bold = false) {
      const y = doc.y; let x = left
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
      values.forEach((value, i) => { if (bold) doc.save().fillColor(style.tableHeaderBackground).rect(x, y, columns[i], height).fill().restore(); doc.fillColor(style.textColor).strokeColor(style.borderColor).rect(x, y, columns[i], height).stroke(); doc.text(value, x + 6, y + 7, { width: columns[i] - 12 }); x += columns[i] })
      doc.x = left; doc.y = y + height
    }
    room(65); cells(['Nombres', 'Cargo / función', 'Firma'], 28, true)
    const rows = people.length ? people : Array.from({ length: 3 }, () => ({ name: '', role: '' }))
    for (const p of rows) {
      doc.font('Helvetica').fontSize(9)
      const height = Math.max(38, doc.heightOfString(p.name, { width: columns[0] - 12 }) + 16, doc.heightOfString(p.role, { width: columns[1] - 12 }) + 16)
      if (doc.y + height > doc.page.height - doc.page.margins.bottom - 15) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 34 }); cells(['Nombres', 'Cargo / función', 'Firma'], 28, true) }
      cells([p.name, p.role, ''], height)
    }
  }
  header()
  doc.on('pageAdded', header)
  try {
    if (kind === 'CALL') {
      row('Fecha de convocatoria', formatDate(m.invitationDate))
      row('Fecha de reunión', formatDate(m.meetingDate))
      row('Responsable', m.responsible)
      if (m.phone || m.email) row('Contacto', [m.phone, m.email].filter(Boolean).join(' · '))
      doc.moveDown(); paragraph('ANTECEDENTES DE LA CONVOCATORIA', m.background)
      paragraph('ORDEN DEL DÍA', m.agenda)
      row('Lugar', m.location); row('Horario', `${m.startTime}${m.scheduledEndTime ? ` – ${m.scheduledEndTime}` : ''}`)
      doc.moveDown(); room(30); doc.font('Helvetica-Bold').fontSize(10).text('CONVOCADOS', left, doc.y, { width }); doc.moveDown(0.5)
      signatures(m.participants)
    } else if (kind === 'ATTENDANCE') {
      row('Fecha', formatDate(m.meetingDate)); row('Lugar', m.location); row('Hora de inicio', m.startTime)
      doc.moveDown(); paragraph('ORDEN DEL DÍA', m.agenda)
      signatures(m.participants)
    } else {
      row('Fecha de reunión', formatDate(m.meetingDate)); row('Lugar', m.location); row('Hora de inicio', m.startTime)
      doc.moveDown(); paragraph('ORDEN DEL DÍA', m.agenda)
      const present = m.participants.filter((p) => p.attendance === 'present')
      paragraph('ASISTENCIA', `Asistentes registrados: ${present.length}. Inasistencias registradas: ${m.participants.filter((p) => p.attendance === 'absent').length}. Sin registrar: ${m.participants.filter((p) => p.attendance === 'pending').length}.`)
      paragraph('DESARROLLO DE LOS PUNTOS TRATADOS', m.development)
      for (const report of options.reports ?? []) paragraph(`${report.title} · ${report.authorName}${report.subjectName ? ` · ${report.subjectName}` : ''}`, `${report.labels.situation}: ${report.situation}\n${report.labels.actions}: ${report.actions || '—'}\n${report.labels.recommendations}: ${report.recommendations || '—'}`)
      paragraph('ACUERDOS Y CONCLUSIONES', options.conclusions || '')
      paragraph('ACEPTACIÓN', `Siendo las ${m.actualEndTime || '________'} del ${formatDate(m.meetingDate)}, se da por finalizada la junta de ${course}. Para constancia de conformidad y aceptación firman:`)
      if (!present.length) doc.fontSize(9).text('No hay asistentes registrados en el sistema; completar las firmas de quienes participaron.', left, doc.y, { width }).moveDown()
      signatures(present)
    }
  } finally { doc.removeListener('pageAdded', header) }
}

export function buildMeetingPdf(snapshot: BoardSnapshot, kind: 'CALL' | 'ATTENDANCE'): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk)); doc.on('error', reject); doc.on('end', () => resolve(Buffer.concat(chunks)))
    installBoardWatermark(doc, snapshot)
    drawMeetingContent(doc, snapshot, kind)
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i); const bottom = doc.page.margins.bottom; doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7).text(`Página ${i + 1} de ${range.count}`, 34, doc.page.height - 28, { width: doc.page.width - 68, align: 'center', lineBreak: false })
      doc.page.margins.bottom = bottom
    }
    doc.end()
  })
}
