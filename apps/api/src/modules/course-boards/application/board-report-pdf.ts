import type PDFKit from 'pdfkit'
import { resolveLogo } from '../../../shared/infrastructure/services/pdf-helpers'
import type { BoardReportDocument, BoardSnapshot } from '../domain/course-board.types'
import { documentStyle } from './board-pdf-style'

type Doc = InstanceType<typeof PDFKit>

/** Informe con la misma cabecera/tablas de la junta y celdas medidas antes de dibujar. */
export function drawBoardReport(doc: Doc, snapshot: BoardSnapshot, report: BoardReportDocument) {
  const style = documentStyle(snapshot)
  const left = doc.page.margins.left
  const width = doc.page.width - left - doc.page.margins.right
  const bottom = () => doc.page.height - 62
  const textOptions = { width: width - 16, lineGap: 2, paragraphGap: 4 }
  const logo = resolveLogo(snapshot.logoUrl)
  function header() {
    const top = doc.page.margins.top, logoWidth = 72, yearWidth = 90
    const centerWidth = width - logoWidth - yearWidth
    const title = `${report.institutionName.toUpperCase()}\n${report.title.toUpperCase()}\n${report.parallelName}${snapshot.meeting?.shift ? ` · ${snapshot.meeting.shift}` : ''}`
    doc.font('Helvetica-Bold').fontSize(10)
    const centerHeight = doc.heightOfString(title, { width: centerWidth - 16 })
    doc.fontSize(9)
    const yearHeight = doc.heightOfString(`AÑO LECTIVO\n${report.yearName}`, { width: yearWidth - 12 })
    const height = Math.max(76, centerHeight + 20, yearHeight + 20)
    doc.save().fillColor(style.headerBackground).rect(left, top, width, height).fill().restore()
    doc.strokeColor(style.borderColor).lineWidth(0.6).rect(left, top, width, height).stroke()
    doc.moveTo(left + logoWidth, top).lineTo(left + logoWidth, top + height).stroke()
    doc.moveTo(left + width - yearWidth, top).lineTo(left + width - yearWidth, top + height).stroke()
    if (logo) { try { doc.image(logo, left + 8, top + 8, { fit: [logoWidth - 16, height - 16], align: 'center', valign: 'center' }) } catch { /* mismo encabezado sin imagen si el logo es inválido */ } }
    doc.fillColor(style.textColor).font('Helvetica-Bold').fontSize(10).text(title, left + logoWidth + 8, top + (height - centerHeight) / 2, { width: centerWidth - 16, align: 'center' })
    doc.fontSize(9).text(`AÑO LECTIVO\n${report.yearName}`, left + width - yearWidth + 6, top + (height - yearHeight) / 2, { width: yearWidth - 12, align: 'center' })
    doc.font('Helvetica').fontSize(10)
    doc.x = left; doc.y = top + height + 14
  }
  function room(height: number) {
    if (doc.y + height > bottom()) doc.addPage({ size: 'A4', layout: 'portrait', margin: 34 })
  }
  function metadata(label: string, value: string) {
    const labelWidth = 120
    doc.font('Helvetica-Bold').fontSize(9)
    const labelHeight = doc.heightOfString(label, { width: labelWidth - 12 })
    doc.font('Helvetica')
    const height = Math.max(28, labelHeight + 12, doc.heightOfString(value, { width: width - labelWidth - 12 }) + 12)
    room(height)
    const y = doc.y
    doc.save().fillColor(style.headerBackground).rect(left, y, labelWidth, height).fill().restore()
    doc.strokeColor(style.borderColor).rect(left, y, width, height).stroke()
    doc.moveTo(left + labelWidth, y).lineTo(left + labelWidth, y + height).stroke()
    doc.font('Helvetica-Bold').fontSize(9).text(label, left + 6, y + 6, { width: labelWidth - 12 })
    doc.font('Helvetica').text(value, left + labelWidth + 6, y + 6, { width: width - labelWidth - 12 })
    doc.x = left; doc.y = y + height
  }
  function section(label: string, value: string) {
    let remaining = value || '—', continuation = false
    while (remaining) {
      const heading = `${label}${continuation ? ' (continuación)' : ''}`
      doc.font('Helvetica-Bold').fontSize(10)
      const labelHeight = Math.max(22, doc.heightOfString(heading, { width: width - 16 }) + 10)
      room(labelHeight + 36)
      doc.font('Helvetica').fontSize(10)
      const available = bottom() - doc.y - labelHeight - 16
      // Busca un fragmento que quepa en la celda; conserva saltos de línea y evita partir palabras.
      let low = 0, high = remaining.length
      while (low < high) {
        const middle = Math.ceil((low + high) / 2)
        if (doc.heightOfString(remaining.slice(0, middle), textOptions) <= available) low = middle
        else high = middle - 1
      }
      let count = low
      if (count < remaining.length) {
        const boundary = Math.max(remaining.lastIndexOf(' ', count - 1), remaining.lastIndexOf('\n', count - 1))
        if (boundary >= count * 0.8) count = boundary + 1
      }
      if (!count) { doc.addPage({ size: 'A4', layout: 'portrait', margin: 34 }); continue }
      const chunk = remaining.slice(0, count)
      const bodyHeight = Math.max(16, doc.heightOfString(chunk, textOptions)) + 16
      const y = doc.y
      doc.save().fillColor(style.tableHeaderBackground).rect(left, y, width, labelHeight).fill().restore()
      doc.strokeColor(style.borderColor).rect(left, y, width, labelHeight + bodyHeight).stroke()
      doc.moveTo(left, y + labelHeight).lineTo(left + width, y + labelHeight).stroke()
      doc.font('Helvetica-Bold').fontSize(10).text(heading, left + 8, y + 5, { width: width - 16 })
      doc.font('Helvetica').text(chunk, left + 8, y + labelHeight + 8, textOptions)
      doc.x = left; doc.y = y + labelHeight + bodyHeight + 12
      remaining = remaining.slice(count)
      continuation = true
    }
  }
  header()
  doc.on('pageAdded', header)
  try {
    metadata('Docente', report.authorName)
    metadata('Período', report.periodName)
    metadata('Alcance', report.subjectName || 'General del curso')
    doc.y += 12
    section(report.labels.situation, report.situation)
    section(report.labels.actions, report.actions)
    section(report.labels.recommendations, report.recommendations)
    doc.font('Helvetica').fontSize(9)
    const height = Math.max(68, doc.heightOfString(report.authorName, { width: width - 16 }) + 46)
    room(height)
    const y = doc.y
    doc.font('Helvetica').fontSize(9)
    doc.strokeColor(style.borderColor).rect(left, y, width, height).stroke()
    doc.text('Firma del docente: ___________________________________', left + 8, y + 24, { width: width - 16 })
    doc.text(report.authorName, left + 8, y + 44, { width: width - 16 })
    doc.x = left; doc.y = y + height
  } finally { doc.removeListener('pageAdded', header) }
}
