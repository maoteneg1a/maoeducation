import PDFDocument from 'pdfkit'
import { resolveLogo, drawWatermark, getImageSize } from '../../../../shared/infrastructure/services/pdf-helpers'
import {
  cellHeight,
  ensureSpace,
  drawRow,
  drawFlowRow,
  drawBadge,
  type Cell,
  type FlowColumn,
  type FlowBlock,
} from '../../../../shared/infrastructure/services/pdf-table-helpers'
import { getDuaColor, type CompetencyWeekMomentos } from '../../../../shared/domain/pedagogical-methodology'
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
  /** true si la semana se generó/editó bajo el modelo por COMPETENCIAS (CNC) — usa competencyMomentos y el layout de tabla única calcado de TIGA en vez de momentos/drawWeekMethodology*. */
  isCompetencyModel?: boolean
  competencyCodes?: string[]
  indicatorCodesForWeek?: string[]
  saberCodesForWeek?: string[]
  competencyMomentos?: CompetencyWeekMomentos
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
  /** @deprecated sin UI que lo escriba — usa interdisciplinarySubjectNames. */
  interdisciplinaryAreaNames: string[]
  /** Nombres de las materias (Subject) del propio docente con conexión interdisciplinar. */
  interdisciplinarySubjectNames?: string[]
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

/** Título de sección con banda de ancho completo — fondo y texto configurables por institución. */
export function drawSectionBand(doc: Doc, x0: number, width: number, text: string, color: string, textColor: string) {
  drawRow(doc, x0, [{ text, width, bold: true, fill: color, align: 'center', textColor }])
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
  headerTextColor: string,
  headerColor2: string,
  headerColor2TextColor: string,
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
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerColor2TextColor).text('Indicadores de evaluación', x0 + 4, y0 + 4, {
    width: indicW - 8,
    align: 'center',
  })
  doc.font('Helvetica').fontSize(8.5).fillColor('#111111').text(indicadores, x0 + 4, y0 + headerH + subHeaderH + 4, { width: indicW - 8 })

  const saberesW = fullWidth - indicW
  doc.save().fillColor(headerColor).rect(x0 + indicW, y0, saberesW, headerH).fill().restore()
  doc.lineWidth(0.75).strokeColor('#333333').rect(x0 + indicW, y0, saberesW, headerH).stroke()
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerTextColor).text('Saberes', x0 + indicW, y0 + 4, { width: saberesW, align: 'center' })

  let x = x0 + indicW
  for (const col of columns) {
    doc.save().fillColor(headerColor2).rect(x, y0 + headerH, colW, subHeaderH).fill().restore()
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y0 + headerH, colW, subHeaderH).stroke()
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(headerColor2TextColor).text(col.label, x + 4, y0 + headerH + 4, {
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
  headerColor2TextColor: string,
) {
  const colW = fullWidth / 3
  drawRow(doc, x0, [
    { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
    { text: 'Recursos', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
    { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
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
  headerColor2TextColor: string,
) {
  const colW = fullWidth / 3
  drawRow(doc, x0, [
    { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
    { text: 'Recursos', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
    { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, align: 'center', textColor: headerColor2TextColor },
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

// ─── Tabla semanal por COMPETENCIAS — calcada EXACTAMENTE del formato TIGA
// (competency_planning_word_template.py, con acuerdo explícito de reutilización):
// UNA sola tabla de 3 columnas (ESTRATEGIAS | RECURSOS | EVALUACIÓN) por semana,
// encabezado azul marino/texto blanco, subtítulos de fase en negro dentro de la
// columna ESTRATEGIAS, cada actividad numerada con su propio badge de color DUA,
// recursos en viñetas + link "ABRIR RECURSO", evaluación con Evidencia/Criterio/
// Instrumento + link "ABRIR INSTRUMENTO". Nunca se repite Recursos/Evaluación por
// fase — se consolidan una sola vez para toda la semana (pedido explícito del
// usuario: "NO SE DEBE REPETIR TODO ESO").
// Exportados (no solo `const` locales) para que multigrade-pdf.service.ts pueda
// pintar exactamente la misma paleta/tipografía sin duplicarla.
export const COMPETENCY_TABLE_HEADER_FILL = '#1F4E78'
export const COMPETENCY_TABLE_HEADER_TEXT = '#FFFFFF'
export const LINK_COLOR = '#0563C1'
export const PHASE_LABELS_COMPETENCY: Record<'inicio' | 'desarrollo' | 'cierre', string> = {
  inicio: 'INICIO',
  desarrollo: 'DESARROLLO',
  cierre: 'CIERRE',
}

function drawCompetencyWeekHeader(doc: Doc, x0: number, fullWidth: number, week: MicrocurricularWeek) {
  ensureSpace(doc, 65)
  const title = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
  doc.font('Helvetica-Bold').fontSize(12).fillColor(COMPETENCY_TABLE_HEADER_FILL).text(title, x0, doc.y, { width: fullWidth })
  doc.fillColor('#111111').font('Helvetica').fontSize(9)
  doc.text(`Competencia(s): ${week.competencyCodes?.join(', ') || '—'}`, x0, doc.y, { width: fullWidth })
  doc.text(`Indicador(es): ${week.indicatorCodesForWeek?.join(', ') || '—'}`, x0, doc.y, { width: fullWidth })
  doc.text(`Saberes movilizados: ${week.saberCodesForWeek?.join(', ') || '—'}`, x0, doc.y, { width: fullWidth })
  doc.moveDown(0.3)
}

export function buildPhaseBlocks(
  doc: Doc,
  label: string,
  activities: { text: string; duaCode: string }[],
  width: number,
): FlowBlock[] {
  const blocks: FlowBlock[] = []
  blocks.push({
    height: 15,
    draw: (d, x, y, w) => {
      d.font('Helvetica-Bold').fontSize(9).fillColor('#111111').text(label, x + 4, y + 3, { width: w - 8 })
    },
  })
  for (const [i, activity] of activities.entries()) {
    const text = `${i + 1}. ${activity.text}`
    const textHeight = doc.font('Helvetica').fontSize(8.5).heightOfString(text, { width: width - 8 })
    const duaLineHeight = activity.duaCode ? 15 : 0
    blocks.push({
      height: textHeight + duaLineHeight + 6,
      draw: (d, x, y, w) => {
        d.font('Helvetica').fontSize(8.5).fillColor('#111111').text(text, x + 4, y + 2, { width: w - 8 })
        if (activity.duaCode) {
          const lineY = y + 2 + textHeight + 2
          d.font('Helvetica-Bold').fontSize(7.5).fillColor('#111111').text('DUA: ', x + 4, lineY, { lineBreak: false })
          const labelWidth = d.widthOfString('DUA: ')
          drawBadge(d, x + 4 + labelWidth + 2, lineY - 1, activity.duaCode, { fill: getDuaColor(activity.duaCode) })
        }
      },
    })
  }
  return blocks
}

export function buildResourcesBlocks(
  doc: Doc,
  resources: string[],
  link: { title: string; url: string } | undefined,
  width: number,
): FlowBlock[] {
  const blocks: FlowBlock[] = []
  const bulletText = resources.map((r) => `• ${r}`).join('\n')
  const bulletHeight = doc.font('Helvetica').fontSize(8.5).heightOfString(bulletText || ' ', { width: width - 8 })
  blocks.push({
    height: bulletHeight + 6,
    draw: (d, x, y, w) => {
      d.font('Helvetica').fontSize(8.5).fillColor('#111111').text(bulletText, x + 4, y + 2, { width: w - 8 })
    },
  })
  if (link) {
    const titleHeight = doc.font('Helvetica-Bold').fontSize(8.5).heightOfString(link.title, { width: width - 8 })
    blocks.push({
      height: titleHeight + 18,
      draw: (d, x, y, w) => {
        d.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text(link.title, x + 4, y + 2, { width: w - 8 })
        d.font('Helvetica')
          .fontSize(8.5)
          .fillColor(LINK_COLOR)
          .text('ABRIR RECURSO', x + 4, y + 2 + titleHeight + 3, { underline: true, link: link.url })
        d.fillColor('#111111')
      },
    })
  }
  return blocks
}

export function buildAssessmentBlocks(
  doc: Doc,
  evidencia: string,
  criterio: string,
  instrumento: string,
  link: { title: string; url: string } | undefined,
  width: number,
): FlowBlock[] {
  const blocks: FlowBlock[] = []
  const addLabeled = (label: string, text: string) => {
    const labelHeight = 12
    const body = text || '—'
    const textHeight = doc.font('Helvetica').fontSize(8.5).heightOfString(body, { width: width - 8 })
    blocks.push({
      height: labelHeight + textHeight + 6,
      draw: (d, x, y, w) => {
        d.font('Helvetica-Bold').fontSize(8.5).fillColor('#111111').text(label, x + 4, y + 2, { width: w - 8 })
        d.font('Helvetica').fontSize(8.5).text(body, x + 4, y + 2 + labelHeight, { width: w - 8 })
      },
    })
  }
  addLabeled('Evidencia:', evidencia)
  addLabeled('Criterio:', criterio)
  addLabeled('Instrumento:', instrumento)
  if (link) {
    blocks.push({
      height: 18,
      draw: (d, x, y, w) => {
        d.font('Helvetica')
          .fontSize(8.5)
          .fillColor(LINK_COLOR)
          .text('ABRIR INSTRUMENTO', x + 4, y + 2, { underline: true, link: link.url, width: w - 8 })
        d.fillColor('#111111')
      },
    })
  }
  return blocks
}

/** UNA sola tabla de 3 columnas por semana — Recursos/Evaluación consolidados una vez, nunca repetidos por fase. Salto de página mantiene los mismos anchos de columna (drawFlowRow). */
function drawCompetencyWeekTable(doc: Doc, x0: number, fullWidth: number, week: MicrocurricularWeek) {
  const m = week.competencyMomentos
  if (!m) return

  const estrategiasW = fullWidth * 0.55
  const recursosW = fullWidth * 0.18
  const evaluacionW = fullWidth - estrategiasW - recursosW

  const drawHeader = (): number =>
    drawRow(doc, x0, [
      { text: 'ESTRATEGIAS', width: estrategiasW, bold: true, fill: COMPETENCY_TABLE_HEADER_FILL, align: 'center', textColor: COMPETENCY_TABLE_HEADER_TEXT },
      { text: 'RECURSOS', width: recursosW, bold: true, fill: COMPETENCY_TABLE_HEADER_FILL, align: 'center', textColor: COMPETENCY_TABLE_HEADER_TEXT },
      { text: 'EVALUACIÓN', width: evaluacionW, bold: true, fill: COMPETENCY_TABLE_HEADER_FILL, align: 'center', textColor: COMPETENCY_TABLE_HEADER_TEXT },
    ])

  ensureSpace(doc, 30)
  drawHeader()

  const estrategiasBlocks: FlowBlock[] = [
    ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.inicio, m.fases.inicio?.activities ?? [], estrategiasW),
    ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.desarrollo, m.fases.desarrollo?.activities ?? [], estrategiasW),
    ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.cierre, m.fases.cierre?.activities ?? [], estrategiasW),
  ]
  const recursosBlocks = buildResourcesBlocks(doc, m.recursos ?? [], m.recursoLink, recursosW)
  const evaluacionBlocks = buildAssessmentBlocks(
    doc,
    m.evaluacion?.evidencia ?? '',
    m.evaluacion?.criterio ?? '',
    m.evaluacion?.instrumento ?? '',
    m.evaluacion?.instrumentoLink,
    evaluacionW,
  )

  const columns: FlowColumn[] = [
    { x: x0, width: estrategiasW, blocks: estrategiasBlocks },
    { x: x0 + estrategiasW, width: recursosW, blocks: recursosBlocks },
    { x: x0 + estrategiasW + recursosW, width: evaluacionW, blocks: evaluacionBlocks },
  ]
  drawFlowRow(doc, columns, drawHeader)
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
    const {
      topHeaderColor,
      topHeaderTextColor,
      headerColor,
      headerTextColor,
      headerColor2,
      headerColor2TextColor,
      phaseLabels,
      saberesOrder,
      weekLayout,
      sectionOrder,
      hiddenSections,
    } = template

    const logo = resolveLogo(data.logoUrl)
    // Marca de agua: si el alcance es "all_pages", se redibuja en cada página
    // nueva vía el evento 'pageAdded' de PDFKit (se dispara ANTES de que se
    // agregue contenido a esa página, así que no tapa nada). "first_page_only"
    // (default histórico) solo la dibuja una vez, antes del contenido de la
    // página 1 — nunca se repite en páginas siguientes.
    if (template.watermarkEnabled) {
      drawWatermark(doc, logo, template.watermarkOpacity)
      if (template.watermarkScope === 'all_pages') {
        doc.on('pageAdded', () => drawWatermark(doc, logo, template.watermarkOpacity))
      }
    }

    // ── Encabezado ──
    // Si la institución subió un banner completo (imagen ya diseñada: fondo,
    // ondas, logo, caja de datos institucionales, etc.), reemplaza SOLO este
    // bloque (logo pequeño + nombre en texto + línea divisoria) — se dibuja a
    // ANCHO COMPLETO de página, con la altura que le corresponda según su
    // aspect ratio real (mismo cuidado de "un solo eje" que drawWatermark, ver
    // pdf-helpers.ts, para no deformar la imagen).
    //
    // Decisión de alcance: NO reemplaza la fila `topHeaderColor` (nombre +
    // "Año lectivo: ...") ni la banda "Planificación Microcurricular" que
    // vienen después. Razones: (1) el año lectivo es un dato dinámico por
    // documento que una imagen estática no puede mostrar; (2) esas bandas son
    // estructurales del documento (título del documento, secciones
    // reordenables vía sectionOrder/hiddenSections), no identidad visual de la
    // institución — quitarlas rompería la funcionalidad de reordenar/ocultar
    // secciones que ya existe. El "encabezado actual" que el usuario pidió
    // reemplazar es literalmente el bloque logo+nombre en texto plano.
    const headerBanner = resolveLogo(template.headerBannerUrl)
    if (headerBanner) {
      try {
        const { width: bannerNaturalW, height: bannerNaturalH } = getImageSize(doc, headerBanner)
        const bannerH = fullWidth * (bannerNaturalH / bannerNaturalW)
        doc.image(headerBanner, x0, doc.y, { width: fullWidth })
        doc.y += bannerH
      } catch { /* banner inválido, se omite */ }
      doc.moveDown(0.3)
    } else {
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
    }

    drawRow(doc, x0, [
      { text: data.institutionName.toUpperCase(), width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor },
      { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, align: 'center', fill: topHeaderColor, textColor: topHeaderTextColor },
    ])
    drawSectionBand(doc, x0, fullWidth, 'Planificación Microcurricular', headerColor, headerTextColor)

    const drawSection: Record<string, () => void> = {
      datos_informativos: () => {
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.datos_informativos, headerColor, headerTextColor)
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
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.situacion_aprendizaje, headerColor, headerTextColor)
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
        // interdisciplinaryAreaNames queda por compatibilidad (deprecado, sin UI que
        // lo escriba) — interdisciplinarySubjectNames es el selector real (materias del
        // propio docente, mínimo 2 para contar como conexión interdisciplinar).
        const names = data.interdisciplinarySubjectNames?.length ? data.interdisciplinarySubjectNames : data.interdisciplinaryAreaNames
        if (names.length === 0) return
        drawSectionBand(doc, x0, fullWidth, SECTION_LABEL.conexion_interdisciplinar, headerColor, headerTextColor)
        drawRow(doc, x0, [
          { text: 'Asignaturas:', width: fullWidth * 0.25, bold: true },
          { text: names.join(', '), width: fullWidth * 0.75 },
        ])
        doc.moveDown(0.3)
      },
      semanas: () => {
        // Modelo por COMPETENCIAS: SIEMPRE una sola tabla de 3 columnas por semana,
        // calcada de TIGA — weekLayout (que solo tiene sentido para destrezas) se
        // ignora aquí a propósito (ver comentario en DEFAULT_MICROCURRICULAR_TEMPLATE).
        if (data.weeks.some((w) => w.isCompetencyModel)) {
          // Bloque agregado del período — calcado de TIGA: antes de listar las
          // semanas, un resumen único con las competencias específicas, indicadores
          // y la tabla de saberes (3 columnas D/P/A) de TODO el trimestre, no
          // repetido por semana (cada semana ya imprime sus propios códigos en
          // "Saberes movilizados" dentro de drawCompetencyWeekHeader).
          const competencyTextsDelPeriodo = [
            ...new Set(data.weeks.flatMap((w) => (w.competenciasEspecificas ?? '').split('\n').filter(Boolean))),
          ]
          const indicadoresDelPeriodo = [
            ...new Set(data.weeks.flatMap((w) => (w.indicadoresEvaluacion ?? '').split('\n').filter(Boolean))),
          ]
          const saberesDelPeriodo = new Map<string, MicrocurricularWeek['saberes'][number]>()
          for (const week of data.weeks) {
            for (const saber of week.saberes) saberesDelPeriodo.set(saber.code, saber)
          }
          const bySaberType = (t: SaberType) => [...saberesDelPeriodo.values()].filter((s) => s.type === t)
          const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')

          if (competencyTextsDelPeriodo.length) {
            drawSectionBand(doc, x0, fullWidth, 'Competencias específicas del período', headerColor, headerTextColor)
            drawRow(doc, x0, [{ text: competencyTextsDelPeriodo.join('\n'), width: fullWidth }])
          }
          if (saberesDelPeriodo.size > 0) {
            drawSaberesTable(
              doc,
              x0,
              fullWidth,
              indicadoresDelPeriodo.join('\n'),
              saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
              headerColor,
              headerTextColor,
              headerColor2,
              headerColor2TextColor,
            )
            doc.moveDown(0.4)
          }

          drawSectionBand(doc, x0, fullWidth, 'SEMANAS', headerColor, headerTextColor)
          for (const week of data.weeks) {
            drawCompetencyWeekHeader(doc, x0, fullWidth, week)
            drawCompetencyWeekTable(doc, x0, fullWidth, week)
            doc.moveDown(0.5)
          }
          return
        }

        if (weekLayout === 'rows_in_single_table') {
          drawSectionBand(doc, x0, fullWidth, 'SEMANAS', headerColor, headerTextColor)
          for (const week of data.weeks) {
            drawSectionBand(doc, x0, fullWidth, 'Competencias específicas', headerColor, headerTextColor)
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
              headerTextColor,
              headerColor2,
              headerColor2TextColor,
            )
          }
          drawWeekMethodologyRowsTable(doc, x0, fullWidth, data.weeks, phaseLabels, headerColor2, headerColor2TextColor)
          doc.moveDown(0.4)
          return
        }

        for (const week of data.weeks) {
          ensureSpace(doc, 40)
          const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
          drawSectionBand(doc, x0, fullWidth, weekLabel, headerColor, headerTextColor)

          drawSectionBand(doc, x0, fullWidth, 'Competencias específicas', headerColor, headerTextColor)
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
            headerTextColor,
            headerColor2,
            headerColor2TextColor,
          )

          drawWeekMethodologyPerWeek(doc, x0, fullWidth, week, phaseLabels, headerColor2, headerColor2TextColor)
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
      data.signatories.map((sig) => ({ text: sig.role.toUpperCase(), width: sigW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: 'center' as const })),
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
