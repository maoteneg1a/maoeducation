import { describe, expect, it } from 'vitest'
import { DEFAULT_REPORTS_FLOW, extractReportsFlow, validateReportsFlow } from './reports-flow'

const clone = () => structuredClone(DEFAULT_REPORTS_FLOW)

describe('reports flow — configuración por institución', () => {
  it('el preset es válido', () => {
    expect(validateReportsFlow(DEFAULT_REPORTS_FLOW)).toEqual([])
  })

  it('sin configuración usa el preset', () => {
    expect(extractReportsFlow({}).reportTypes.length).toBe(DEFAULT_REPORTS_FLOW.reportTypes.length)
  })

  it('la institución reemplaza secciones completas', () => {
    const cfg = extractReportsFlow({ reportsFlow: { folioPrefix: 'UEX', instances: [{ key: 'tutor', label: 'Tutor', resolver: 'tutor_of_parallel' }] } })
    expect(cfg.folioPrefix).toBe('UEX')
    expect(cfg.instances).toHaveLength(1)
  })

  it('detecta informes que apuntan a instancias inexistentes', () => {
    const cfg = clone()
    cfg.instances = cfg.instances.filter((i) => i.key !== 'dece')
    expect(validateReportsFlow(cfg).some((e) => e.includes('"dece"'))).toBe(true)
  })

  it('el expediente no puede apuntar a un informe inexistente', () => {
    const cfg = clone()
    cfg.reportTypes = cfg.reportTypes.filter((t) => t.key !== 'acta_junta')
    expect(validateReportsFlow(cfg).some((e) => e.includes('expediente'))).toBe(true)
  })

  it('el representante nunca puede subir archivos ni redactar', () => {
    const cfg = clone()
    cfg.attachments.uploaderRoles.push('guardian')
    cfg.reportTypes[0].authorRoles.push('guardian')
    const errors = validateReportsFlow(cfg)
    expect(errors.some((e) => e.includes('subir archivos'))).toBe(true)
    expect(errors.some((e) => e.includes('no pueden redactar'))).toBe(true)
  })

  it('valida instancias de rol y de usuarios', () => {
    const cfg = clone()
    cfg.instances.push({ key: 'coord', label: 'Coordinación', resolver: 'role' })
    cfg.instances.push({ key: 'equipo', label: 'Equipo', resolver: 'users', userIds: [] })
    const errors = validateReportsFlow(cfg)
    expect(errors.some((e) => e.includes('"coord" necesita un rol'))).toBe(true)
    expect(errors.some((e) => e.includes('"equipo" necesita al menos un usuario'))).toBe(true)
  })
})
