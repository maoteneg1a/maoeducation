import { describe, expect, it } from 'vitest'
import { groupedReportProgress } from './grouped-report-progress'

describe('progreso compartido del Anexo 1', () => {
  it('abre el mismo borrador desde las alertas de dos alumnos', () => {
    const reports = [{ id: 'shared', status: 'DRAFT', snapshot: null }]
    for (const id of ['pepito', 'juanito']) {
      expect(groupedReportProgress(reports, id, [id])).toMatchObject({ reportId: 'shared', drafts: 1, sent: 0, needsAmendment: false })
    }
  })
  it('solo marca enviado al alumno que figura en la nómina congelada', () => {
    const reports = [{ id: 'sent', status: 'RECEIVED', snapshot: { alertRoster: [{ studentId: 'pepito', student: 'Pepito Pérez' }] } }]
    expect(groupedReportProgress(reports, 'pepito', [])).toMatchObject({ sent: 1, lastStatus: 'RECEIVED', needsAmendment: false })
    expect(groupedReportProgress(reports, 'juanito', [])).toMatchObject({ reportId: 'sent', sent: 0, needsAmendment: true })
  })
  it('un borrador de ampliación no borra el acuse del envío anterior', () => {
    const reports = [
      { id: 'original', status: 'RECEIVED', snapshot: { alertRoster: [{ studentId: 'pepito' }] } },
      { id: 'amendment', status: 'DRAFT', snapshot: null },
    ]
    expect(groupedReportProgress(reports, 'pepito', [])).toMatchObject({ reportId: 'amendment', sent: 1, drafts: 1, lastStatus: 'RECEIVED' })
    expect(groupedReportProgress(reports, 'juanito', [])).toMatchObject({ reportId: 'amendment', sent: 0, drafts: 1 })
  })
  it('compatibilidad con nóminas antiguas sin identificador, sin confundir IDs actuales', () => {
    const reports = [{ id: 'legacy', status: 'SENT', snapshot: { alertRoster: [{ student: ' Juanito   Sánchez ' }] } }]
    expect(groupedReportProgress(reports, 'juanito', ['Sánchez Juanito', 'Juanito Sánchez']).sent).toBe(1)
    reports[0].snapshot.alertRoster = [{ studentId: 'other', student: 'Juanito Sánchez' }] as any
    expect(groupedReportProgress(reports, 'juanito', ['Juanito Sánchez']).sent).toBe(0)
  })
})
