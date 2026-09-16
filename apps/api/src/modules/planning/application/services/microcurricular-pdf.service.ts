import PDFDocument from 'pdfkit'
import { resolveLogo, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'
import { cellHeight, ensureSpace, drawRow, type Cell } from '../../../../shared/infrastructure/services/pdf-table-helpers'
import type { MicrocurricularTemplateConfig, SaberType } from '../../../institution/application/dtos/institution.dto'

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

const SABER_LABEL: Record<SaberType, string> = {
  declarativo: 'Declarativos',
  procedimental: 'Procedimentales',
  actitudinal: 'Actitudinales',
}

const PHASE_KEYS = ['anticipacion', 'construccionConocimiento', 'consolidacion'] as const

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

type Doc = InstanceType<typeof PDFDocument>

/** Título de sección con banda de ancho completo — color configurable por institución. */
function drawSectionBand(doc: Doc, x0: number, width: number, text: string, color: string) {
  drawRow(doc, x0, [{ text, width, bold: true, fill: color, align: 'center' }])
}

/**
 * Tabla de saberes tal como el formato oficial: "Indicadores de evaluación" es una
 * columna alta (una sola celda que abarca las 2 filas de encabezado + contenido de
 * "Saberes"), y "Saberes" es un título que abarca las 3 columnas de tipo — cuyo
 * orden y etiqueta son configurables por institución (algunas piden D-P-A, otras
 * D-A-P). Se dibuja a mano porque el motor genérico de filas no soporta celdas que
 * abarcan varias filas (rowspan).
 */
function drawSaberesTable(
  doc: Doc,
  x0: number,
  fullWidth: number,
  indicadores: string,
  columns: { label: string; text: string }[],
  headerColor: string,
  headerColor2: string,
) {
  const indicW = fullWidth * 0.22
  const colW = (fullWidth - indicW) / columns.length

  const headerH = 18
  const subHeaderH = 18
  const indicHeight = Math.max(cellHeight(doc, { text: indicadores, width: indicW }), 18)
  const colHeights = columns.map((c) => cellHeight(doc, { text: c.text, width: colW }))
  const contentH = Math.max(indicHeight, ...colHeights)

  const totalRowspanHeight = headerH + subHeaderH + contentH
  ensureSpace(doc, totalRowspanHeight + 2)
  const y0 = doc.y

  doc.lineWidth(0.75).strokeColor('#333333').rect(x0, y0, indicW, totalRowspanHeight).stroke()
  doc.save().fillColor(headerColor2).rect(x0, y0, indicW, headerH).fill().restore()
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0, y0, indicW, headerH).stroke()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text('Indicadores de evaluación', x0 + 4, y0 + 4, {
    width: indicW - 8,
    align: 'center',
  })
  doc.font('Helvetica').fontSize(8.5).text(indicadores, x0 + 4, y0 + headerH + subHeaderH + 4, { width: indicW - 8 })

  const saberesW = fullWidth - indicW
  doc.save().fillColor(headerColor).rect(x0 + indicW, y0, saberesW, headerH).fill().restore()
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0 + indicW, y0, saberesW, headerH).stroke()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text('Saberes', x0 + indicW, y0 + 4, { width: saberesW, align: 'center' })

  let x = x0 + indicW
  for (const col of columns) {
    doc.save().fillColor(headerColor2).rect(x, y0 + headerH, colW, subHeaderH).fill().restore()
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y0 + headerH, colW, subHeaderH).stroke()
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text(col.label, x + 4, y0 + headerH + 4, {
      width: colW - 8,
      align: 'center',
    })
    x += colW
  }

  x = x0 + indicW
  for (const col of columns) {
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y0 + headerH + subHeaderH, colW, contentH).stroke()
    doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(col.text, x + 4, y0 + headerH + subHeaderH + 4, { width: colW - 8 })
    x += colW
  }

  doc.y = y0 + totalRowspanHeight
}

/** Layout "table_per_week": una tabla de metodología completa (3 filas de fase) por cada semana. */
function drawWeekMethodologyPerWeek(
  doc: Doc,
  x0: number,
  fullWidth: number,
  week: MicrocurricularWeek,
  phaseLabels: MicrocurricularTemplateConfig['phaseLabels'],
  headerColor2: string,
) {
  const colW = fullWidth / 3
  drawRow(doc, x0, [
    { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, align: 'center' },
    { text: 'Recursos', width: colW, bold: true, fill: headerColor2, align: 'center' },
    { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, align: 'center' },
  ])
  for (const key of PHASE_KEYS) {
    const moment = week.momentos[key] ?? {}
    const tecnicaInstrumento = `Técnica: ${moment.tecnica ?? ''}\nInstrumento: ${moment.instrumento ?? ''}`
    drawRow(doc, x0, [
      { text: `${phaseLabels[key]}\n${moment.estrategiasDua ?? ''}`, width: colW },
      { text: moment.recursos ?? '', width: colW },
      { text: tecnicaInstrumento, width: colW },
    ])
  }
}

/**
 * Layout "rows_in_single_table": todas las semanas como filas de UNA sola tabla —
 * cada celda concatena las 3 fases con saltos de línea (ej. "SEMANA 1\nInicio: ...\n
 * Desarrollo: ...\nCierre: ..."), en vez de una tabla completa por semana. Formato
 * pedido por instituciones que quieren la vista compacta de todo el trimestre.
 */
function drawWeekMethodologyRowsTable(
  doc: Doc,
  x0: number,
  fullWidth: number,
  weeks: MicrocurricularWeek[],
  phaseLabels: MicrocurricularTemplateConfig['phaseLabels'],
  headerColor2: string,
) {
  const colW = fullWidth / 3
  drawRow(doc, x0, [
    { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, align: 'center' },
    { text: 'Recursos', width: colW, bold: true, fill: headerColor2, align: 'center' },
    { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, align: 'center' },
  ])
  for (const week of weeks) {
    const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
    const dua = PHASE_KEYS.map((k) => `${phaseLabels[k]}: ${week.momentos[k]?.estrategiasDua ?? ''}`).join('\n')
    const recursos = PHASE_KEYS.map((k) => `${phaseLabels[k]}: ${week.momentos[k]?.recursos ?? ''}`).join('\n')
    const tecnica = PHASE_KEYS.map((k) => {
      const m = week.momentos[k] ?? {}
      return `${phaseLabels[k]} — Técnica: ${m.tecnica ?? ''} / Instrumento: ${m.instrumento ?? ''}`
    }).join('\n')
    drawRow(doc, x0, [
      { text: `${weekLabel}\n${dua}`, width: colW },
      { text: recursos, width: colW },
      { text: tecnica, width: colW },
    ])
  }
}

const SECTION_LABEL: Record<string, string> = {
  datos_informativos: 'Datos informativos:',
  situacion_aprendizaje: 'Situación de aprendizaje',
  conexion_interdisciplinar: 'Conexión interdisciplinar',
  semanas: 'Semanas',
}

/** Genera el PDF de "Planificación Microcurricular" según la plantilla configurada por la institución. */
export function buildMicrocurricularPdf(
  data: MicrocurricularPdfData,
  template: MicrocurricularTemplateConfig,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const half = fullWidth / 2
    const { headerColor, headerColor2, phaseLabels, saberesOrder, weekLayout, sectionOrder, hiddenSections } = template

    const logo = resolveLogo(data.logoUrl)
    if (template.watermarkEnabled) drawWatermark(doc, logo)

    // ── Encabezado con logo ──
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

    drawRow(doc, x0, [
      { text: data.institutionName.toUpperCase(), width: half, bold: true },
      { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, align: 'center' },
    ])
    drawSectionBand(doc, x0, fullWidth, 'Planificación Microcurricular', headerColor)

    const drawSection: Record<string, () => void> = {
      datos_informativos: () => {
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.datos_informativos, headerColor)
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
      },
      situacion_aprendizaje: () => {
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.situacion_aprendizaje, headerColor)
        drawRow(doc, x0, [
          { text: 'Título:', width: fullWidth * 0.18, bold: true },
          { text: data.situationTitle, width: fullWidth * 0.82 },
        ])
        drawRow(doc, x0, [
          { text: 'Descripción:', width: fullWidth * 0.18, bold: true },
          { text: data.situationDescription ?? '', width: fullWidth * 0.82 },
        ])
      },
      conexion_interdisciplinar: () => {
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.conexion_interdisciplinar, headerColor)
        drawRow(doc, x0, [
          { text: 'Asignaturas:', width: fullWidth * 0.25, bold: true },
          { text: data.interdisciplinaryAreaNames.join(', '), width: fullWidth * 0.75 },
        ])
        doc.moveDown(0.3)
      },
      semanas: () => {
        if (weekLayout === 'rows_in_single_table') {
          drawSectionBand(doc, x0, fullWidth, 'SEMANAS', headerColor)
          for (const week of data.weeks) {
            drawSectionBand(doc, x0, fullWidth, 'Competencias específicas', headerColor)
            drawRow(doc, x0, [{ text: week.competenciasEspecificas ?? '', width: fullWidth }])
            const bySaberType = (t: SaberType) => week.saberes.filter((s) => s.type === t)
            const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')
            drawSaberesTable(
              doc,
              x0,
              fullWidth,
              week.indicadoresEvaluacion ?? '',
              saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
              headerColor,
              headerColor2,
            )
          }
          drawWeekMethodologyRowsTable(doc, x0, fullWidth, data.weeks, phaseLabels, headerColor2)
          doc.moveDown(0.4)
          return
        }

        for (const week of data.weeks) {
          ensureSpace(doc, 40)
          const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
          drawSectionBand(doc, x0, fullWidth, weekLabel, headerColor)

          drawSectionBand(doc, x0, fullWidth, 'Competencias específicas', headerColor)
          drawRow(doc, x0, [{ text: week.competenciasEspecificas ?? '', width: fullWidth }])

          const bySaberType = (t: SaberType) => week.saberes.filter((s) => s.type === t)
          const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')
          drawSaberesTable(
            doc,
            x0,
            fullWidth,
            week.indicadoresEvaluacion ?? '',
            saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
            headerColor,
            headerColor2,
          )

          drawWeekMethodologyPerWeek(doc, x0, fullWidth, week, phaseLabels, headerColor2)
          doc.moveDown(0.4)
        }
      },
    }

    for (const sectionId of sectionOrder) {
      if (hiddenSections.includes(sectionId)) continue
      drawSection[sectionId]?.()
    }

    // ── Pie de firmas ──
    ensureSpace(doc, 90)
    doc.moveDown(0.3)
    const sigW = fullWidth / data.signatories.length
    drawRow(
      doc,
      x0,
      data.signatories.map((sig) => ({ text: sig.role.toUpperCase(), width: sigW, bold: true, fill: headerColor2, align: 'center' as const })),
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
