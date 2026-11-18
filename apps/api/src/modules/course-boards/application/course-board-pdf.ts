import { documentStyle, installBoardWatermark } from './board-pdf-style'
import { drawMeetingContent } from './meeting-pdf'
import PDFDocument from 'pdfkit'
import type { BoardSnapshot, BoardReportDocument } from '../domain/course-board.types'

export function buildBoardPdf(snapshot: BoardSnapshot, options: { report?: BoardReportDocument; conclusions?: string; chairName?: string; reports?: BoardReportDocument[] } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const paperSize = !options.report && (snapshot.subjects.length > 11 || snapshot.rows.length > 27) ? 'A3' : 'A4'
    const doc = new PDFDocument({ size: paperSize, layout: options.report ? 'portrait' : 'landscape', margin: 34, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    const style = documentStyle(snapshot)
    installBoardWatermark(doc, snapshot)
    doc.fillColor(style.textColor)
    function header(title: string) {
      const y = doc.y, width = doc.page.width - 68
      doc.font('Helvetica-Bold').fontSize(13)
      const height = doc.heightOfString(snapshot.institutionName, { width }) + doc.fontSize(11).heightOfString(title, { width }) + 26
      doc.save().fillColor(style.headerBackground).rect(34, y - 4, width, height).fill().restore()
      doc.fillColor(style.textColor).font('Helvetica-Bold').fontSize(13).text(snapshot.institutionName, { align: 'center' })
      doc.fontSize(11).text(title, { align: 'center' })
      doc.font('Helvetica').fontSize(9).text(`${snapshot.parallelName}${snapshot.meeting?.shift ? ` ${snapshot.meeting.shift}` : ''} · ${snapshot.yearName} · ${snapshot.periodName}`, { align: 'center' })
      doc.moveDown(0.6)
    }
    function paragraph(label: string, text: string) {
      if (doc.y > doc.page.height - 90) doc.addPage()
      doc.font('Helvetica-Bold').fontSize(10).text(label)
      doc.font('Helvetica').fontSize(10).text(text || '—', { width: doc.page.width - 68 })
      doc.moveDown(0.7)
    }
    if (options.report) {
      const r = options.report
      header(r.title)
      paragraph('Docente', r.authorName)
      if (r.subjectName) paragraph('Asignatura', r.subjectName)
      paragraph(r.labels.situation, r.situation)
      paragraph(r.labels.actions, r.actions)
      paragraph(r.labels.recommendations, r.recommendations)
      doc.moveDown(2).text('Firma: ___________________________________')
    } else {
      // Una sola matriz: nunca separa las materias en bloques.
      const subjects = snapshot.subjects
      const table = () => {
        const nameWidth = 190, numberWidth = 24, tableWidth = doc.page.width - 68
        const colWidth = (tableWidth - nameWidth - numberWidth) / Math.max(subjects.length, 1)
        const fontSize = colWidth < 45 ? 7 : 8
        doc.font('Helvetica-Bold').fontSize(fontSize)
        const headingHeight = Math.max(22, ...subjects.map((subject) => doc.heightOfString(subject.name, { width: colWidth - 6 }))) + 8
        doc.font('Helvetica').fontSize(fontSize)
        const heights = snapshot.rows.map((row) => Math.max(14, doc.heightOfString(row.name, { width: nameWidth - 8 }) + 5))
        function tableHeader() {
          header(`${snapshot.config.title} · Consolidado`)
          const y = doc.y
          doc.font('Helvetica-Bold').fontSize(fontSize)
          doc.save().fillColor(style.tableHeaderBackground).rect(34, y - 3, tableWidth, headingHeight).fill().restore()
          doc.text('N.º', 37, y, { width: numberWidth - 4, height: headingHeight - 4 })
          doc.text('Apellidos y nombres', 34 + numberWidth + 3, y, { width: nameWidth - 6, height: headingHeight - 4 })
          subjects.forEach((subject, i) => doc.text(subject.name, 34 + numberWidth + nameWidth + i * colWidth + 3, y, { width: colWidth - 6, height: headingHeight - 4, align: 'center' }))
          doc.x = 34; doc.y = y + headingHeight
        }
        tableHeader()
        snapshot.rows.forEach((row, index) => {
          const height = heights[index]
          if (doc.y + height > doc.page.height - 64) { doc.addPage({ size: paperSize, layout: 'landscape', margin: 34 }); tableHeader() }
          const y = doc.y
          doc.font('Helvetica').fontSize(fontSize).text(String(index + 1), 37, y, { width: numberWidth - 4 })
          doc.text(row.name, 34 + numberWidth + 3, y, { width: nameWidth - 8 })
          subjects.forEach((subject, i) => {
            const grade = row.grades.find((item) => item.assignmentId === subject.id)
            doc.text(`${grade?.display ?? '—'}${grade?.partial ? ' *' : ''}`, 34 + numberWidth + nameWidth + i * colWidth + 3, y, { width: colWidth - 6, align: 'center' })
          })
          doc.moveTo(34, y + height - 3).lineTo(doc.page.width - 34, y + height - 3).strokeColor(style.borderColor).lineWidth(0.3).stroke()
          doc.x = 34; doc.y = y + height
        })
        doc.fontSize(7).text('— Sin calificación registrada. * Faltan componentes de la nota del período.', 34, doc.y + 4, { width: tableWidth })
        return 0
      }
      table()
      if (options.conclusions !== undefined) {
        if (snapshot.meeting) {
          doc.addPage({ size: 'A4', layout: 'portrait', margin: 34 })
          drawMeetingContent(doc, snapshot, 'MINUTES', options)
        } else {
        doc.addPage(); header(`${snapshot.config.title} · Acta de cierre`)
        paragraph('Tutor/a', snapshot.tutorName)
        paragraph('Dirige la reunión', options.chairName || snapshot.tutorName)
        for (const report of options.reports ?? []) {
          paragraph(`${report.title} · ${report.authorName}${report.subjectName ? ` · ${report.subjectName}` : ''}`, `${report.labels.situation}: ${report.situation}\n${report.labels.actions}: ${report.actions || '—'}\n${report.labels.recommendations}: ${report.recommendations || '—'}`)
        }
        paragraph('Acuerdos y conclusiones', options.conclusions)
        doc.moveDown(2).text('Firma de quien dirige: _________________________     Firma del tutor: _________________________')
        }
      }
    }
    const range = doc.bufferedPageRange()
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i)
      const bottomMargin = doc.page.margins.bottom
      doc.page.margins.bottom = 0
      doc.font('Helvetica').fontSize(7).fillColor('#555555').text(
        `Emitido: ${new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(new Date(snapshot.generatedAt))} · Página ${i + 1} de ${range.count}`,
        34, doc.page.height - 32, { width: doc.page.width - 68, lineBreak: false, align: 'center' },
      )
      doc.page.margins.bottom = bottomMargin
    }
    doc.end()
  })
}
