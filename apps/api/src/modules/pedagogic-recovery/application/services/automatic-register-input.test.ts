import { describe, expect, it } from 'vitest'
import { automaticRegisterInput, type RegisterEvidence } from './automatic-register-input'
const policy = { mode: 'period_formative' as const, reinforcementWeight: 50, cap: 7 }
const row = (patch: Partial<RegisterEvidence> = {}): RegisterEvidence => ({ sessionId: 'session', planId: 'plan', title: 'Práctica', date: '2026-10-26', targetActivityId: null, status: 'present', score: 10, scoreScaleMax: 10, appliedScore: null, ...patch })
describe('evidencias del registro automático', () => {
  it('promedia planes de la misma asignatura y normaliza escalas, incluyendo cero', () => {
    const result = automaticRegisterInput(policy, 10, [row(), row({ sessionId: 'second', planId: 'other', score: 50, scoreScaleMax: 100 }), row({ sessionId: 'zero', score: 0 })], new Set())
    expect(result.application.score).toBe(5)
    expect(result.evidence).toHaveLength(3)
  })
  it('excluye vacíos, ausencias, notas inválidas y mejoras individuales ya aplicadas', () => {
    const result = automaticRegisterInput(policy, 10, [row({ score: null }), row({ status: 'absent' }), row({ status: 'justified' }), row({ appliedScore: 7 }), row({ score: 11 }), row({ scoreScaleMax: 0 }), row({ targetActivityId: 'exam' })], new Set(['formative']))
    expect(result.application.score).toBeNull()
    expect(result.evidence).toEqual([])
  })
  it('vincula una vez cada actividad original y descarta columnas sin vínculo en modalidad por actividades', () => {
    const result = automaticRegisterInput({ ...policy, mode: 'activity_set' }, 10, [row(), row({ sessionId: 'a', targetActivityId: 'original' }), row({ sessionId: 'b', targetActivityId: 'original', score: 8 }), row({ sessionId: 'invalid', targetActivityId: 'other', score: 20 })], new Set(['original', 'other']))
    expect(result.application.activityIds).toEqual(['original'])
    expect(result.application.score).toBe(9)
  })
  it('conserva solo los vínculos explícitos de evidencias históricas', () => {
    const result = automaticRegisterInput({ ...policy, mode: 'activity_set' }, 10, [row(), row({ sessionId: 'unlinked', score: 0 })], new Set(['original']), { activityIds: ['original'], evidence: [{ sessionId: 'session' }] })
    expect(result.application.score).toBe(10)
    expect(result.application.activityIds).toEqual(['original'])
  })
})
