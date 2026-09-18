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
  WidthType,
  AlignmentType,
  VerticalAlign,
  ShadingType,
  TableLayoutType,
} from 'docx'
import { resolveLogo } from '../../../../shared/infrastructure/services/pdf-helpers'
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
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA },
            shading: { fill: hex(fill), type: ShadingType.CLEAR },
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
 * `layout: TableLayoutType.FIXED` es obligatorio en ambas tablas de este archivo
 * (aquí y en `bandRow`) — sin él, Word usa layout AUTOFIT y recalcula el ancho
 * real de cada columna según su contenido, ignorando por completo los anchos
 * en twips que le pasamos. Con columnas muy desiguales (ej. "Estrategias" con
 * párrafos largos vs. "Recursos"/"Evaluación" con texto corto, tal como la
 * tabla semanal real) Word colapsaba las columnas cortas a un ancho casi nulo
 * — texto envuelto letra por letra (bug real reportado, confirmado
 * inspeccionando `<w:tblLayout>` ausente en el XML del .docx generado).
 */
function table(rows: TableRow[]): Table {
  return new Table({ width: { size: PAGE_WIDTH_TWIPS, type: WidthType.DXA }, layout: TableLayoutType.FIXED, rows })
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

function competencyWeekSection(week: MicrocurricularWeek, headerFill: string, headerText: string): (Table | Paragraph)[] {
  const m = week.competencyMomentos as CompetencyWeekMomentos | undefined
  if (!m) return []
  const parts: (Table | Paragraph)[] = []
  const title = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
  parts.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, color: hex(headerFill), size: 24 })] }))
  parts.push(new Paragraph({ text: `Competencia(s): ${week.competencyCodes?.join(', ') || '—'}` }))
  parts.push(new Paragraph({ text: `Indicador(es): ${week.indicatorCodesForWeek?.join(', ') || '—'}` }))
  parts.push(new Paragraph({ text: `Saberes movilizados: ${week.saberCodesForWeek?.join(', ') || '—'}` }))

  const estrategiasW = Math.round(PAGE_WIDTH_TWIPS * 0.55)
  const recursosW = Math.round(PAGE_WIDTH_TWIPS * 0.18)
  const evaluacionW = PAGE_WIDTH_TWIPS - estrategiasW - recursosW

  const estrategiasParas: Paragraph[] = []
  const phaseLabelByKey: Record<'inicio' | 'desarrollo' | 'cierre', string> = { inicio: 'INICIO', desarrollo: 'DESARROLLO', cierre: 'CIERRE' }
  for (const key of ['inicio', 'desarrollo', 'cierre'] as const) {
    estrategiasParas.push(new Paragraph({ children: [new TextRun({ text: phaseLabelByKey[key], bold: true })] }))
    const activities = m.fases[key]?.activities ?? []
    for (const [i, activity] of activities.entries()) {
      estrategiasParas.push(new Paragraph({ text: `${i + 1}. ${activity.text}` }))
      if (activity.duaCode) {
        estrategiasParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: 'DUA: ', bold: true }),
              new TextRun({ text: activity.duaCode, bold: true, shading: { fill: hex(getDuaColor(activity.duaCode)), type: ShadingType.CLEAR } }),
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
    ]),
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
    rowSpan: 2,
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
  return table([
    new TableRow({ children: [indicCell, saberesHeaderCell] }),
    new TableRow({ children: subHeaderCells }),
    new TableRow({ children: contentCells }),
  ])
}

/** Genera el Word de "Planificación Microcurricular" — mismos datos y misma plantilla que buildMicrocurricularPdf (microcurricular-pdf.service.ts), estructura de secciones/tablas/colores equivalente. Word maneja sus propios saltos de página de forma nativa (no replica el motor FlowBlock/drawFlowRow, exclusivo de PDFKit). */
export async function buildMicrocurricularDocx(data: MicrocurricularPdfData, template: MicrocurricularTemplateConfig): Promise<Buffer> {
  const { topHeaderColor, topHeaderTextColor, headerColor, headerTextColor, headerColor2, headerColor2TextColor, saberesOrder, sectionOrder, hiddenSections } = template

  const children: (Paragraph | Table)[] = []

  const logoImage = buildLogoImage(data.logoUrl, 80)
  if (logoImage) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [logoImage] }))
  }
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: data.institutionName.toUpperCase(), bold: true, size: 32 })] }))

  const half = Math.round(PAGE_WIDTH_TWIPS / 2)
  children.push(
    table([
      row([
        { text: data.institutionName.toUpperCase(), width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor },
        { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor, align: AlignmentType.CENTER },
      ]),
    ]),
  )
  children.push(bandRow('Planificación Microcurricular', headerColor, headerTextColor))

  const drawSection: Record<string, () => (Paragraph | Table)[]> = {
    datos_informativos: () => [
      bandRow('Datos informativos:', headerColor, headerTextColor),
      table([
        row([
          { text: 'Docente:', width: Math.round(PAGE_WIDTH_TWIPS * 0.15), bold: true },
          { text: data.teacherName, width: Math.round(PAGE_WIDTH_TWIPS * 0.85) },
        ]),
      ]),
      table([
        row([
          { text: 'Asignatura:', width: Math.round(PAGE_WIDTH_TWIPS * 0.13), bold: true },
          { text: data.subjectName, width: Math.round(PAGE_WIDTH_TWIPS * 0.32) },
          { text: 'Grado/Curso:', width: Math.round(PAGE_WIDTH_TWIPS * 0.13), bold: true },
          { text: data.levelName, width: Math.round(PAGE_WIDTH_TWIPS * 0.22) },
          { text: 'Paralelo:', width: Math.round(PAGE_WIDTH_TWIPS * 0.08), bold: true },
          { text: data.parallelName, width: Math.round(PAGE_WIDTH_TWIPS * 0.12) },
        ]),
      ]),
      table([
        row([
          { text: 'Trimestre:', width: Math.round(PAGE_WIDTH_TWIPS * 0.15), bold: true },
          { text: data.periodName.toUpperCase(), width: Math.round(PAGE_WIDTH_TWIPS * 0.85) },
        ]),
      ]),
    ],
    situacion_aprendizaje: () => [
      bandRow('Situación de aprendizaje', headerColor, headerTextColor),
      table([
        row([
          { text: 'Título:', width: Math.round(PAGE_WIDTH_TWIPS * 0.18), bold: true },
          { text: data.situationTitle, width: Math.round(PAGE_WIDTH_TWIPS * 0.82) },
        ]),
      ]),
      table([
        row([
          { text: 'Descripción:', width: Math.round(PAGE_WIDTH_TWIPS * 0.18), bold: true },
          { text: data.situationDescription ?? '', width: Math.round(PAGE_WIDTH_TWIPS * 0.82) },
        ]),
      ]),
    ],
    conexion_interdisciplinar: () => {
      const names = data.interdisciplinarySubjectNames?.length ? data.interdisciplinarySubjectNames : data.interdisciplinaryAreaNames
      if (names.length === 0) return []
      return [
        bandRow('Conexión interdisciplinar', headerColor, headerTextColor),
        table([
          row([
            { text: 'Asignaturas:', width: Math.round(PAGE_WIDTH_TWIPS * 0.25), bold: true },
            { text: names.join(', '), width: Math.round(PAGE_WIDTH_TWIPS * 0.75) },
          ]),
        ]),
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
          out.push(table([row([{ text: competencyTextsDelPeriodo.join('\n'), width: PAGE_WIDTH_TWIPS }])]))
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

      // Modelo por destrezas — mismas 3 secciones por semana que el PDF (Competencias
      // específicas / Indicadores+Saberes / Metodología en 3 columnas), sin el layout
      // "rows_in_single_table" (formato compacto de una sola tabla para todo el
      // trimestre) — omitido en esta primera versión de Word por baja prioridad de
      // uso frente al formato por semana; usa siempre "table_per_week" acá.
      for (const week of data.weeks) {
        const weekLabel = `SEMANA ${week.weekNumber}${week.name ? ` — ${week.name}` : ''}`
        out.push(bandRow(weekLabel, headerColor, headerTextColor))
        out.push(bandRow('Competencias específicas', headerColor, headerTextColor))
        out.push(table([row([{ text: week.competenciasEspecificas ?? '', width: PAGE_WIDTH_TWIPS }])]))
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
        out.push(table(rows))
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
      table([
        row(data.signatories.map((s) => ({ text: s.role.toUpperCase(), width: sigW, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: AlignmentType.CENTER }))),
        row(data.signatories.map((s) => ({ text: `Nombres: ${s.name ?? '_______________'}`, width: sigW }))),
        row(data.signatories.map(() => ({ text: 'Firma: _______________', width: sigW }))),
        row(data.signatories.map((s) => ({ text: `Fecha: ${fmtDate(s.date)}`, width: sigW }))),
      ]),
    )
  }

  const doc = new Document({
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
        },
        children,
      },
    ],
  })

  return Packer.toBuffer(doc)
}
