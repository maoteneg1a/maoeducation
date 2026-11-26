import type { BulletinPdfData } from './bulletin-pdf.service'

/** Informe exclusivo de Primero por competencias, con sus valoraciones históricas. */
export function drawPreparatoryBulletin(doc: PDFKit.PDFDocument, data: BulletinPdfData, logo: Buffer | string | null) {
  const report = data.preparatoria!
  const left = 24, width = doc.page.width - 48, bottom = doc.page.height - 42
  const labelWidth = width * 0.58, colWidth = (width - labelWidth) / Math.max(data.periods.length, 1)
  let y = 24, page = 0
  function font(size = 9, bold = false) { doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor('#172033') }
  function height(value: string, w: number, size = 9, bold = false) { font(size, bold); return doc.heightOfString(value, { width: w, lineGap: 2 }) }
  function text(value: string, x: number, top: number, w: number, size = 9, bold = false) { font(size, bold); doc.text(value, x, top, { width: w, lineGap: 2 }) }
  function header() {
    page++; y = 24
    if (logo) { try { doc.image(logo, left, y, { fit: [42, 42] }) } catch { /* Un logo inválido no impide emitir el informe. */ } }
    const institutionHeight = height(data.institutionName, width - 60, 12, true)
    text(data.institutionName, left + 52, y, width - 60, 12, true)
    y += Math.max(52, institutionHeight + 10)
    const baseTitle = data.title || 'INFORME DE COMPETENCIAS'
    const title = baseTitle.toLocaleLowerCase('es').includes('preparatoria') ? baseTitle : `${baseTitle} · PREPARATORIA`
    text(title, left, y, width, 11, true); y += height(title, width, 11, true) + 8
    const student = `${data.studentName} · Identificación: ${data.studentDni ?? '—'}`
    text(student, left, y, width, 9, true); y += height(student, width, 9, true) + 6
    const course = `${data.levelName} ${data.parallelName} · ${data.yearName} · Tutor/a: ${data.tutorName || '—'}`
    text(course, left, y, width); y += height(course, width) + 12
    const headingHeight = Math.max(26, ...data.periods.map(p => height(p.name, colWidth - 8, 8, true) + 12))
    doc.rect(left, y, width, headingHeight).fill('#edf2f8')
    text('Ámbito / competencia evaluada', left + 6, y + 6, labelWidth - 12, 9, true)
    data.periods.forEach((p, i) => text(p.name, left + labelWidth + i * colWidth + 4, y + 6, colWidth - 8, 8, true))
    y += headingHeight
    // El pie tiene posición absoluta; no debe crear una página automática adicional.
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(7).fillColor('#64748b').text(`Auleka · Preparatoria · página ${page}`, left, doc.page.height - 26, { width, align: 'right', lineBreak: false })
    doc.page.margins.bottom = margin
  }
  function next() { doc.addPage({ size: 'A4', layout: 'landscape', margin: 24 }); header() }
  function need(h: number) { if (y + h > bottom) next() }
  function prefix(value: string, w: number, available: number) {
    let low = 0, high = value.length
    while (low < high) {
      const mid = Math.ceil((low + high) / 2)
      if (height(value.slice(0, mid), w) <= available) low = mid
      else high = mid - 1
    }
    if (low < value.length) {
      const boundary = Math.max(value.lastIndexOf(' ', low - 1), value.lastIndexOf('\n', low - 1))
      if (boundary >= low * 0.8) low = boundary + 1
    }
    return low
  }
  function paragraph(title: string, value: string) {
    let remaining = value || '—', continuation = false
    while (remaining) {
      const label = `${title}${continuation ? ' (continuación)' : ''}`
      const labelHeight = height(label, width - 12, 9, true) + 8
      need(labelHeight + 32)
      const count = prefix(remaining, width - 12, bottom - y - labelHeight - 12)
      if (!count) { next(); continue }
      const chunk = remaining.slice(0, count)
      text(label, left + 6, y + 4, width - 12, 9, true)
      text(chunk, left + 6, y + labelHeight, width - 12)
      y += labelHeight + height(chunk, width - 12) + 12
      remaining = remaining.slice(count); continuation = true
    }
  }
  function ambitHeading(name: string) {
    const h = Math.max(24, height(name, width - 12, 9, true) + 12)
    need(h + 34); doc.rect(left, y, width, h).fill('#e9eef5'); text(name, left + 6, y + 6, width - 12, 9, true); y += h
  }
  header()
  for (const ambit of report.axes.flatMap(axis => report.ambits.filter(ambit => ambit.axis === axis.id).map(ambit => ({
    ...ambit, name: `${axis.name} · ${ambit.name}`,
  })))) {
    const rows = report.rows.filter(row => row.ambit === ambit.id)
    if (!rows.length) continue
    ambitHeading(ambit.name)
    for (const row of rows) {
      let remaining = `${row.historical ? 'Indicador histórico · ' : ''}${row.code} · ${row.text}`
      while (remaining) {
        const previous = page
        need(34)
        if (previous !== page) ambitHeading(`${ambit.name} (continuación)`)
        const count = prefix(remaining, labelWidth - 12, bottom - y - 12)
        if (!count) { next(); ambitHeading(`${ambit.name} (continuación)`); continue }
        const chunk = remaining.slice(0, count), h = Math.max(32, height(chunk, labelWidth - 12) + 12)
        text(chunk, left + 6, y + 6, labelWidth - 12)
        data.periods.forEach((p, i) => {
          const cell = row.periods[p.id]
          text(cell?.code ?? (cell?.selected ? 'Pendiente' : '—'), left + labelWidth + i * colWidth + 4, y + 8, colWidth - 8, 9, true)
        })
        doc.strokeColor('#dce3ec').lineWidth(0.5).moveTo(left, y + h).lineTo(left + width, y + h).stroke()
        y += h; remaining = remaining.slice(count)
      }
    }
  }
  y += 10
  paragraph('Lectura del informe', 'Pendiente: competencia seleccionada sin valoración. —: no seleccionada en este período. NE: no trabajada.')
  paragraph('Escala cualitativa', report.scale.map(s => `${s.code}: ${s.label}`).join(' · '))
  for (const p of data.periods) {
    const comment = report.comments.find(c => c.periodId === p.id)?.text
    if (comment) paragraph(`${p.name} · Fortalezas y recomendaciones`, comment)
    const notes = report.rows.filter(row => row.periods[p.id]?.notes).map(row => `${row.code}: ${row.periods[p.id].notes}`).join('\n')
    if (notes) paragraph(`${p.name} · Observaciones de evaluación`, notes)
    const attendance = data.attendanceByPeriod.find(a => a.periodId === p.id), behavior = data.behaviorByPeriod.find(b => b.periodId === p.id)
    paragraph(`${p.name} · Asistencia y comportamiento`, `${attendance ? `Días asistidos: ${attendance.attendedDays} · Faltas justificadas: ${attendance.justifiedAbsences} · Faltas injustificadas: ${attendance.unjustifiedAbsences} · Atrasos: ${attendance.lateCount}` : 'Sin registro de asistencia'}\nComportamiento: ${behavior?.code ?? 'Pendiente'}${behavior?.notes ? ` · ${behavior.notes}` : ''}`)
  }
  for (const r of data.recommendations ?? []) paragraph(`${data.periods.find(p => p.id === r.periodId)?.name ?? ''} · Recomendaciones`, r.text)
  const teacher = `${data.teacherLabel || 'Docente tutor/a'}: ${data.tutorName || '________________'}`
  const director = `${data.directorRole || 'Director/a'}: ${data.directorName || '________________'}`
  need(Math.max(height(teacher, width / 2 - 12), height(director, width / 2 - 12)) + 60)
  y += 30
  text('____________________________', left, y, width / 2, 10); text('____________________________', left + width / 2, y, width / 2, 10)
  y += 20; text(teacher, left, y, width / 2 - 12); text(director, left + width / 2, y, width / 2 - 12)
}
