import { drawMeetingContent } from './meeting-pdf'
import PDFDocument from 'pdfkit'
import type { BoardSnapshot, BoardReportDocument } from '../domain/course-board.types'

export function buildBoardPdf(snapshot: BoardSnapshot, options: { report?: BoardReportDocument; conclusions?: string; chairName?: string; reports?: BoardReportDocument[] } = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: options.report ? 'portrait' : 'landscape', margin: 34, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('error', reject)
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    function header(title: string) {
      doc.font('Helvetica-Bold').fontSize(13).text(snapshot.institutionName, { align: 'center' })
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
      // Distribuye materias en bloques; repite encabezados y alumnos en cada bloque.
      const blocks = Math.max(1, Math.ceil(snapshot.subjects.length / 8))
      for (let block = 0; block < blocks; block++) {
        if (block) doc.addPage()
        const subjects = snapshot.subjects.slice(block * 8, (block + 1) * 8)
        const nameWidth = 210, colWidth = (doc.page.width - 68 - nameWidth - 30) / Math.max(subjects.length, 1)
        function tableHeader() {
          header(`${snapshot.config.title} · Consolidado${blocks > 1 ? ` (${block + 1}/${blocks})` : ''}`)
          const y = doc.y
          doc.font('Helvetica-Bold').fontSize(8)
          const headingHeight = Math.max(34, ...subjects.map((s) => doc.heightOfString(s.name, { width: colWidth - 4 }))) + 8
          doc.text('N.º', 34, y, { width: 27, height: headingHeight - 4 })
          doc.text('Apellidos y nombres', 64, y, { width: nameWidth - 4, height: headingHeight - 4 })
          subjects.forEach((s, i) => doc.text(s.name, 64 + nameWidth + i * colWidth, y, { width: colWidth - 4, height: headingHeight - 4 }))
          doc.y = y + headingHeight
        }
        tableHeader()
        snapshot.rows.forEach((row, index) => {
          const height = Math.max(24, doc.font('Helvetica').fontSize(8).heightOfString(row.name, { width: nameWidth - 8 }) + 8)
          if (doc.y + height > doc.page.height - 60) { doc.addPage(); tableHeader() }
          const y = doc.y
          doc.font('Helvetica').fontSize(8).text(String(index + 1), 34, y, { width: 27 })
          doc.text(row.name, 64, y, { width: nameWidth - 8 })
          subjects.forEach((s, i) => {
            const g = row.grades.find((item) => item.assignmentId === s.id)
            doc.text(`${g?.display ?? '—'}${g?.partial ? ' *' : ''}`, 64 + nameWidth + i * colWidth, y, { width: colWidth - 4 })
          })
          doc.moveTo(34, y + height - 4).lineTo(doc.page.width - 34, y + height - 4).strokeColor('#dddddd').stroke()
          doc.y = y + height
        })
        doc.fontSize(8).text('— Sin calificación registrada. * Faltan componentes de la nota del período.', 34, doc.y + 4, { width: doc.page.width - 68 })
      }
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
