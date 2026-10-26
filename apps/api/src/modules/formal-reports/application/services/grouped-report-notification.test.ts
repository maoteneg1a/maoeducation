import { describe, expect, it } from 'vitest'
import { groupedReportNotification } from './grouped-report-notification'

describe('aviso de ampliación agrupada', () => {
  const previous = { alertRoster: [{ studentId: 'pepito', student: 'Pepito Pérez' }] }
  it('avisa la cantidad agregada sin publicar los nombres de los alumnos', () => {
    const result = groupedReportNotification('Docente', previous, { alertRoster: [...previous.alertRoster, { studentId: 'juanito', student: 'Juanito Sánchez' }] })
    expect(result.title).toBe('Actualización del informe agrupado')
    expect(result.body).toContain('agregó 1 estudiante.')
    expect(result.body).not.toMatch(/Pepito|Juanito/)
    expect(result.body).toContain('acuse de recibo')
  })
  it('no anuncia alumnos añadidos si solo se corrigió el contenido', () => {
    expect(groupedReportNotification('Docente', previous, previous).body).not.toContain('agregó')
  })
  it('compara nóminas antiguas por nombre y nuevas por ID', () => {
    const result = groupedReportNotification('Docente', { alertRoster: [{ student: 'Pepito Pérez' }] }, { alertRoster: [...previous.alertRoster, { studentId: '2' }, { studentId: '3' }] })
    expect(result.body).toContain('agregó 2 estudiantes')
  })
})
