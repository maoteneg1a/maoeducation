import { describe, expect, it } from 'vitest'
import { DEFAULT_BOARD_CONFIG } from '../domain/course-board-config'
import { readMeeting } from '../domain/meeting-details'
import type { BoardSnapshot } from '../domain/course-board.types'
import { buildMeetingPdf } from './meeting-pdf'
import { buildBoardPdf } from './course-board-pdf'

const snapshot: BoardSnapshot = {
  institutionName: 'Institución de ejemplo', parallelName: 'Octavo B', yearName: '2026-2027', periodName: 'Primer trimestre', tutorName: 'Pérez Ana', generatedAt: '2026-11-16T16:00:00Z', config: DEFAULT_BOARD_CONFIG,
  subjects: [], rows: [],
  meeting: readMeeting({ number: '01', shift: 'Matutina', invitationDate: '2026-11-15', meetingDate: '2026-11-16', location: 'Auditorio', startTime: '09:00', scheduledEndTime: '10:30', actualEndTime: '10:35', responsible: 'Pérez Ana', agenda: '1. Instalación.\n2. Rendimiento académico.', participants: [{ name: 'Pérez Ana', role: 'Tutora', attendance: 'present' }] }),
}

describe('Word-inspired meeting printouts', () => {
  it.each(['CALL', 'ATTENDANCE'] as const)('prints %s with room for physical signatures', async (kind) => {
    const pdf = await buildMeetingPdf(snapshot, kind)
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(1)
  })
  it('repeats the course header and table headings when the participant list spans pages', async () => {
    const meeting = { ...snapshot.meeting!, participants: Array.from({ length: 65 }, (_, i) => ({ name: `Apellidos y nombres del docente invitado ${i + 1}`, role: 'Docente de asignatura; integrante de la junta', attendance: 'pending' as const })) }
    const pdf = await buildMeetingPdf({ ...snapshot, meeting }, 'ATTENDANCE')
    expect(pdf.toString('latin1').match(/\/Type \/Page\b/g)!.length).toBeGreaterThanOrEqual(4)
  })
  it('keeps the consolidated landscape and the actual minutes portrait in the closing PDF', async () => {
    const pdf = await buildBoardPdf(snapshot, { conclusions: 'Acuerdos revisados por la junta.' })
    const text = pdf.toString('latin1')
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(2)
    expect(text).toContain('/MediaBox [0 0 841.89 595.28]')
    expect(text).toContain('/MediaBox [0 0 595.28 841.89]')
    const long = await buildBoardPdf({ ...snapshot, meeting: { ...snapshot.meeting!, development: 'Punto tratado y seguimiento del curso. '.repeat(200) } }, { conclusions: 'Acuerdos revisados.' })
    const sizes = [...long.toString('latin1').matchAll(/\/MediaBox \[([^\]]+)\]/g)].map((m) => m[1])
    expect(sizes.length).toBeGreaterThan(2)
    expect(sizes.slice(1).every((size) => size === '0 0 595.28 841.89')).toBe(true)
  })
})
