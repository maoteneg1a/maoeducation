import PDFDocument from 'pdfkit'
import { resolveLogo } from '../../../../shared/infrastructure/services/pdf-helpers'

export interface ReinforcementPlanSkillData {
  code: string
  description: string
  averageAtDetection: number | null
  notes: string | null
}

export interface ReinforcementPlanPdfData {
  institutionName: string
  logoUrl?: string | null
  studentName: string
  studentDni: string | null
  teacherName: string
  subjectName: string
  levelName: string
  parallelName: string
  periodName: string
  planType: 'academico' | 'nee'
  status: string
  objetivoGeneral: string | null
  estrategias: string | null
  responsables: string | null
  fechaInicio: Date | null
  fechaSeguimiento: Date | null
  observacionesFinales: string | null
  skills: ReinforcementPlanSkillData[]
  guardianName: string | null
}

const PLAN_TYPE_LABEL: Record<ReinforcementPlanPdfData['planType'], string> = {
  academico: 'Refuerzo académico (detectado por desempeño en destrezas)',
  nee: 'Adaptación curricular — Necesidades Educativas Especiales (NEE)',
}

function fmtDate(d: Date | null): string {
  if (!d) return ''
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
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

/** Genera el PDF del Plan de Refuerzo Académico Individualizado (o Adaptación NEE) por estudiante. */
export function buildReinforcementPlanPdf(data: ReinforcementPlanPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const half = fullWidth / 2

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

    drawSectionBand(doc, x0, fullWidth, 'Plan de Refuerzo Académico Individualizado')
    drawRow(doc, x0, [{ text: PLAN_TYPE_LABEL[data.planType], width: fullWidth, bold: true, align: 'center' }])

    drawSectionBand(doc, x0, fullWidth, 'Datos del estudiante')
    drawRow(doc, x0, [
      { text: 'Estudiante:', width: fullWidth * 0.15, bold: true },
      { text: data.studentName, width: fullWidth * 0.5 },
      { text: 'Cédula:', width: fullWidth * 0.1, bold: true },
      { text: data.studentDni ?? '', width: fullWidth * 0.25 },
    ])
    drawRow(doc, x0, [
      { text: 'Docente:', width: fullWidth * 0.15, bold: true },
      { text: data.teacherName, width: fullWidth * 0.85 },
    ])
    drawRow(doc, x0, [
      { text: 'Asignatura:', width: fullWidth * 0.15, bold: true },
      { text: data.subjectName, width: fullWidth * 0.35 },
      { text: 'Grado/Paralelo:', width: fullWidth * 0.2, bold: true },
      { text: `${data.levelName} ${data.parallelName}`, width: fullWidth * 0.3 },
    ])
    drawRow(doc, x0, [
      { text: 'Periodo:', width: fullWidth * 0.15, bold: true },
      { text: data.periodName, width: fullWidth * 0.85 },
    ])

    drawSectionBand(doc, x0, fullWidth, 'Destrezas / áreas que requieren refuerzo')
    if (data.skills.length === 0) {
      drawRow(doc, x0, [{ text: '', width: fullWidth }])
    } else {
      const codeW = fullWidth * 0.15
      const descW = fullWidth * 0.45
      const avgW = fullWidth * 0.15
      const notesW = fullWidth * 0.25
      drawRow(doc, x0, [
        { text: 'Código', width: codeW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Destreza', width: descW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Promedio detectado', width: avgW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Observaciones', width: notesW, bold: true, fill: '#f2f2f2', align: 'center' },
      ])
      for (const skill of data.skills) {
        drawRow(doc, x0, [
          { text: skill.code, width: codeW },
          { text: skill.description, width: descW },
          { text: skill.averageAtDetection != null ? skill.averageAtDetection.toFixed(2) : '', width: avgW, align: 'center' },
          { text: skill.notes ?? '', width: notesW },
        ])
      }
    }

    drawSectionBand(doc, x0, fullWidth, 'Plan de intervención')
    drawRow(doc, x0, [
      { text: 'Objetivo general:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.objetivoGeneral ?? '', width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Estrategias:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.estrategias ?? '', width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Responsables:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.responsables ?? '', width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Fecha de inicio:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: fmtDate(data.fechaInicio), width: fullWidth * 0.28 },
      { text: 'Fecha de seguimiento:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: fmtDate(data.fechaSeguimiento), width: fullWidth * 0.28 },
    ])

    drawSectionBand(doc, x0, fullWidth, 'Observaciones finales / seguimiento')
    drawRow(doc, x0, [{ text: data.observacionesFinales ?? '', width: fullWidth }])

    // Pie de firmas: docente, representante, y DECE si es plan NEE
    ensureSpace(doc, 90)
    doc.moveDown(0.4)
    const signatories = [
      { role: 'Elaborado por: Docente', name: data.teacherName },
      { role: 'Representante / Familia', name: data.guardianName },
      ...(data.planType === 'nee' ? [{ role: 'DECE', name: null as string | null }] : []),
    ]
    const sigW = fullWidth / signatories.length
    drawRow(
      doc,
      x0,
      signatories.map((s) => ({ text: s.role.toUpperCase(), width: sigW, bold: true, fill: '#f2f2f2', align: 'center' as const })),
    )
    drawRow(doc, x0, signatories.map((s) => ({ text: `Nombres: ${s.name ?? '_______________'}`, width: sigW })))
    drawRow(doc, x0, signatories.map(() => ({ text: 'Firma: _______________', width: sigW })))
    drawRow(doc, x0, signatories.map(() => ({ text: 'Fecha: _______________', width: sigW })))

    doc.end()
  })
}
