import PDFDocument from 'pdfkit'
import { describe, expect, it } from 'vitest'
import { DEFAULT_BOARD_CONFIG } from '../domain/course-board-config'
import type { BoardReportDocument, BoardSnapshot } from '../domain/course-board.types'
import { drawBoardReport } from './board-report-pdf'

const snapshot: BoardSnapshot = { institutionName: 'Unidad Educativa de Ejemplo', parallelName: 'Sexto de Básica A-M', yearName: '2026-2027', periodName: 'Primer trimestre', tutorName: 'Apellidos y nombres del tutor', generatedAt: '2026-11-17T17:00:00Z', config: DEFAULT_BOARD_CONFIG, subjects: [], rows: [] }
const report: BoardReportDocument = { typeKey: 'general', title: 'Informe general de rendimiento', authorId: 'tutor', authorName: snapshot.tutorName, courseAssignmentId: null, subjectName: null, situation: 'Situación observada', actions: 'Acciones realizadas', recommendations: 'Recomendaciones', labels: { situation: 'Situación observada', actions: 'Acciones realizadas', recommendations: 'Recomendaciones' }, institutionName: snapshot.institutionName, parallelName: snapshot.parallelName, yearName: snapshot.yearName, periodName: snapshot.periodName, generatedAt: snapshot.generatedAt }

function measure(document: BoardReportDocument) {
  const doc = new PDFDocument({ size: 'A4', margin: 34, bufferPages: true })
  doc.on('data', () => {})
  const boxes: Array<{ page: unknown; x: number; y: number; width: number; height: number; text: string }> = []
  const text = doc.text.bind(doc)
  doc.text = ((value: string, x: number, y: number, options: PDFKit.Mixins.TextOptions) => {
    boxes.push({ page: doc.page, x, y, width: options.width!, height: doc.heightOfString(value, options), text: value })
    return text(value, x, y, options)
  }) as typeof doc.text
  drawBoardReport(doc, snapshot, document)
  const pages = doc.bufferedPageRange().count
  doc.end()
  return { boxes, pages }
}
function expectNoOverlap(boxes: ReturnType<typeof measure>['boxes']) {
  for (const box of boxes) {
    expect(box.y, box.text.slice(0, 70)).toBeGreaterThanOrEqual(34)
    expect(box.y + box.height, box.text.slice(0, 70)).toBeLessThanOrEqual(841.89 - 62 + 0.1)
  }
  boxes.forEach((box, index) => {
    for (const other of boxes.slice(index + 1)) {
      if (box.page !== other.page) continue
      const horizontal = box.x < other.x + other.width - 0.1 && other.x < box.x + box.width - 0.1
      const vertical = box.y < other.y + other.height - 0.1 && other.y < box.y + box.height - 0.1
      expect(horizontal && vertical, `Text overlaps: ${box.text.slice(0, 45)} / ${other.text.slice(0, 45)}`).toBe(false)
    }
  })
}
describe('report tables and spacing', () => {
  it('keeps the institutional header, metadata, report fields and signature apart on one page', () => {
    const { boxes, pages } = measure(report)
    expect(pages).toBe(1)
    expect(boxes.some((box) => box.text.includes('Firma del docente'))).toBe(true)
    expectNoOverlap(boxes)
  })
  it('paginates long paragraphs and long labels without truncating or overlapping text', () => {
    const situation = 'Se revisaron los aprendizajes y se acordó seguimiento.\n\n'.repeat(100) + 'FIN_SITUACION'
    const actions = 'ACCIÓN_LARGA_SIN_ESPACIOS_'.repeat(180) + 'FIN_ACCIONES'
    const recommendations = 'Continuar el acompañamiento del curso. '.repeat(140) + 'FIN_RECOMENDACIONES'
    const { boxes, pages } = measure({ ...report, labels: { ...report.labels, situation: 'Situación observada y seguimiento de los aprendizajes priorizados del período académico' }, situation, actions, recommendations })
    expect(pages).toBeGreaterThan(3)
    for (const value of [situation, actions, recommendations]) {
      const prefix = value.slice(0, 20)
      const fragments = boxes.filter((box) => box.text.startsWith(prefix) || value.includes(box.text) && box.text.length > 100).map((box) => box.text).join('')
      expect(fragments).toContain(value)
    }
    expectNoOverlap(boxes)
  })
})
