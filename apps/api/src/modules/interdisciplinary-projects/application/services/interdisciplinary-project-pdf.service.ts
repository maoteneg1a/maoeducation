import PDFDocument from 'pdfkit'
import { resolveLogo } from '../../../../shared/infrastructure/services/pdf-helpers'

export interface ProjectWeekEntryData {
  weekNumber: number
  weekProposito: string | null
  faseInicio: string | null
  faseDesarrollo: string | null
  faseCierre: string | null
  propositoPedagogico: string | null
  evidencias: string | null
}

export interface ProjectContributionData {
  subjectName: string
  teacherName: string
  contribucion: string | null
  responsabilidad: string | null
  competencias: { code: string; description: string }[]
  indicadores: { code: string; text: string }[]
  saberes: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  weekEntries: ProjectWeekEntryData[]
}

export interface InterdisciplinaryProjectPdfData {
  institutionName: string
  logoUrl?: string | null
  levelName: string
  parallelName: string
  periodName: string
  title: string
  situacionReto: string | null
  contexto: string | null
  propositoComun: string | null
  productoFinal: string | null
  weeksCount: number
  status: string
  contributions: ProjectContributionData[]
}

type Doc = InstanceType<typeof PDFDocument>

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

function drawSectionBand(doc: Doc, x0: number, width: number, text: string) {
  drawRow(doc, x0, [{ text, width, bold: true, fill: '#e5e5e5', align: 'center' }])
}

const FASE_LABEL = { inicio: 'Inicio', desarrollo: 'Desarrollo', cierre: 'Cierre' } as const

/** Genera el PDF del Proyecto Interdisciplinario reproduciendo las secciones 6 y 7 del formato de referencia. */
export function buildInterdisciplinaryProjectPdf(data: InterdisciplinaryProjectPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const logo = resolveLogo(data.logoUrl)
    const logoW = logo ? 50 : 0
    if (logo) {
      try {
        doc.image(logo, x0, doc.y, { width: 40 })
      } catch { /* logo inválido, se omite */ }
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(14)
      .text(data.institutionName.toUpperCase(), x0 + logoW, doc.y, { width: fullWidth - logoW, align: 'center' })
    doc.moveDown(0.4)
    doc.moveTo(x0, doc.y).lineTo(x0 + fullWidth, doc.y).lineWidth(1.5).strokeColor('#333333').stroke()
    doc.moveDown(0.5)

    drawSectionBand(doc, x0, fullWidth, 'Proyecto Interdisciplinario')
    drawRow(doc, x0, [{ text: data.title, width: fullWidth, bold: true, align: 'center' }])
    drawRow(doc, x0, [
      { text: 'Grado/Paralelo:', width: fullWidth * 0.15, bold: true },
      { text: `${data.levelName} ${data.parallelName}`, width: fullWidth * 0.35 },
      { text: 'Periodo:', width: fullWidth * 0.15, bold: true },
      { text: data.periodName, width: fullWidth * 0.2 },
      { text: 'Semanas:', width: fullWidth * 0.05, bold: true },
      { text: String(data.weeksCount), width: fullWidth * 0.1, align: 'center' },
    ])
    drawRow(doc, x0, [
      { text: 'Situación / reto:', width: fullWidth * 0.15, bold: true },
      { text: data.situacionReto ?? '', width: fullWidth * 0.85 },
    ])
    drawRow(doc, x0, [
      { text: 'Contexto:', width: fullWidth * 0.15, bold: true },
      { text: data.contexto ?? '', width: fullWidth * 0.85 },
    ])
    drawRow(doc, x0, [
      { text: 'Propósito común:', width: fullWidth * 0.15, bold: true },
      { text: data.propositoComun ?? '', width: fullWidth * 0.85 },
    ])
    drawRow(doc, x0, [
      { text: 'Producto final:', width: fullWidth * 0.15, bold: true },
      { text: data.productoFinal ?? '', width: fullWidth * 0.85 },
    ])

    // ── Sección 6: Aportes disciplinares al proyecto ──
    doc.moveDown(0.4)
    drawSectionBand(doc, x0, fullWidth, '6. APORTES DISCIPLINARES AL PROYECTO')

    for (const c of data.contributions) {
      ensureSpace(doc, 30)
      drawRow(doc, x0, [{ text: c.subjectName.toUpperCase(), width: fullWidth, bold: true, fill: '#f2f2f2' }])
      drawRow(doc, x0, [
        { text: 'Docente:', width: fullWidth * 0.15, bold: true },
        { text: c.teacherName, width: fullWidth * 0.85 },
      ])
      drawRow(doc, x0, [
        { text: 'Competencia curricular:', width: fullWidth * 0.2, bold: true },
        { text: c.competencias.map((x) => `${x.code} — ${x.description}`).join('\n'), width: fullWidth * 0.8 },
      ])
      drawRow(doc, x0, [
        { text: 'Indicador:', width: fullWidth * 0.2, bold: true },
        { text: c.indicadores.map((x) => `${x.code} — ${x.text}`).join('\n'), width: fullWidth * 0.8 },
      ])
      for (const type of ['declarativo', 'procedimental', 'actitudinal'] as const) {
        const items = c.saberes.filter((s) => s.type === type)
        if (items.length === 0) continue
        const label = type === 'declarativo' ? 'Declarativos' : type === 'procedimental' ? 'Procedimentales' : 'Actitudinales'
        drawRow(doc, x0, [
          { text: label.toUpperCase(), width: fullWidth * 0.2, bold: true },
          { text: items.map((s) => `${s.code} — ${s.description}`).join('\n'), width: fullWidth * 0.8 },
        ])
      }
      if (c.contribucion) {
        drawRow(doc, x0, [
          { text: 'Contribución:', width: fullWidth * 0.2, bold: true },
          { text: c.contribucion, width: fullWidth * 0.8 },
        ])
      }
      if (c.responsabilidad) {
        drawRow(doc, x0, [
          { text: 'Responsabilidad:', width: fullWidth * 0.2, bold: true },
          { text: c.responsabilidad, width: fullWidth * 0.8 },
        ])
      }
      doc.moveDown(0.3)
    }

    // ── Sección 7: Integración interdisciplinaria por hitos (por semana) ──
    ensureSpace(doc, 30)
    drawSectionBand(doc, x0, fullWidth, '7. INTEGRACIÓN INTERDISCIPLINARIA POR HITOS')

    for (let week = 1; week <= data.weeksCount; week++) {
      const entriesThisWeek = data.contributions
        .map((c) => ({ subjectName: c.subjectName, entry: c.weekEntries.find((w) => w.weekNumber === week) }))
        .filter((x): x is { subjectName: string; entry: ProjectWeekEntryData } => !!x.entry)

      if (entriesThisWeek.length === 0) continue

      ensureSpace(doc, 30)
      const weekProposito = entriesThisWeek[0].entry.weekProposito
      drawSectionBand(doc, x0, fullWidth, `SEMANA ${week}`)
      if (weekProposito) {
        drawRow(doc, x0, [{ text: `Propósito: ${weekProposito}`, width: fullWidth, bold: true }])
      }

      const subjW = fullWidth * 0.15
      const activitiesW = fullWidth * 0.4
      const proposeW = fullWidth * 0.25
      const evidenceW = fullWidth * 0.2
      drawRow(doc, x0, [
        { text: 'Asignatura', width: subjW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Actividades reales', width: activitiesW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Propósito pedagógico', width: proposeW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Evidencias', width: evidenceW, bold: true, fill: '#f2f2f2', align: 'center' },
      ])

      for (const { subjectName, entry } of entriesThisWeek) {
        const activities = [
          entry.faseInicio ? `${FASE_LABEL.inicio}: ${entry.faseInicio}` : null,
          entry.faseDesarrollo ? `${FASE_LABEL.desarrollo}: ${entry.faseDesarrollo}` : null,
          entry.faseCierre ? `${FASE_LABEL.cierre}: ${entry.faseCierre}` : null,
        ]
          .filter(Boolean)
          .join('\n')

        drawRow(doc, x0, [
          { text: subjectName, width: subjW },
          { text: activities, width: activitiesW },
          { text: entry.propositoPedagogico ?? '', width: proposeW },
          { text: entry.evidencias ?? '', width: evidenceW },
        ])
      }
      doc.moveDown(0.3)
    }

    doc.end()
  })
}
