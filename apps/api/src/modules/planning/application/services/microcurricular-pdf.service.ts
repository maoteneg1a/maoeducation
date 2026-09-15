import PDFDocument from 'pdfkit'
import { resolveLogo } from '../../../../shared/infrastructure/services/pdf-helpers'

export interface MicrocurricularSignatory {
  role: string
  name: string | null
  date: Date | null
}

export interface MicrocurricularMoment {
  estrategiasDua?: string
  recursos?: string
  tecnica?: string
  instrumento?: string
}

export interface MicrocurricularWeek {
  weekNumber: number
  name: string | null
  startDate: Date | null
  endDate: Date | null
  competenciasEspecificas: string | null
  indicadoresEvaluacion: string | null
  saberes: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  momentos: {
    anticipacion?: MicrocurricularMoment
    construccionConocimiento?: MicrocurricularMoment
    consolidacion?: MicrocurricularMoment
  }
}

export interface MicrocurricularPdfData {
  institutionName: string
  logoUrl?: string | null
  yearName: string
  teacherName: string
  subjectName: string
  levelName: string
  parallelName: string
  periodName: string
  situationTitle: string
  situationDescription: string | null
  interdisciplinaryAreaNames: string[]
  weeks: MicrocurricularWeek[]
  signatories: MicrocurricularSignatory[]
}

const MOMENT_LABEL: Record<keyof MicrocurricularWeek['momentos'], string> = {
  anticipacion: 'ANTICIPACIÓN',
  construccionConocimiento: 'CONSTRUCCIÓN DEL CONOCIMIENTO',
  consolidacion: 'CONSOLIDACIÓN',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

type Doc = InstanceType<typeof PDFDocument>

/** ── Motor mínimo de tablas: celdas con borde real, altura auto-calculada por texto ── */

interface Cell {
  text: string
  width: number
  bold?: boolean
  fill?: string
  align?: 'left' | 'center'
  fontSize?: number
}

function cellHeight(doc: Doc, cell: Cell): number {
  doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cell.fontSize ?? 8.5)
  const h = doc.heightOfString(cell.text || ' ', { width: cell.width - 8 })
  return Math.max(h + 8, 18)
}

function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom
  if (doc.y + needed > bottom) doc.addPage()
}

/** Dibuja una fila de celdas con borde, ajustando la altura a la celda más alta. */
function drawRow(doc: Doc, x0: number, cells: Cell[]): number {
  const rowHeight = Math.max(...cells.map((c) => cellHeight(doc, c)))
  ensureSpace(doc, rowHeight + 2)
  const y = doc.y
  let x = x0
  for (const cell of cells) {
    if (cell.fill) doc.save().fillColor(cell.fill).rect(x, y, cell.width, rowHeight).fill().restore()
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y, cell.width, rowHeight).stroke()
    doc
      .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(cell.fontSize ?? 8.5)
      .fillColor('#111111')
      .text(cell.text, x + 4, y + 4, { width: cell.width - 8, align: cell.align ?? 'left' })
    x += cell.width
  }
  doc.y = y + rowHeight
  return rowHeight
}

/** Título de sección con banda gris de ancho completo. */
function drawSectionBand(doc: Doc, x0: number, width: number, text: string) {
  drawRow(doc, x0, [{ text, width, bold: true, fill: '#e5e5e5', align: 'center' }])
}

/**
 * Tabla de saberes tal como el formato oficial: "Indicadores de evaluación" es una
 * columna alta (una sola celda que abarca las 2 filas de encabezado + contenido de
 * "Saberes"), y "Saberes" es un título que abarca las 3 columnas Declarativos/
 * Procedimentales/Actitudinales. Se dibuja a mano porque el motor genérico de filas
 * no soporta celdas que abarcan varias filas (rowspan).
 */
function drawSaberesTable(
  doc: Doc,
  x0: number,
  fullWidth: number,
  indicadores: string,
  columns: { label: string; text: string }[],
) {
  const indicW = fullWidth * 0.22
  const colW = (fullWidth - indicW) / columns.length

  // Altura de la fila de encabezado (banda "Saberes" + fila con los 3 subtítulos, medida junta)
  const headerH = 18
  const subHeaderH = 18
  // Altura del contenido: la mayor entre "Indicadores" y las 3 columnas
  const indicHeight = Math.max(cellHeight(doc, { text: indicadores, width: indicW }), 18)
  const colHeights = columns.map((c) => cellHeight(doc, { text: c.text, width: colW }))
  const contentH = Math.max(indicHeight, ...colHeights)

  const totalRowspanHeight = headerH + subHeaderH + contentH
  ensureSpace(doc, totalRowspanHeight + 2)
  const y0 = doc.y

  // Columna "Indicadores de evaluación": una sola celda alta con la etiqueta arriba y el
  // contenido debajo, igual que el formato oficial.
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0, y0, indicW, totalRowspanHeight).stroke()
  doc.save().fillColor('#f2f2f2').rect(x0, y0, indicW, headerH).fill().restore()
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0, y0, indicW, headerH).stroke()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text('Indicadores de evaluación', x0 + 4, y0 + 4, {
    width: indicW - 8,
    align: 'center',
  })
  doc.font('Helvetica').fontSize(8.5).text(indicadores, x0 + 4, y0 + headerH + subHeaderH + 4, { width: indicW - 8 })

  // Banda "Saberes" arriba de las 3 columnas
  const saberesW = fullWidth - indicW
  doc.save().fillColor('#e5e5e5').rect(x0 + indicW, y0, saberesW, headerH).fill().restore()
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0 + indicW, y0, saberesW, headerH).stroke()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text('Saberes', x0 + indicW, y0 + 4, { width: saberesW, align: 'center' })

  // Sub-encabezados (Declarativos | Procedimentales | Actitudinales) — misma fila, debajo de "Saberes"
  let x = x0 + indicW
  for (const col of columns) {
    doc.save().fillColor('#f2f2f2').rect(x, y0 + headerH, colW, subHeaderH).fill().restore()
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y0 + headerH, colW, subHeaderH).stroke()
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text(col.label, x + 4, y0 + headerH + 4, {
      width: colW - 8,
      align: 'center',
    })
    x += colW
  }

  // Contenido de cada columna de saberes
  x = x0 + indicW
  for (const col of columns) {
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y0 + headerH + subHeaderH, colW, contentH).stroke()
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(col.text, x + 4, y0 + headerH + subHeaderH + 4, { width: colW - 8 })
    x += colW
  }

  doc.y = y0 + totalRowspanHeight
}

/** Genera el PDF de "Planificación Microcurricular" reproduciendo el formato oficial institucional, en tablas reales. */
export function buildMicrocurricularPdf(data: MicrocurricularPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const half = fullWidth / 2

    // ── Encabezado con logo ──
    const logo = resolveLogo(data.logoUrl)
    const logoW = logo ? 50 : 0
    if (logo) {
      try {
        doc.image(logo, x0, doc.y, { width: 40 })
      } catch { /* logo inválido, se omite */ }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .text(data.institutionName.toUpperCase(), x0 + logoW, doc.y, { width: fullWidth - logoW, align: 'center' })
    doc.moveDown(0.4)
    doc.moveTo(x0, doc.y).lineTo(x0 + fullWidth, doc.y).lineWidth(1.5).strokeColor('#333333').stroke()
    doc.moveDown(0.5)

    // ── Tabla: nombre institución | año lectivo ──
    drawRow(doc, x0, [
      { text: data.institutionName.toUpperCase(), width: half, bold: true },
      { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, align: 'center' },
    ])
    drawSectionBand(doc, x0, fullWidth, 'Planificación Microcurricular')

    // ── Datos informativos ──
    drawSectionBand(doc, x0, fullWidth, 'Datos informativos:')
    drawRow(doc, x0, [
      { text: 'Docente:', width: fullWidth * 0.15, bold: true },
      { text: data.teacherName, width: fullWidth * 0.85 },
    ])
    drawRow(doc, x0, [
      { text: 'Asignatura:', width: fullWidth * 0.13, bold: true },
      { text: data.subjectName, width: fullWidth * 0.32 },
      { text: 'Grado/Curso:', width: fullWidth * 0.13, bold: true },
      { text: data.levelName, width: fullWidth * 0.22 },
      { text: 'Paralelo:', width: fullWidth * 0.08, bold: true },
      { text: data.parallelName, width: fullWidth * 0.12 },
    ])
    drawRow(doc, x0, [
      { text: 'Trimestre:', width: fullWidth * 0.15, bold: true },
      { text: data.periodName.toUpperCase(), width: fullWidth * 0.85 },
    ])

    // ── Situación de aprendizaje ──
    drawSectionBand(doc, x0, fullWidth, 'Situación de aprendizaje')
    drawRow(doc, x0, [
      { text: 'Título:', width: fullWidth * 0.18, bold: true },
      { text: data.situationTitle, width: fullWidth * 0.82 },
    ])
    drawRow(doc, x0, [
      { text: 'Descripción:', width: fullWidth * 0.18, bold: true },
      { text: data.situationDescription ?? '', width: fullWidth * 0.82 },
    ])

    // ── Conexión interdisciplinar ──
    drawSectionBand(doc, x0, fullWidth, 'Conexión interdisciplinar')
    drawRow(doc, x0, [
      { text: 'Asignaturas:', width: fullWidth * 0.25, bold: true },
      { text: data.interdisciplinaryAreaNames.join(', '), width: fullWidth * 0.75 },
    ])
    doc.moveDown(0.3)

    // ── Semanas ──
    for (const week of data.weeks) {
      ensureSpace(doc, 40)
      const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
      drawSectionBand(doc, x0, fullWidth, weekLabel)

      // "Competencias específicas" es un título de sección propio (como en el formato oficial),
      // no una etiqueta en línea — el contenido va en la celda blanca de abajo.
      drawSectionBand(doc, x0, fullWidth, 'Competencias específicas')
      drawRow(doc, x0, [{ text: week.competenciasEspecificas ?? '', width: fullWidth }])

      // Tabla de saberes: "Indicadores de evaluación" (columna alta) | "Saberes" (banda con
      // Declarativos/Procedimentales/Actitudinales debajo) — igual que el formato oficial.
      const declarativos = week.saberes.filter((s) => s.type === 'declarativo')
      const procedimentales = week.saberes.filter((s) => s.type === 'procedimental')
      const actitudinales = week.saberes.filter((s) => s.type === 'actitudinal')
      const joinSaberes = (list: typeof declarativos) => list.map((s) => `${s.code}: ${s.description}`).join('\n')

      drawSaberesTable(doc, x0, fullWidth, week.indicadoresEvaluacion ?? '', [
        { label: 'Declarativos', text: joinSaberes(declarativos) },
        { label: 'Procedimentales', text: joinSaberes(procedimentales) },
        { label: 'Actitudinales', text: joinSaberes(actitudinales) },
      ])

      // Tabla de metodología: Estrategias DUA | Recursos | Técnicas e instrumentos — 3 filas de momento
      const colW = fullWidth / 3
      drawRow(doc, x0, [
        { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Recursos', width: colW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: '#f2f2f2', align: 'center' },
      ])
      for (const key of ['anticipacion', 'construccionConocimiento', 'consolidacion'] as const) {
        const moment = week.momentos[key] ?? {}
        const tecnicaInstrumento = `Técnica: ${moment.tecnica ?? ''}\nInstrumento: ${moment.instrumento ?? ''}`
        drawRow(doc, x0, [
          { text: `${MOMENT_LABEL[key]}\n${moment.estrategiasDua ?? ''}`, width: colW },
          { text: moment.recursos ?? '', width: colW },
          { text: tecnicaInstrumento, width: colW },
        ])
      }
      doc.moveDown(0.4)
    }

    // ── Pie de firmas ──
    ensureSpace(doc, 90)
    doc.moveDown(0.3)
    const sigW = fullWidth / data.signatories.length
    drawRow(
      doc,
      x0,
      data.signatories.map((sig) => ({ text: sig.role.toUpperCase(), width: sigW, bold: true, fill: '#f2f2f2', align: 'center' as const })),
    )
    drawRow(
      doc,
      x0,
      data.signatories.map((sig) => ({ text: `Nombres: ${sig.name ?? '_______________'}`, width: sigW })),
    )
    drawRow(
      doc,
      x0,
      data.signatories.map(() => ({ text: 'Firma: _______________', width: sigW })),
    )
    drawRow(
      doc,
      x0,
      data.signatories.map((sig) => ({ text: `Fecha: ${fmtDate(sig.date)}`, width: sigW })),
    )

    doc.end()
  })
}
