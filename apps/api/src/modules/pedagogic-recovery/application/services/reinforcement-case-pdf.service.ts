import PDFDocument from 'pdfkit'
import { resolveLogo, drawLeftLogoHeader } from '../../../../shared/infrastructure/services/pdf-helpers'

const PHASE_LABEL: Record<string, string> = {
  RECOVERY_EXPLORATION: 'Activación y exploración focal',
  MODELING: 'Modelado del procedimiento',
  GUIDED_PRACTICE: 'Práctica guiada con retroalimentación',
  APPLICATION: 'Aplicación contextualizada',
  TRANSFER: 'Transferencia a una situación diferente',
  CHECK_REEVALUATION: 'Comprobación del aprendizaje focal',
}

const CASE_STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detectado',
  PLANNED: 'Planificado',
  IN_REINFORCEMENT: 'En refuerzo',
  EVALUATED: 'Evaluado',
  CLOSED: 'Cerrado',
  CONTINUES_REINFORCEMENT: 'Continúa en refuerzo',
}

export interface ReinforcementCasePdfData {
  institutionName: string
  logoUrl?: string | null
  studentNames: string[]
  teacherName: string
  subjectName: string
  levelName: string
  parallelName: string
  periodName: string
  mode: 'INDIVIDUAL' | 'GROUP'
  caseStatus: string
  cycleNumber: number
  skillLabel: string
  detection: {
    sourceLabel: string
    observation: string
    evidenceValue: string
    period: string
    initialResult: string
  }
  needs: string[]
  proposal: {
    learningToReinforce: string
    objective: string
    activeStrategy: string
    concreteActivity: string
    resource: string
    evidence: string
    evaluation: string
    durationFrequency: string
    expectedResult: string
  }
  units: {
    temporalIndex: number
    phase: string
    learningFocus: string
    specificObjective: string
    strategy: string
    concreteActivity: string
    requiredResource: string
    observableEvidence: string
    evaluationMechanism: string
  }[]
  communications: { date: Date; mediumLabel: string; recipient: string; institutionalText: string }[]
  commitments: { commitmentLabel: string; responsible: string; targetDate: Date | null; note: string | null }[]
  followUps: { date: Date; strategyApplied: string; evidence: string; observation: string }[]
  reevaluations: {
    date: Date
    evaluation: string
    pedagogicalDecision: string
    outcomes: { studentName: string; result: string; observation: string }[]
  }[]
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

/** Genera el PDF completo del caso de refuerzo pedagógico (motor TIGA): detección, propuesta, plan
 *  temporal por semanas (6 fases), comunicaciones, compromisos, seguimientos y reevaluaciones. */
export function buildReinforcementCasePdf(data: ReinforcementCasePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    const logo = resolveLogo(data.logoUrl)
    drawLeftLogoHeader(doc, logo, data.institutionName, x0, fullWidth)
    doc.moveDown(0.4)
    doc.moveTo(x0, doc.y).lineTo(x0 + fullWidth, doc.y).lineWidth(1.5).strokeColor('#333333').stroke()
    doc.moveDown(0.5)

    drawSectionBand(doc, x0, fullWidth, 'Caso de Refuerzo Pedagógico')
    drawRow(doc, x0, [
      {
        text: `Ciclo ${data.cycleNumber} · ${data.mode === 'GROUP' ? 'Grupal' : 'Individual'} · Estado: ${CASE_STATUS_LABEL[data.caseStatus] ?? data.caseStatus}`,
        width: fullWidth,
        bold: true,
        align: 'center',
      },
    ])

    drawSectionBand(doc, x0, fullWidth, 'Datos generales')
    drawRow(doc, x0, [
      { text: 'Estudiante(s):', width: fullWidth * 0.22, bold: true },
      { text: data.studentNames.join(', '), width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Docente:', width: fullWidth * 0.22, bold: true },
      { text: data.teacherName, width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Asignatura:', width: fullWidth * 0.22, bold: true },
      { text: data.subjectName, width: fullWidth * 0.28 },
      { text: 'Grado/Paralelo:', width: fullWidth * 0.22, bold: true },
      { text: `${data.levelName} ${data.parallelName}`, width: fullWidth * 0.28 },
    ])
    drawRow(doc, x0, [
      { text: 'Periodo:', width: fullWidth * 0.22, bold: true },
      { text: data.periodName, width: fullWidth * 0.28 },
      { text: 'Destreza/Competencia:', width: fullWidth * 0.22, bold: true },
      { text: data.skillLabel, width: fullWidth * 0.28 },
    ])

    drawSectionBand(doc, x0, fullWidth, 'Detección')
    drawRow(doc, x0, [
      { text: 'Fuente:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.detection.sourceLabel, width: fullWidth * 0.78 },
    ])
    drawRow(doc, x0, [
      { text: 'Observación:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.detection.observation, width: fullWidth * 0.78 },
    ])
    if (data.detection.initialResult) {
      drawRow(doc, x0, [
        { text: 'Resultado inicial:', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
        { text: data.detection.initialResult, width: fullWidth * 0.78 },
      ])
    }
    drawRow(doc, x0, [
      { text: 'Necesidad(es) pedagógica(s):', width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
      { text: data.needs.join('; '), width: fullWidth * 0.78 },
    ])

    drawSectionBand(doc, x0, fullWidth, 'Propuesta de refuerzo')
    const proposalRows: [string, string][] = [
      ['Aprendizaje a reforzar', data.proposal.learningToReinforce],
      ['Objetivo', data.proposal.objective],
      ['Estrategia activa', data.proposal.activeStrategy],
      ['Actividad concreta', data.proposal.concreteActivity],
      ['Recurso', data.proposal.resource],
      ['Evidencia', data.proposal.evidence],
      ['Evaluación', data.proposal.evaluation],
      ['Duración/frecuencia', data.proposal.durationFrequency],
      ['Resultado esperado', data.proposal.expectedResult],
    ]
    for (const [label, value] of proposalRows) {
      drawRow(doc, x0, [
        { text: `${label}:`, width: fullWidth * 0.22, bold: true, fill: '#f2f2f2' },
        { text: value, width: fullWidth * 0.78 },
      ])
    }

    if (data.units.length > 0) {
      drawSectionBand(doc, x0, fullWidth, 'Plan temporal (fases por semana)')
      const wkW = fullWidth * 0.06
      const phaseW = fullWidth * 0.16
      const objW = fullWidth * 0.24
      const actW = fullWidth * 0.30
      const evW = fullWidth * 0.24
      drawRow(doc, x0, [
        { text: 'Sem.', width: wkW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Fase', width: phaseW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Objetivo específico', width: objW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Actividad concreta', width: actW, bold: true, fill: '#f2f2f2', align: 'center' },
        { text: 'Evidencia observable', width: evW, bold: true, fill: '#f2f2f2', align: 'center' },
      ])
      for (const unit of data.units) {
        drawRow(doc, x0, [
          { text: String(unit.temporalIndex), width: wkW, align: 'center' },
          { text: PHASE_LABEL[unit.phase] ?? unit.phase, width: phaseW },
          { text: unit.specificObjective, width: objW },
          { text: unit.concreteActivity, width: actW },
          { text: unit.observableEvidence, width: evW },
        ])
      }
    }

    if (data.communications.length > 0) {
      drawSectionBand(doc, x0, fullWidth, 'Comunicaciones con el representante')
      for (const c of data.communications) {
        drawRow(doc, x0, [
          { text: fmtDate(c.date), width: fullWidth * 0.15, bold: true, fill: '#f2f2f2' },
          { text: `${c.mediumLabel} -> ${c.recipient}`, width: fullWidth * 0.2, bold: true, fill: '#f2f2f2' },
          { text: c.institutionalText, width: fullWidth * 0.65 },
        ])
      }
    }

    if (data.commitments.length > 0) {
      drawSectionBand(doc, x0, fullWidth, 'Compromisos acordados')
      for (const c of data.commitments) {
        drawRow(doc, x0, [
          { text: c.commitmentLabel, width: fullWidth * 0.3, bold: true, fill: '#f2f2f2' },
          { text: c.responsible, width: fullWidth * 0.25 },
          { text: fmtDate(c.targetDate), width: fullWidth * 0.15 },
          { text: c.note ?? '', width: fullWidth * 0.3 },
        ])
      }
    }

    if (data.followUps.length > 0) {
      drawSectionBand(doc, x0, fullWidth, 'Seguimientos')
      for (const f of data.followUps) {
        drawRow(doc, x0, [
          { text: fmtDate(f.date), width: fullWidth * 0.15, bold: true, fill: '#f2f2f2' },
          { text: f.strategyApplied, width: fullWidth * 0.3 },
          { text: f.evidence, width: fullWidth * 0.25 },
          { text: f.observation, width: fullWidth * 0.3 },
        ])
      }
    }

    if (data.reevaluations.length > 0) {
      drawSectionBand(doc, x0, fullWidth, 'Reevaluación')
      for (const r of data.reevaluations) {
        drawRow(doc, x0, [
          { text: fmtDate(r.date), width: fullWidth * 0.15, bold: true, fill: '#f2f2f2' },
          { text: r.evaluation, width: fullWidth * 0.45 },
          { text: r.pedagogicalDecision, width: fullWidth * 0.4, bold: true },
        ])
        for (const o of r.outcomes) {
          drawRow(doc, x0, [
            { text: o.studentName, width: fullWidth * 0.35 },
            { text: o.result === 'CONSOLIDATED' ? 'Consolidado' : 'No consolidado', width: fullWidth * 0.25 },
            { text: o.observation, width: fullWidth * 0.4 },
          ])
        }
      }
    }

    ensureSpace(doc, 90)
    doc.moveDown(0.4)
    const signatories = [
      { role: 'Elaborado por: Docente', name: data.teacherName },
      { role: 'Representante / Familia', name: null as string | null },
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
