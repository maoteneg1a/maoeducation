import { describe, expect, it } from 'vitest'
import {
  canReport,
  DEFAULT_SETTINGS,
  isEligibleReceiver,
  platformAllows,
  reportSchema,
  resolveSettings,
  safeReceivers,
} from './dece-policy'
const teacher = { id: 'teacher', institutionId: 'school', roles: ['teacher'], canConfigure: false }
describe('política independiente de DECE', () => {
  it('mantiene apagada la recepción por defecto', () => {
    expect(resolveSettings(null).enabled).toBe(false)
    expect(canReport(teacher, DEFAULT_SETTINGS, true)).toBe(false)
  })
  it('exige módulo, visibilidad y permiso de reporte para aceptar una alerta', () => {
    const enabled = { ...DEFAULT_SETTINGS, enabled: true }
    expect(canReport(teacher, enabled, true)).toBe(true)
    expect(canReport(teacher, enabled, false)).toBe(false)
    expect(canReport(teacher, { ...enabled, visibleRoles: [] }, true)).toBe(false)
    expect(canReport(teacher, { ...enabled, reporterRoles: [] }, true)).toBe(false)
    expect(canReport({ ...teacher, roles: ['admin'] }, enabled, true)).toBe(false)
  })
  it('respeta los módulos de plataforma sin activar el módulo por guardar el resto', () => {
    expect(platformAllows({ modules: ['incidents'] })).toBe(false)
    expect(platformAllows({ modules: ['dece_routes'] })).toBe(true)
    expect(platformAllows({})).toBe(true)
  })
  it('selecciona un suplente seguro sin incluir al responsable implicado', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      primaryReceiverId: 'primary',
      alternateReceiverId: 'backup',
    }
    expect(safeReceivers(settings, [], ['primary', 'backup'])).toEqual(['primary'])
    expect(safeReceivers(settings, ['primary'], ['primary', 'backup'])).toEqual(['backup'])
    expect(safeReceivers(settings, [], ['backup'])).toEqual(['backup'])
    expect(safeReceivers(settings, ['primary', 'backup'], ['primary', 'backup'])).toEqual([])
  })
  it('no convierte al administrador ni a los estudiantes en gestores automáticamente', () => {
    expect(isEligibleReceiver(['admin'])).toBe(false)
    expect(isEligibleReceiver(['teacher'])).toBe(false)
    expect(isEligibleReceiver(['dece'])).toBe(true)
    expect(isEligibleReceiver(['dece', 'guardian'])).toBe(false)
  })
  it('permite reportar sin identificar una categoría jurídica y rechaza fechas imposibles', () => {
    const input = {
      requestId: '11111111-1111-4111-8111-111111111111',
      concern: 'other',
      immediateDanger: 'unknown',
      affectedPerson: 'Yo',
      narrative: 'Necesito ayuda con una situación.',
      privacyAcknowledged: true,
    }
    expect(reportSchema.parse(input).excludedUserIds).toEqual([])
    expect(reportSchema.safeParse({ ...input, occurredOn: '2026-02-30' }).success).toBe(false)
    expect(reportSchema.safeParse({ ...input, privacyAcknowledged: false }).success).toBe(false)
  })
})
