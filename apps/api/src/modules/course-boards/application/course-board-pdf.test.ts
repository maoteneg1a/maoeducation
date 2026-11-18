import { describe, expect, it } from 'vitest'
import { DEFAULT_BOARD_CONFIG } from '../domain/course-board-config'
import type { BoardSnapshot } from '../domain/course-board.types'
import { buildBoardPdf } from './course-board-pdf'

export const sampleBoard: BoardSnapshot = {
  institutionName: 'Institución de ejemplo', parallelName: 'Octavo A', yearName: '2026-2027', periodName: 'Primer período', tutorName: 'Pérez Ana', generatedAt: '2026-11-12T17:00:00Z', config: DEFAULT_BOARD_CONFIG,
  subjects: Array.from({ length: 17 }, (_, i) => ({ id: String(i), name: `Asignatura ${i + 1}`, teacherId: 'teacher', teacherName: 'Docente', isQualitative: false })),
  rows: Array.from({ length: 70 }, (_, i) => ({ id: String(i), name: `Apellidos compuestos y nombres del estudiante ${i + 1}`, dni: null, grades: Array.from({ length: 17 }, (_, j) => ({ assignmentId: String(j), value: j === 0 ? 0 : 8, display: j === 0 ? '0.00' : '8.00', partial: j === 1 })), absences: 0, late: 0, incidents: 0, reinforcement: 0, behavior: null, observation: null })),
}

describe('printable course board documents', () => {
  it('paginates only by students while retaining all subjects in the same landscape matrix', async () => {
    const pdf = await buildBoardPdf(sampleBoard)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    const pages = pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []
    expect(pages.length).toBe(2)
  })
  it('fits 35 students and nine subjects together on one landscape sheet', async () => {
    const pdf = await buildBoardPdf({ ...sampleBoard, rows: sampleBoard.rows.slice(0, 35), subjects: sampleBoard.subjects.slice(0, 9) })
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
    expect(pdf.toString('latin1')).toContain('/MediaBox [0 0 1190.55 841.89]')
  })
  it('renders a short report and a closing document with long conclusions', async () => {
    const report = { typeKey: 'general', title: 'Informe general', authorId: 'tutor', authorName: 'Pérez Ana', courseAssignmentId: null, subjectName: null, situation: 'Resumen del curso', actions: 'Acompañamiento', recommendations: 'Continuar seguimiento', labels: { situation: 'Situación', actions: 'Acciones', recommendations: 'Recomendaciones' }, institutionName: sampleBoard.institutionName, parallelName: sampleBoard.parallelName, yearName: sampleBoard.yearName, periodName: sampleBoard.periodName, generatedAt: sampleBoard.generatedAt }
    const pdf = await buildBoardPdf(sampleBoard, { report })
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
    const closed = await buildBoardPdf({ ...sampleBoard, rows: sampleBoard.rows.slice(0, 1), subjects: [] }, { conclusions: 'Acuerdo de seguimiento. '.repeat(200), reports: [report], chairName: 'Autoridad' })
    expect(closed.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(3)
  })
})
