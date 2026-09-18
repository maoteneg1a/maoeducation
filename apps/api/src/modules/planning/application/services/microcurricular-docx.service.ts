import fs from 'fs'
import PDFDocument from 'pdfkit'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  Header,
  WidthType,
  AlignmentType,
  VerticalAlign,
  ShadingType,
  TableLayoutType,
  BorderStyle,
  HorizontalPositionRelativeFrom,
  VerticalPositionRelativeFrom,
  HorizontalPositionAlign,
  VerticalPositionAlign,
  TextWrappingType,
} from 'docx'
import { resolveLogo } from '../../../../shared/infrastructure/services/pdf-helpers'
import { applyPngWashout } from '../../../../shared/infrastructure/services/png-alpha'
import { getDuaColor, type CompetencyWeekMomentos } from '../../../../shared/domain/pedagogical-methodology'
import type { MicrocurricularTemplateConfig, SaberType } from '../../../institution/application/dtos/institution.dto'
import type { MicrocurricularPdfData, MicrocurricularWeek } from './microcurricular-pdf.service'

const PHASE_KEYS = ['anticipacion', 'construccionConocimiento', 'consolidacion'] as const

const SABER_LABEL: Record<SaberType, string> = {
  declarativo: 'Declarativos',
  procedimental: 'Procedimentales',
  actitudinal: 'Actitudinales',
}

/** Ancho útil de página A4 landscape en twips (1/20 pt) — 297mm - 2×18mm margen ≈ igual proporción que el PDF (A4 landscape, margin: 36pt ≈ 12.7mm). */
const PAGE_WIDTH_TWIPS = 16838 - 2 * 720 // A4 landscape width (twips) - 2 márgenes de 0.5"
const MARGIN_TWIPS = 720

// ─── Bordes ─────────────────────────────────────────────────────────────────
// El PDF traza un borde #333333 (0.75pt) en TODA celda de TODA tabla — ver
// `drawRow`/`drawFlowRow` en pdf-table-helpers.ts. Antes de este fix, ninguna
// `Table`/`TableCell` de este archivo pasaba `borders`, así que Word no
// dibujaba ninguna línea divisoria (todo blanco, "tabla mal formada" — bug
// real reportado). `size` en `IBorderOptions` está en octavos de punto: 4 =
// 0.5pt (equivalente visual más cercano al 0.75pt del PDF que ofrece la
// librería en un valor entero razonable).
const CELL_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '333333' } as const
const TABLE_BORDERS = {
  top: CELL_BORDER,
  bottom: CELL_BORDER,
  left: CELL_BORDER,
  right: CELL_BORDER,
  insideHorizontal: CELL_BORDER,
  insideVertical: CELL_BORDER,
} as const

// ─── Tipografía ─────────────────────────────────────────────────────────────
// El PDF usa Helvetica 8.5pt para prácticamente todo el documento (ver
// `cellHeight`/`drawRow` en pdf-table-helpers.ts: `fontSize ?? 8.5`) — la
// jerarquía visual viene de bold + color de fondo, NO de variar el tamaño.
// Antes de este fix, `Document` no fijaba el estilo `Normal`, así que Word
// usaba su default (Calibri 11pt) en cualquier `Paragraph`/`TextRun` sin
// `size` explícito — todo se veía desproporcionadamente grande vs. el PDF.
// `size` en `IRunStylePropertiesOptions` está en medios-punto: 17 = 8.5pt.
const SIZE_BODY = 17 // 8.5pt — default (heredado por Normal, ver `styles` en Document)
const SIZE_DATA_LINE = 18 // 9pt — Competencia(s)/Indicador(es)/Saberes movilizados
const SIZE_PHASE_LABEL = 18 // 9pt — INICIO/DESARROLLO/CIERRE (buildPhaseBlocks del PDF)
const SIZE_DUA = 15 // 7.5pt — etiqueta y badge DUA

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

function hex(color: string): string {
  return color.replace('#', '')
}

/** Fila de una sola celda a ancho completo — banda de sección (mismo rol visual que drawSectionBand en el PDF). */
function bandRow(text: string, fill: string, textColor: string): Table {
  return new Table({
    width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    // ver comentario de columnWidths en table() — mismo motivo, una sola
    // columna a ancho completo.
    columnWidths: [PAGE_WIDTH_TWIPS],
    borders: TABLE_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
            shading: { fill: hex(fill), type: ShadingType.CLEAR },
            borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text, bold: true, color: hex(textColor) })],
              }),
            ],
          }),
        ],
      }),
    ],
  })
}

interface LabeledCol {
  text: string
  width: number
  bold?: boolean
  fill?: string
  textColor?: string
  align?: (typeof AlignmentType)[keyof typeof AlignmentType]
}

/** Fila de varias celdas con anchos proporcionales — equivalente a drawRow del PDF (Cell[]). */
function row(cols: LabeledCol[]): TableRow {
  return new TableRow({
    children: cols.map(
      (c) =>
        new TableCell({
          width: { size: c.width, type: WidthType.DXA },
          shading: c.fill ? { fill: hex(c.fill), type: ShadingType.CLEAR } : undefined,
          borders: { top: CELL_BORDER, bottom: CELL_BORDER, left: CELL_BORDER, right: CELL_BORDER },
          verticalAlign: VerticalAlign.TOP,
          children: (c.text || ' ').split('\n').map(
            (line) =>
              new Paragraph({
                alignment: c.align,
                children: [new TextRun({ text: line, bold: c.bold, color: c.textColor ? hex(c.textColor) : undefined })],
              }),
          ),
        }),
    ),
  })
}

/**
 * `columnWidths` es OBLIGATORIO junto con `layout: FIXED` — sin él, la librería
 * `docx` genera `<w:tblGrid>` con anchos default de 100 twips por columna, y
 * con layout fijo Word usa ESA grilla (no el `width` de cada `TableCell`) para
 * el ancho real de renderizado — bug real reportado y confirmado
 * inspeccionando el XML de un .docx generado en producción: `<w:tblGrid>
 * <w:gridCol w:w="100"/><w:gridCol w:w="100"/></w:tblGrid>` con `tcW` correcto
 * pero ignorado, colapsando el texto letra por letra igual que el bug anterior
 * (layout AUTOFIT) que este mismo layout FIXED debía prevenir.
 */
function table(rows: TableRow[], columnWidths: number[]): Table {
  return new Table({
    width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths,
    borders: TABLE_BORDERS,
    rows,
  })
}

/** Logo institucional como imagen embebida — mide el tamaño real con PDFKit (ya dependencia del proyecto, mismo patrón que pdf-helpers.getImageSize) para escalar proporcionalmente sin deformar, igual criterio que el PDF. */
function buildLogoImage(logoUrl: string | null | undefined, maxWidthPx: number): ImageRun | null {
  const src = resolveLogo(logoUrl)
  if (!src) return null
  try {
    const buffer = typeof src === 'string' ? fs.readFileSync(src) : src
    const probe = new PDFDocument({ autoFirstPage: false }) as unknown as { openImage: (s: Buffer) => { width: number; height: number } }
    const { width, height } = probe.openImage(buffer)
    const scale = Math.min(1, maxWidthPx / width)
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    // docx exige el tipo de imagen explícito (jpg/png/gif/bmp) — el PDF delega
    // esa detección a PDFKit internamente; aquí se sniffea por firma de bytes
    // (PNG: 89 50 4E 47, JPEG: FF D8) ya que es lo único que sube el selector
    // de logo institucional (branding), sin necesidad de una librería nueva.
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    return new ImageRun({
      type: isPng ? 'png' : 'jpg',
      data: buffer,
      transformation: { width: w, height: h },
    })
  } catch {
    return null
  }
}

/** 1 twip = 1/20 pt; 1 pt = 96/72 px → factor de conversión twips→px. */
const TWIPS_TO_PX = 96 / 72 / 20

/**
 * Imagen de encabezado completa subida por la institución (banner ya diseñado:
 * fondo, ondas, logo, nombre, caja de datos institucionales, etc.) — reemplaza
 * el bloque logo+nombre por defecto, a ANCHO COMPLETO de página, igual que el
 * PDF (`headerBanner` en microcurricular-pdf.service.ts). Mismo patrón que
 * `buildLogoImage`: mide el tamaño real con el probe de PDFKit para escalar
 * proporcionalmente (un solo eje fijado — nunca ancho Y alto a la vez, o la
 * librería `docx` deformaría la imagen si no calzan con el aspect ratio real).
 */
function buildBannerImage(bannerUrl: string | null | undefined, fullWidthTwips: number): ImageRun | null {
  const src = resolveLogo(bannerUrl)
  if (!src) return null
  try {
    const buffer = typeof src === 'string' ? fs.readFileSync(src) : src
    const probe = new PDFDocument({ autoFirstPage: false }) as unknown as { openImage: (s: Buffer) => { width: number; height: number } }
    const { width, height } = probe.openImage(buffer)
    const wPx = Math.round(fullWidthTwips * TWIPS_TO_PX)
    const hPx = Math.round(wPx * (height / width))
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    return new ImageRun({
      type: isPng ? 'png' : 'jpg',
      data: buffer,
      transformation: { width: wPx, height: hPx },
    })
  } catch {
    return null
  }
}

/**
 * Marca de agua: imagen del logo aclarada (washout) hacia blanco proporcional
 * a `opacity` y colocada en el `Header` de la sección como imagen flotante
 * detrás del texto (`floating.behindDocument`), centrada en la página —
 * mismo efecto visual que `drawWatermark` en el PDF (logo semitransparente
 * centrado, caja máxima ~180pt). `docx`/Word no expone un canal de
 * transparencia real sobre `ImageRun` (ver png-alpha.ts), así que la
 * "opacidad" se logra aclarando los píxeles de color del PNG antes de
 * embeberlo — misma técnica que usa el propio Word para su marca de agua
 * nativa.
 */
function buildWatermarkImage(logoUrl: string | null | undefined, opacity: number, maxSizePt: number): ImageRun | null {
  const src = resolveLogo(logoUrl)
  if (!src) return null
  try {
    let buffer = typeof src === 'string' ? fs.readFileSync(src) : src
    const probe = new PDFDocument({ autoFirstPage: false }) as unknown as { openImage: (s: Buffer) => { width: number; height: number } }
    const { width, height } = probe.openImage(buffer)
    const isPng = buffer[0] === 0x89 && buffer[1] === 0x50
    if (isPng) buffer = applyPngWashout(buffer, opacity)
    const maxSizePx = Math.round(maxSizePt * (96 / 72))
    const scale = Math.min(maxSizePx / width, maxSizePx / height)
    const w = Math.round(width * scale)
    const h = Math.round(height * scale)
    return new ImageRun({
      type: isPng ? 'png' : 'jpg',
      data: buffer,
      transformation: { width: w, height: h },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, align: HorizontalPositionAlign.CENTER },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, align: VerticalPositionAlign.CENTER },
        allowOverlap: true,
        behindDocument: true,
        wrap: { type: TextWrappingType.NONE },
      },
    })
  } catch {
    return null
  }
}

/** `Header` con la imagen de marca de agua — usado en `sections[0].headers` solo si `watermarkEnabled` y el logo resuelve a una imagen válida. */
function buildWatermarkHeader(logoUrl: string | null | undefined, opacity: number): Header | null {
  const image = buildWatermarkImage(logoUrl, opacity, 180)
  if (!image) return null
  return new Header({ children: [new Paragraph({ children: [image] })] })
}

function competencyWeekSection(week: MicrocurricularWeek, headerFill: string, headerText: string): (Table | Paragraph)[] {
  const m = week.competencyMomentos as CompetencyWeekMomentos | undefined
  if (!m) return []
  const parts: (Table | Paragraph)[] = []
  const title = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
  parts.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, color: hex(headerFill), size: 24 })] }))
  parts.push(new Paragraph({ children: [new TextRun({ text: `Competencia(s): ${week.competencyCodes?.join(', ') || '—'}`, size: SIZE_DATA_LINE })] }))
  parts.push(new Paragraph({ children: [new TextRun({ text: `Indicador(es): ${week.indicatorCodesForWeek?.join(', ') || '—'}`, size: SIZE_DATA_LINE })] }))
  parts.push(new Paragraph({ children: [new TextRun({ text: `Saberes movilizados: ${week.saberCodesForWeek?.join(', ') || '—'}`, size: SIZE_DATA_LINE })] }))

  const estrategiasW = Math.round(PAGE_WIDTH_TWIPS * 0.55)
  const recursosW = Math.round(PAGE_WIDTH_TWIPS * 0.18)
  const evaluacionW = PAGE_WIDTH_TWIPS - estrategiasW - recursosW

  const estrategiasParas: Paragraph[] = []
  const phaseLabelByKey: Record<'inicio' | 'desarrollo' | 'cierre', string> = { inicio: 'INICIO', desarrollo: 'DESARROLLO', cierre: 'CIERRE' }
  for (const key of ['inicio', 'desarrollo', 'cierre'] as const) {
    estrategiasParas.push(new Paragraph({ children: [new TextRun({ text: phaseLabelByKey[key], bold: true, size: SIZE_PHASE_LABEL })] }))
    const activities = m.fases[key]?.activities ?? []
    for (const [i, activity] of activities.entries()) {
      estrategiasParas.push(new Paragraph({ text: `${i + 1}. ${activity.text}` }))
      if (activity.duaCode) {
        estrategiasParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'DUA: ', bold: true, size: SIZE_DUA }),
              new TextRun({
                text: activity.duaCode,
                bold: true,
                size: SIZE_DUA,
                shading: { fill: hex(getDuaColor(activity.duaCode)), type: ShadingType.CLEAR },
              }),
            ],
          }),
        )
      }
    }
  }

  const recursosParas: Paragraph[] = (m.recursos ?? []).map((r) => new Paragraph({ text: `• ${r}` }))
  if (m.recursoLink) {
    recursosParas.push(new Paragraph({ children: [new TextRun({ text: m.recursoLink.title, bold: true })] }))
    recursosParas.push(new Paragraph({ children: [new TextRun({ text: 'ABRIR RECURSO', color: '0563C1', underline: {} })] }))
  }
  if (recursosParas.length === 0) recursosParas.push(new Paragraph({ text: ' ' }))

  const evaluacionParas: Paragraph[] = [
    new Paragraph({ children: [new TextRun({ text: 'Evidencia:', bold: true })] }),
    new Paragraph({ text: m.evaluacion?.evidencia || '—' }),
    new Paragraph({ children: [new TextRun({ text: 'Criterio:', bold: true })] }),
    new Paragraph({ text: m.evaluacion?.criterio || '—' }),
    new Paragraph({ children: [new TextRun({ text: 'Instrumento:', bold: true })] }),
    new Paragraph({ text: m.evaluacion?.instrumento || '—' }),
  ]
  if (m.evaluacion?.instrumentoLink) {
    evaluacionParas.push(new Paragraph({ children: [new TextRun({ text: 'ABRIR INSTRUMENTO', color: '0563C1', underline: {} })] }))
  }

  parts.push(
    table([
      row([
        { text: 'ESTRATEGIAS', width: estrategiasW, bold: true, fill: headerFill, textColor: headerText, align: AlignmentType.CENTER },
        { text: 'RECURSOS', width: recursosW, bold: true, fill: headerFill, textColor: headerText, align: AlignmentType.CENTER },
        { text: 'EVALUACIÓN', width: evaluacionW, bold: true, fill: headerFill, textColor: headerText, align: AlignmentType.CENTER },
      ]),
      new TableRow({
        children: [
          new TableCell({ width: { size: estrategiasW, type: WidthType.DXA }, children: estrategiasParas }),
          new TableCell({ width: { size: recursosW, type: WidthType.DXA }, children: recursosParas }),
          new TableCell({ width: { size: evaluacionW, type: WidthType.DXA }, children: evaluacionParas }),
        ],
      }),
    ], [estrategiasW, recursosW, evaluacionW]),
  )
  return parts
}

function saberesTable(
  indicadores: string,
  columns: { label: string; text: string }[],
  headerColor: string,
  headerTextColor: string,
  headerColor2: string,
  headerColor2TextColor: string,
): Table {
  const indicW = Math.round(PAGE_WIDTH_TWIPS * 0.22)
  const colW = Math.round((PAGE_WIDTH_TWIPS - indicW) / columns.length)
  const indicCell = new TableCell({
    width: { size: indicW, type: WidthType.DXA },
    // La tabla dibuja 3 filas (header "Saberes"+"Indicadores" / sub-header
    // D-P-A / contenido) — `rowSpan` DEBE cubrirlas las 3, no solo las 2
    // primeras. `docx` propaga la celda `vMerge` a EXACTAMENTE `rowSpan`
    // filas (ver `TableRow.addCellToColumnIndex`, llamado desde `Table`
    // rowIndex por rowIndex mientras rowIndex < rowSpan): con `rowSpan: 2`
    // (bug real, confirmado inspeccionando el `<w:tbl>` de un .docx generado
    // — la 3ª fila queda con una `<w:tc>` menos que columnas tiene el
    // `tblGrid`, desalineando cada celda de esa fila una posición a la
    // izquierda) la 3ª fila (el CONTENIDO real de Indicadores/Saberes) nunca
    // recibe su celda `vMerge=continue`, exactamente el "columnas mal
    // formadas / desalineadas" reportado con capturas reales.
    rowSpan: 3,
    shading: { fill: hex(headerColor2), type: ShadingType.CLEAR },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Indicadores de evaluación', bold: true, color: hex(headerColor2TextColor) })] }),
      new Paragraph({ text: indicadores || '—' }),
    ],
  })
  const saberesHeaderCell = new TableCell({
    width: { size: colW * columns.length, type: WidthType.DXA },
    columnSpan: columns.length,
    shading: { fill: hex(headerColor), type: ShadingType.CLEAR },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Saberes', bold: true, color: hex(headerTextColor) })] })],
  })
  const subHeaderCells = columns.map(
    (c) =>
      new TableCell({
        width: { size: colW, type: WidthType.DXA },
        shading: { fill: hex(headerColor2), type: ShadingType.CLEAR },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: c.label, bold: true, color: hex(headerColor2TextColor) })] })],
      }),
  )
  const contentCells = columns.map((c) => new TableCell({ width: { size: colW, type: WidthType.DXA }, children: [new Paragraph({ text: c.text || '—' })] }))
  return table(
    [
      new TableRow({ children: [indicCell, saberesHeaderCell] }),
      new TableRow({ children: subHeaderCells }),
      new TableRow({ children: contentCells }),
    ],
    [indicW, ...columns.map(() => colW)],
  )
}

/** Genera el Word de "Planificación Microcurricular" — mismos datos y misma plantilla que buildMicrocurricularPdf (microcurricular-pdf.service.ts), estructura de secciones/tablas/colores equivalente. Word maneja sus propios saltos de página de forma nativa (no replica el motor FlowBlock/drawFlowRow, exclusivo de PDFKit). */
export async function buildMicrocurricularDocx(data: MicrocurricularPdfData, template: MicrocurricularTemplateConfig): Promise<Buffer> {
  const { topHeaderColor, topHeaderTextColor, headerColor, headerTextColor, headerColor2, headerColor2TextColor, saberesOrder, sectionOrder, hiddenSections } = template

  const children: (Paragraph | Table)[] = []

  // ── Encabezado ──
  // Si la institución subió un banner completo, reemplaza el bloque logo+nombre
  // en texto plano — igual decisión de alcance que el PDF (ver comentario en
  // microcurricular-pdf.service.ts): NO reemplaza la fila `topHeader` (nombre +
  // año lectivo, dato dinámico por documento) ni la banda "Planificación
  // Microcurricular" (estructural, reordenable vía sectionOrder/hiddenSections).
  //
  // Antes de este fix, el nombre de la institución se imprimía DOS veces: aquí
  // (párrafo centrado a 32pt) Y en la fila `topHeader` de abajo — redundante,
  // el PDF solo lo muestra una vez (bug real reportado: "el .docx no respeta
  // las personalizaciones... duplicado"). Se elimina el párrafo suelto; el
  // logo (si no hay banner) se mantiene como único elemento del bloque
  // superior, igual que `drawLeftLogoHeader` en el PDF que sí conserva el logo
  // junto al nombre — aquí el nombre queda solo en `topHeader`.
  const bannerImage = buildBannerImage(template.headerBannerUrl, PAGE_WIDTH_TWIPS)
  if (bannerImage) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [bannerImage] }))
  } else {
    const logoImage = buildLogoImage(data.logoUrl, 80)
    if (logoImage) {
      children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImage] }))
    }
  }

  const half = Math.round(PAGE_WIDTH_TWIPS / 2)
  children.push(
    table(
      [
        row([
          { text: data.institutionName.toUpperCase(), width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor },
          { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor, align: AlignmentType.CENTER },
        ]),
      ],
      [half, half],
    ),
  )
  children.push(bandRow('Planificación Microcurricular', headerColor, headerTextColor))

  const drawSection: Record<string, () => (Paragraph | Table)[]> = {
    datos_informativos: () => [
      bandRow('Datos informativos:', headerColor, headerTextColor),
      table(
        [
          row([
            { text: 'Docente:', width: Math.round(PAGE_WIDTH_TWIPS * 0.15), bold: true },
            { text: data.teacherName, width: Math.round(PAGE_WIDTH_TWIPS * 0.85) },
          ]),
        ],
        [Math.round(PAGE_WIDTH_TWIPS * 0.15), Math.round(PAGE_WIDTH_TWIPS * 0.85)],
      ),
      table(
        [
          row([
            { text: 'Asignatura:', width: Math.round(PAGE_WIDTH_TWIPS * 0.13), bold: true },
            { text: data.subjectName, width: Math.round(PAGE_WIDTH_TWIPS * 0.32) },
            { text: 'Grado/Curso:', width: Math.round(PAGE_WIDTH_TWIPS * 0.13), bold: true },
            { text: data.levelName, width: Math.round(PAGE_WIDTH_TWIPS * 0.22) },
            { text: 'Paralelo:', width: Math.round(PAGE_WIDTH_TWIPS * 0.08), bold: true },
            { text: data.parallelName, width: Math.round(PAGE_WIDTH_TWIPS * 0.12) },
          ]),
        ],
        [
          Math.round(PAGE_WIDTH_TWIPS * 0.13),
          Math.round(PAGE_WIDTH_TWIPS * 0.32),
          Math.round(PAGE_WIDTH_TWIPS * 0.13),
          Math.round(PAGE_WIDTH_TWIPS * 0.22),
          Math.round(PAGE_WIDTH_TWIPS * 0.08),
          Math.round(PAGE_WIDTH_TWIPS * 0.12),
        ],
      ),
      table(
        [
          row([
            { text: 'Trimestre:', width: Math.round(PAGE_WIDTH_TWIPS * 0.15), bold: true },
            { text: data.periodName.toUpperCase(), width: Math.round(PAGE_WIDTH_TWIPS * 0.85) },
          ]),
        ],
        [Math.round(PAGE_WIDTH_TWIPS * 0.15), Math.round(PAGE_WIDTH_TWIPS * 0.85)],
      ),
    ],
    situacion_aprendizaje: () => [
      bandRow('Situación de aprendizaje', headerColor, headerTextColor),
      table(
        [
          row([
            { text: 'Título:', width: Math.round(PAGE_WIDTH_TWIPS * 0.18), bold: true },
            { text: data.situationTitle, width: Math.round(PAGE_WIDTH_TWIPS * 0.82) },
          ]),
        ],
        [Math.round(PAGE_WIDTH_TWIPS * 0.18), Math.round(PAGE_WIDTH_TWIPS * 0.82)],
      ),
      table(
        [
          row([
            { text: 'Descripción:', width: Math.round(PAGE_WIDTH_TWIPS * 0.18), bold: true },
            { text: data.situationDescription ?? '', width: Math.round(PAGE_WIDTH_TWIPS * 0.82) },
          ]),
        ],
        [Math.round(PAGE_WIDTH_TWIPS * 0.18), Math.round(PAGE_WIDTH_TWIPS * 0.82)],
      ),
    ],
    conexion_interdisciplinar: () => {
      const names = data.interdisciplinarySubjectNames?.length ? data.interdisciplinarySubjectNames : data.interdisciplinaryAreaNames
      if (names.length === 0) return []
      return [
        bandRow('Conexión interdisciplinar', headerColor, headerTextColor),
        table(
          [
            row([
              { text: 'Asignaturas:', width: Math.round(PAGE_WIDTH_TWIPS * 0.25), bold: true },
              { text: names.join(', '), width: Math.round(PAGE_WIDTH_TWIPS * 0.75) },
            ]),
          ],
          [Math.round(PAGE_WIDTH_TWIPS * 0.25), Math.round(PAGE_WIDTH_TWIPS * 0.75)],
        ),
      ]
    },
    semanas: () => {
      const out: (Paragraph | Table)[] = []
      if (data.weeks.some((w) => w.isCompetencyModel)) {
        const competencyTextsDelPeriodo = [...new Set(data.weeks.flatMap((w) => (w.competenciasEspecificas ?? '').split('\n').filter(Boolean)))]
        const indicadoresDelPeriodo = [...new Set(data.weeks.flatMap((w) => (w.indicadoresEvaluacion ?? '').split('\n').filter(Boolean)))]
        const saberesDelPeriodo = new Map<string, MicrocurricularWeek['saberes'][number]>()
        for (const week of data.weeks) for (const saber of week.saberes) saberesDelPeriodo.set(saber.code, saber)
        const bySaberType = (t: SaberType) => [...saberesDelPeriodo.values()].filter((s) => s.type === t)
        const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')

        if (competencyTextsDelPeriodo.length) {
          out.push(bandRow('Competencias específicas del período', headerColor, headerTextColor))
          out.push(table([row([{ text: competencyTextsDelPeriodo.join('\n'), width: PAGE_WIDTH_TWIPS }])], [PAGE_WIDTH_TWIPS]))
        }
        if (saberesDelPeriodo.size > 0) {
          out.push(
            saberesTable(
              indicadoresDelPeriodo.join('\n'),
              saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
              headerColor,
              headerTextColor,
              headerColor2,
              headerColor2TextColor,
            ),
          )
        }
        out.push(bandRow('SEMANAS', headerColor, headerTextColor))
        for (const week of data.weeks) out.push(...competencyWeekSection(week, headerColor, headerTextColor))
        return out
      }

      // Modelo por destrezas, layout "rows_in_single_table" — formato compacto
      // pedido por instituciones que quieren TODO el trimestre en una sola
      // tabla de metodología (en vez de una tabla completa por semana): cada
      // semana imprime su bandRow + tabla de competencias + tabla de saberes
      // (igual que table_per_week), pero la metodología DUA/Recursos/
      // Evaluación se consolida en UNA tabla con una fila por semana —
      // exactamente `drawWeekMethodologyRowsTable` del PDF.
      if (template.weekLayout === 'rows_in_single_table') {
        out.push(bandRow('SEMANAS', headerColor, headerTextColor))
        for (const week of data.weeks) {
          out.push(bandRow('Competencias específicas', headerColor, headerTextColor))
          out.push(table([row([{ text: week.competenciasEspecificas ?? '', width: PAGE_WIDTH_TWIPS }])], [PAGE_WIDTH_TWIPS]))
          const bySaberType = (t: SaberType) => week.saberes.filter((s) => s.type === t)
          const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')
          out.push(
            saberesTable(
              week.indicadoresEvaluacion ?? '',
              saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
              headerColor,
              headerTextColor,
              headerColor2,
              headerColor2TextColor,
            ),
          )
        }
        const colW = Math.round(PAGE_WIDTH_TWIPS / 3)
        const rowsMethodology = [
          row([
            { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
            { text: 'Recursos', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
            { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
          ]),
        ]
        for (const week of data.weeks) {
          const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
          const dua = PHASE_KEYS.map((k) => `${template.phaseLabels[k]}: ${week.momentos[k]?.estrategiasDua ?? ''}`).join('\n')
          const recursos = PHASE_KEYS.map((k) => `${template.phaseLabels[k]}: ${week.momentos[k]?.recursos ?? ''}`).join('\n')
          const tecnica = PHASE_KEYS.map((k) => {
            const m = week.momentos[k] ?? {}
            return `${template.phaseLabels[k]} — Técnica: ${m.tecnica ?? ''} / Instrumento: ${m.instrumento ?? ''}`
          }).join('\n')
          rowsMethodology.push(
            row([
              { text: `${weekLabel}\n${dua}`, width: colW },
              { text: recursos, width: colW },
              { text: tecnica, width: colW },
            ]),
          )
        }
        out.push(table(rowsMethodology, [colW, colW, colW]))
        return out
      }

      // Modelo por destrezas, layout "table_per_week" (default): mismas 3
      // secciones por semana que el PDF (Competencias específicas /
      // Indicadores+Saberes / Metodología en 3 columnas) repetidas semana por
      // semana.
      for (const week of data.weeks) {
        const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
        out.push(bandRow(weekLabel, headerColor, headerTextColor))
        out.push(bandRow('Competencias específicas', headerColor, headerTextColor))
        out.push(table([row([{ text: week.competenciasEspecificas ?? '', width: PAGE_WIDTH_TWIPS }])], [PAGE_WIDTH_TWIPS]))
        const bySaberType = (t: SaberType) => week.saberes.filter((s) => s.type === t)
        const joinSaberes = (list: MicrocurricularWeek['saberes']) => list.map((s) => `${s.code}: ${s.description}`).join('\n')
        out.push(
          saberesTable(
            week.indicadoresEvaluacion ?? '',
            saberesOrder.map((t) => ({ label: SABER_LABEL[t], text: joinSaberes(bySaberType(t)) })),
            headerColor,
            headerTextColor,
            headerColor2,
            headerColor2TextColor,
          ),
        )
        const colW = Math.round(PAGE_WIDTH_TWIPS / 3)
        const rows = [
          row([
            { text: 'Estrategias metodológicas desde el DUA', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
            { text: 'Recursos', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
            { text: 'Actividad Evaluativa / Técnicas e instrumentos de evaluación', width: colW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER },
          ]),
        ]
        for (const key of PHASE_KEYS) {
          const moment = week.momentos[key] ?? {}
          const tecnicaInstrumento = `Técnica: ${moment.tecnica ?? ''}\nInstrumento: ${moment.instrumento ?? ''}`
          rows.push(
            row([
              { text: `${template.phaseLabels[key]}\n${moment.estrategiasDua ?? ''}`, width: colW },
              { text: moment.recursos ?? '', width: colW },
              { text: tecnicaInstrumento, width: colW },
            ]),
          )
        }
        out.push(table(rows, [colW, colW, colW]))
      }
      return out
    },
  }

  for (const sectionId of sectionOrder) {
    if (hiddenSections.includes(sectionId)) continue
    children.push(...(drawSection[sectionId]?.() ?? []))
  }

  // ── Pie de firmas ── (solo si hay firmantes reales — mismo criterio que el
  // fix aplicado hoy al PDF: nunca reservar/dibujar un pie vacío).
  if (data.signatories.length > 0) {
    const sigW = Math.round(PAGE_WIDTH_TWIPS / data.signatories.length)
    children.push(
      table(
        [
          row(data.signatories.map((s) => ({ text: s.role.toUpperCase(), width: sigW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER }))),
          row(data.signatories.map((s) => ({ text: `Nombres: ${s.name ?? '_______________'}`, width: sigW }))),
          row(data.signatories.map(() => ({ text: 'Firma: _______________', width: sigW }))),
          row(data.signatories.map((s) => ({ text: `Fecha: ${fmtDate(s.date)}`, width: sigW }))),
        ],
        data.signatories.map(() => sigW),
      ),
    )
  }

  // ── Marca de agua ──
  // `watermarkScope` decide si la imagen va en el header "first" (solo primera
  // página, con `titlePage: true` para que Word use un header distinto ahí) o
  // en el header "default" (se repite en TODAS las páginas de la sección) —
  // mismo comportamiento por scope que `drawWatermark`/`pageAdded` en el PDF.
  const watermarkHeader = template.watermarkEnabled ? buildWatermarkHeader(data.logoUrl, template.watermarkOpacity) : null
  const isFirstPageOnly = template.watermarkScope === 'first_page_only'
  const headers = watermarkHeader
    ? isFirstPageOnly
      ? { first: watermarkHeader, default: new Header({ children: [] }) }
      : { default: watermarkHeader }
    : undefined

  const doc = new Document({
    // Estilo `Normal` del documento — sin esto, Word usa su default (Calibri
    // 11pt) en cualquier `Paragraph`/`TextRun` sin `size`/`font` explícito, muy
    // por encima de los 8.5pt que usa el PDF de referencia en todo el
    // documento (bug real reportado: "todo se ve grande, desbordado" vs. el
    // PDF). Arial es la fuente más cercana a Helvetica (la que usa el PDF)
    // disponible de forma universal en Word.
    styles: {
      default: {
        document: {
          run: { font: 'Arial', size: SIZE_BODY },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // width/height en su orden NATURAL portrait (A4: 210mm×297mm ≈
            // 11906×16838 twips, ancho < alto) — la librería `docx` los
            // INTERCAMBIA ella misma internamente cuando `orientation:
            // 'landscape'` está presente. Pasarlos ya intercambiados a mano
            // (como se hizo antes) hace que la librería los intercambie DE
            // NUEVO, dejando la página en portrait real con el flag
            // "landscape" puesto encima — bug real confirmado inspeccionando
            // el <w:pgSz> del .docx generado (w="11906" h="16838", exactamente
            // al revés de lo esperado), causa de que las celdas con ancho
            // absoluto en twips (calculadas para una página ancha) colapsaran
            // a una letra por línea al no caber en la página angosta real.
            size: { orientation: 'landscape' as const, width: 11906, height: 16838 },
            margin: { top: MARGIN_TWIPS, bottom: MARGIN_TWIPS, left: MARGIN_TWIPS, right: MARGIN_TWIPS },
          },
          titlePage: isFirstPageOnly && !!watermarkHeader,
        },
        headers,
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
