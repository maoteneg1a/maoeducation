import { describe, expect, it } from 'vitest'
import { DEFAULT_REPORTS_FLOW, extractReportsFlow, validateReportsFlow } from './reports-flow'
import { REINFORCEMENT_ANNEXES, withReinforcementAnnexes } from './reinforcement-annexes'

const clone = () => structuredClone(DEFAULT_REPORTS_FLOW)

describe('reports flow — configuración por institución', () => {
  it('separa el Anexo 1 grupal del documento 7 del checklist, que sigue siendo un informe al tutor', () => {
    const cfg = clone()
    const tutor = cfg.reportTypes.findIndex((t) => t.key === 'bajo_rendimiento_tutor')
    cfg.reportTypes[tutor] = { ...cfg.reportTypes.find((t) => t.key === 'acta_entrega_alertas')!, key: 'bajo_rendimiento_tutor' }
    cfg.reportTypes = cfg.reportTypes.filter((t) => t.key !== 'acta_entrega_alertas')
    const result = extractReportsFlow({ reportsFlow: cfg })
    expect(result.reportTypes.find((t) => t.key === 'acta_entrega_alertas')).toMatchObject({ snapshot: 'early_alerts', scope: 'parallel', to: 'subdireccion' })
    expect(result.reportTypes.find((t) => t.key === 'bajo_rendimiento_tutor')).toMatchObject({ snapshot: 'grades', scope: 'student', to: 'tutor' })
    expect(result.dossier.items.find((i) => i.key === 'd7')).toMatchObject({ reportType: 'bajo_rendimiento_tutor', minCount: 3 })
    expect(result.reportTypes.filter((t) => t.pdfTemplate === 'annex_alerts')).toHaveLength(1)
  })
  it('adapta los cinco anexos sin eliminar informes propios ni cambiar el expediente', () => {
    const cfg = clone()
    cfg.reportTypes.push({ ...cfg.reportTypes[0], key: 'informe_propio', label: 'Informe propio' })
    cfg.instances.find((i) => i.key === 'subdireccion')!.role = 'inspector'
    const next = withReinforcementAnnexes(cfg)
    expect(next.reportTypes.filter((t) => t.pdfTemplate)).toHaveLength(5)
    expect(next.reportTypes.find((t) => t.key === 'informe_propio')).toEqual(cfg.reportTypes.at(-1))
    expect(next.instances.find((i) => i.key === 'subdireccion')?.role).toBe('inspector')
    expect(next.dossier).toEqual(cfg.dossier)
    expect(withReinforcementAnnexes(next)).toEqual(next)
    expect(validateReportsFlow(next)).toEqual([])
  })

  it('mantiene una configuración previamente guardada hasta cargar los anexos explícitamente', () => {
    const cfg = clone()
    cfg.reportTypes = [{ ...cfg.reportTypes[0], pdfTemplate: undefined, fields: [] }]
    expect(extractReportsFlow({ reportsFlow: cfg }).reportTypes).toEqual(cfg.reportTypes)
    expect(REINFORCEMENT_ANNEXES.find((t) => t.pdfTemplate === 'annex_plan')?.fields.map((f) => f.key)).toEqual(expect.arrayContaining(['lengua_competencia', 'matematica_indicador', 'matematica_saberes', 'horario', 'entorno', 'agrupacion']))
  })

  it('rechaza una nómina de alertas configurada para representantes', () => {
    const cfg = clone()
    cfg.reportTypes.find((t) => t.pdfTemplate === 'annex_alerts')!.to = 'representante'
    expect(validateReportsFlow(cfg).some((e) => e.includes('destinatario del personal'))).toBe(true)
  })
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
