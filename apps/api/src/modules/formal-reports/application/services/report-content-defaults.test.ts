import { describe, expect, it } from 'vitest'
import { withDocumentDateDefault } from './report-content-defaults'

const type = { fields: [{ key: 'fecha_documento', label: 'Fecha', type: 'date' as const, required: true }] }
describe('fecha del documento por defecto', () => {
  it('usa el día de Ecuador aunque en UTC ya sea el siguiente', () => {
    expect(withDocumentDateDefault(type, {}, new Date('2026-10-27T02:30:00Z'))).toEqual({ fecha_documento: '2026-10-26' })
    expect(withDocumentDateDefault(type, {}, new Date('2026-10-27T05:00:00Z'))).toEqual({ fecha_documento: '2026-10-27' })
  })
  it('conserva fechas elegidas, campos adicionales y no muta el contenido', () => {
    const content = { fecha_documento: '2026-10-20', jornada: 'Vespertina' }
    expect(withDocumentDateDefault(type, content)).toEqual(content)
    const blank = { jornada: 'Matutina' }
    expect(withDocumentDateDefault(type, blank, new Date('2026-10-26T16:00:00Z'))).toEqual({ jornada: 'Matutina', fecha_documento: '2026-10-26' })
    expect(blank).toEqual({ jornada: 'Matutina' })
  })
  it('no inventa fechas para inicio, revisión o reuniones', () => {
    expect(withDocumentDateDefault({ fields: [{ ...type.fields[0], key: 'fecha_inicio' }] }, {})).toEqual({})
    expect(withDocumentDateDefault({ fields: [] }, {})).toEqual({})
  })
})
