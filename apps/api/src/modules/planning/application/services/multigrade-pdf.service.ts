import PDFDocument from 'pdfkit'
import { resolveLogo, drawWatermark, drawLeftLogoHeader } from '../../../../shared/infrastructure/services/pdf-helpers'
import { ensureSpace, drawRow, drawFlowRow, type FlowColumn } from '../../../../shared/infrastructure/services/pdf-table-helpers'
import type { CompetencyWeekMomentos } from '../../../../shared/domain/pedagogical-methodology'
import type { MicrocurricularTemplateConfig } from '../../../institution/application/dtos/institution.dto'
import {
  drawSectionBand,
  buildPhaseBlocks,
  buildResourcesBlocks,
  buildAssessmentBlocks,
  COMPETENCY_TABLE_HEADER_FILL,
  COMPETENCY_TABLE_HEADER_TEXT,
  PHASE_LABELS_COMPETENCY,
} from './microcurricular-pdf.service'

export interface MultigradeGradeColumn {
  gradeCode: string
  gradeLabel: string
  subjectName: string
  competencyCodes: string[]
  indicatorCodes: string[]
  saberCodes: string[]
  momentos: CompetencyWeekMomentos
}

export interface MultigradePdfData {
  institutionName: string
  logoUrl?: string | null
  yearName: string
  teacherName: string
  periodName: string
  groupName: string
  weekNumber: number
  experienceTitle: string
  experienceContext: string
  experienceCommonPurpose: string
  grades: MultigradeGradeColumn[]
}

type Doc = InstanceType<typeof PDFDocument>

/**
 * PDF de la semana multigrado — variante de microcurricular-pdf.service.ts
 * (misma paleta/tipografía calcada de TIGA, mismos helpers de tabla/flujo)
 * que en vez de la tabla de 3 columnas de UNA materia dibuja: (1) una banda
 * destacada con la EXPERIENCIA COMÚN (Título/Contexto/Propósito) y (2) una
 * tabla con UNA COLUMNA POR GRADO participante, cada una con su propia
 * metodología Inicio/Desarrollo/Cierre — nunca se mezcla el currículo de un
 * grado con otro, cada columna es independiente.
 */
export function buildMultigradePdf(data: MultigradePdfData, template: MicrocurricularTemplateConfig): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const half = fullWidth / 2
    const { topHeaderColor, topHeaderTextColor, headerColor, headerTextColor, headerColor2, headerColor2TextColor } = template

    const logo = resolveLogo(data.logoUrl)
    if (template.watermarkEnabled) {
      drawWatermark(doc, logo, template.watermarkOpacity)
      if (template.watermarkScope === 'all_pages') {
        doc.on('pageAdded', () => drawWatermark(doc, logo, template.watermarkOpacity))
      }
    }

    // ── Encabezado (mismo layout de microcurricular-pdf.service.ts) ──
    drawLeftLogoHeader(doc, logo, data.institutionName, x0, fullWidth)
    doc.moveDown(0.4)
    doc.moveTo(x0, doc.y).lineTo(x0 + fullWidth, doc.y).lineWidth(1.5).strokeColor('#333333').stroke()
    doc.moveDown(0.5)

    drawRow(doc, x0, [
      { text: data.institutionName.toUpperCase(), width: half, bold: true, fill: topHeaderColor, textColor: topHeaderTextColor },
      { text: `Año lectivo: ${data.yearName}`, width: half, bold: true, align: 'center', fill: topHeaderColor, textColor: topHeaderTextColor },
    ])
    drawSectionBand(doc, x0, fullWidth, 'Planificación Microcurricular Multigrado', headerColor, headerTextColor)

    // ── Datos informativos ──
    drawSectionBand(doc, x0, fullWidth, 'Datos informativos:', headerColor, headerTextColor)
    drawRow(doc, x0, [
      { text: 'Docente:', width: fullWidth * 0.15, bold: true },
      { text: data.teacherName, width: fullWidth * 0.35 },
      { text: 'Aula multigrado:', width: fullWidth * 0.15, bold: true },
      { text: data.groupName, width: fullWidth * 0.35 },
    ])
    drawRow(doc, x0, [
      { text: 'Trimestre:', width: fullWidth * 0.15, bold: true },
      { text: data.periodName.toUpperCase(), width: fullWidth * 0.35 },
      { text: 'Grados participantes:', width: fullWidth * 0.15, bold: true },
      { text: data.grades.map((g) => g.gradeLabel).join(', '), width: fullWidth * 0.35 },
    ])

    // ── Banda destacada: EXPERIENCIA COMÚN (calcado de "EXPERIENCIA DE
    // APRENDIZAJE" en multigrade_word_generator.py de TIGA — banda azul marino
    // destacada antes de las columnas por grado) ──
    const weekTitle = `SEMANA ${data.weekNumber} — EXPERIENCIA COMÚN`
    ensureSpace(doc, 30)
    drawSectionBand(doc, x0, fullWidth, weekTitle, COMPETENCY_TABLE_HEADER_FILL, COMPETENCY_TABLE_HEADER_TEXT)
    drawRow(doc, x0, [{ text: `Título: ${data.experienceTitle}`, width: fullWidth, bold: true }])
    drawRow(doc, x0, [{ text: `Contexto: ${data.experienceContext}`, width: fullWidth }])
    drawRow(doc, x0, [{ text: `Propósito común: ${data.experienceCommonPurpose}`, width: fullWidth }])
    doc.moveDown(0.3)

    // ── Tabla de columnas por grado — cada grado conserva su propio currículo
    // (competencia/indicador/saberes) y su propia metodología Inicio/Desarrollo/
    // Cierre, nunca mezclado con otro grado. ──
    drawSectionBand(doc, x0, fullWidth, 'DESARROLLO POR GRADO', headerColor, headerTextColor)

    const colWidth = fullWidth / data.grades.length

    const drawHeader = (): number =>
      drawRow(
        doc,
        x0,
        data.grades.map((g) => ({
          text: `${g.gradeLabel}\n${g.subjectName}`,
          width: colWidth,
          bold: true,
          fill: COMPETENCY_TABLE_HEADER_FILL,
          align: 'center' as const,
          textColor: COMPETENCY_TABLE_HEADER_TEXT,
        })),
      )

    ensureSpace(doc, 40)
    drawHeader()

    const columns: FlowColumn[] = data.grades.map((g, i) => {
      const m = g.momentos
      // Alturas medidas con heightOfString (mismo patrón que buildPhaseBlocks
      // más abajo) — el texto de "Indicador(es)" es de longitud VARIABLE por
      // grado (algunos indicadores son mucho más largos que otros), así que
      // una altura fija aquí desincroniza el avance de Y entre bloques y el
      // siguiente bloque (INICIO) termina dibujándose encima de este texto
      // todavía desbordando — bug real reportado con captura.
      const competencyText = `Competencia(s): ${g.competencyCodes.join(', ') || '—'}`
      const indicatorText = `Indicador(es): ${g.indicatorCodes.join(', ') || '—'}`
      const competencyHeight = doc.font('Helvetica-Bold').fontSize(8).heightOfString(competencyText, { width: colWidth - 8 })
      const indicatorHeight = doc.font('Helvetica-Bold').fontSize(8).heightOfString(indicatorText, { width: colWidth - 8 })
      const blocks = [
        {
          height: competencyHeight + indicatorHeight + 8,
          draw: (d: Doc, x: number, y: number, w: number) => {
            d.font('Helvetica-Bold').fontSize(8).fillColor('#111111').text(competencyText, x + 4, y + 2, { width: w - 8 })
            d.font('Helvetica-Bold').fontSize(8).text(indicatorText, x + 4, y + 2 + competencyHeight + 2, { width: w - 8 })
          },
        },
        ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.inicio, m.fases.inicio?.activities ?? [], colWidth),
        ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.desarrollo, m.fases.desarrollo?.activities ?? [], colWidth),
        ...buildPhaseBlocks(doc, PHASE_LABELS_COMPETENCY.cierre, m.fases.cierre?.activities ?? [], colWidth),
        ...buildResourcesBlocks(doc, m.recursos ?? [], m.recursoLink, colWidth),
        ...buildAssessmentBlocks(doc, m.evaluacion?.evidencia ?? '', m.evaluacion?.criterio ?? '', m.evaluacion?.instrumento ?? '', m.evaluacion?.instrumentoLink, colWidth),
      ]
      return { x: x0 + i * colWidth, width: colWidth, blocks }
    })
    drawFlowRow(doc, columns, drawHeader)

    // ── Pie de firmas (docente único — mismo formato que microcurricular) ──
    ensureSpace(doc, 90)
    doc.moveDown(0.3)
    drawRow(doc, x0, [{ text: 'DOCENTE RESPONSABLE', width: fullWidth, bold: true, fill: headerColor2, textColor: headerColor2TextColor, align: 'center' }])
    drawRow(doc, x0, [{ text: `Nombres: ${data.teacherName}`, width: fullWidth }])
    drawRow(doc, x0, [{ text: 'Firma: _______________', width: fullWidth }])

    doc.end()
  })
}
