import { describe, expect, it } from 'vitest'
import {
  AGREEMENT_00082A_PRESET as P,
  agreementSubjectStatus,
  applyDecimals,
  complianceWarnings,
  deepMerge,
  extractAgreementRules,
  improvedScore,
  isAlertScore,
  resolveAgreement,
} from './agreement-rules'

describe('agreement rules — resolución por institución/año', () => {
  it('sin perfil normativo conserva el marco anterior (opt-in)', () => {
    expect(resolveAgreement({})).toBeNull()
  })

  it('activa las reglas cuando el marco es 2026-00082-A', () => {
    const rules = resolveAgreement({ normativeProfile: { framework: 'MINEDEC-2026-00082-A' } })
    expect(rules?.promotion.supletorioMin).toBe(4.01)
  })

  it('respeta la excepción por año lectivo (Costa 2026-2027)', () => {
    const settings = { normativeProfile: { framework: 'MINEDEC-2026-00082-A', frameworkByYear: { y1: 'LEGACY' } } }
    expect(resolveAgreement(settings, 'y1')).toBeNull()
    expect(resolveAgreement(settings, 'y2')).not.toBeNull()
  })

  it('la institución puede sobreescribir cualquier parámetro', () => {
    const rules = extractAgreementRules({ agreementRules: { promotion: { minToPass: 8 } } })
    expect(rules.promotion.minToPass).toBe(8)
    expect(rules.promotion.supletorioMin).toBe(4.01)
  })

  it('deepMerge reemplaza arrays en lugar de mezclarlos', () => {
    expect(deepMerge({ a: [1, 2] }, { a: [3] })).toEqual({ a: [3] })
  })
})

describe('agreement rules — cálculo', () => {
  it('trunca a dos decimales (art. 8)', () => {
    expect(applyDecimals(6.996, P.decimals)).toBe(6.99)
    expect(applyDecimals(7.0, P.decimals)).toBe(7)
    expect(applyDecimals(6.999999999, { places: 2, method: 'round' })).toBe(7)
  })

  it('refuerzo formativo: promedio con tope 7,00 (art. 10.4)', () => {
    expect(improvedScore(P, 3, 10, false).score).toBe(6.5)
    expect(improvedScore(P, 6, 10, false).score).toBe(7)
    expect(improvedScore(P, 3, 1, false).score).toBe(3)
    expect(improvedScore(P, 8, 10, false).score).toBe(8)
  })

  it('mejora sumativa directa: 7,01–8,99 con tope 9,00 (art. 11)', () => {
    const r = improvedScore(P, 8, 10, true)
    expect(r).toEqual({ score: 9, mode: 'direct' })
  })

  it('mejora sumativa con refuerzo: 0,01–6,99 con tope 7,00 (art. 12)', () => {
    expect(improvedScore(P, 5, 10, true)).toEqual({ score: 7, mode: 'with_reinforcement' })
  })

  it('nota sumativa de 9 o más no habilita mejora', () => {
    expect(improvedScore(P, 9.5, 10, true)).toEqual({ score: 9.5, mode: null })
  })

  it('escala las reglas cuando la actividad no es sobre 10', () => {
    expect(improvedScore(P, 1.5, 5, false, 5).score).toBe(3.25)
    expect(improvedScore(P, 3, 5, false, 5).score).toBe(3.5)
  })

  it('rango de alerta 0,01–6,99 (art. 10.1)', () => {
    expect(isAlertScore(P, 6.99)).toBe(true)
    expect(isAlertScore(P, 7)).toBe(false)
    expect(isAlertScore(P, 0)).toBe(false)
  })
})

describe('agreement rules — promoción', () => {
  it('promoción automática en Inicial/Preparatoria/Elemental (art. 20)', () => {
    expect(agreementSubjectStatus(P, 3, 'elemental')).toBe('automatic')
  })

  it('supletorio 4,01–6,99 (art. 23)', () => {
    expect(agreementSubjectStatus(P, 4.01, 'superior')).toBe('supletorio')
    expect(agreementSubjectStatus(P, 6.99, 'bgu')).toBe('supletorio')
  })

  it('4,00 o menos: repitencia directa en Superior/BGU (art. 25) y junta en Media (art. 27)', () => {
    expect(agreementSubjectStatus(P, 4, 'bgu')).toBe('repeat_direct')
    expect(agreementSubjectStatus(P, 3.5, 'media')).toBe('junta')
  })

  it('7,00 o más aprueba (art. 21)', () => {
    expect(agreementSubjectStatus(P, 7, 'media')).toBe('approved')
  })
})

describe('agreement rules — cumplimiento', () => {
  it('fiscal con 70/30 y preset no tiene advertencias', () => {
    const w = complianceWarnings({ sostenimiento: 'fiscal', regime: 'SIERRA_AMAZONIA', framework: 'MINEDEC-2026-00082-A', frameworkByYear: {} }, P, 30)
    expect(w).toEqual([])
  })

  it('avisa cuando una fiscal se aparta del 70/30', () => {
    const w = complianceWarnings({ sostenimiento: 'fiscal', regime: 'SIERRA_AMAZONIA', framework: 'MINEDEC-2026-00082-A', frameworkByYear: {} }, P, 40)
    expect(w.map((x) => x.code)).toContain('weights')
  })

  it('para particulares el aviso es referencial', () => {
    const w = complianceWarnings({ sostenimiento: 'particular', regime: 'SIERRA_AMAZONIA', framework: 'MINEDEC-2026-00082-A', frameworkByYear: {} }, P, 40)
    expect(w[0].message).toContain('Referencial')
  })
})
