import { describe, expect, it } from 'vitest'
import { computePeriodSummary, type InsumoGroupInput } from './grade-math'
import { applyFormativeReinforcement, validateFormativePolicy, type FormativeApplication } from './formative-reinforcement'

const groups: InsumoGroupInput[] = [
  { id: 'a', name: 'Tareas', activities: [
    { id: 'a1', score: 4, maxScore: 10, kind: 'regular' },
    { id: 'a2', score: 8, maxScore: 10, kind: 'regular' },
  ] },
  { id: 'b', name: 'Clase', activities: [
    { id: 'b1', score: 5, maxScore: 10, kind: 'regular' },
    { id: 'exam', score: 9, maxScore: 10, kind: 'exam' },
  ] },
]
const policy: FormativeApplication = { mode: 'period_formative', reinforcementWeight: 50, cap: 7, score: 8, activityIds: [] }
const initial = () => computePeriodSummary(groups, 30, 10, 0)

describe('refuerzo formativo institucional', () => {
  it('combina la base formativa y conserva exactamente la sumativa', () => {
    const result = applyFormativeReinforcement(initial(), groups, policy, 30)
    expect(result.insumosBase).toBe(6.75)
    expect(result.summativeAvg).toBe(9)
    expect(result.total).toBeCloseTo(6.75 * .7 + 9 * .3)
    expect(initial().insumosBase).toBe(5.5)
    expect(result.insumoAvgs).toEqual(initial().insumoAvgs)
  })
  it('conserva el peso de una actividad dentro del promedio por insumo', () => {
    const result = applyFormativeReinforcement(initial(), groups, { ...policy, mode: 'activity_set', activityIds: ['a1'] }, 30)
    // a1 pesa 1/2 insumos * 1/2 actividades = 1/4. Pasa de 4 a 6.
    expect(result.insumosBase).toBe(6)
  })
  it('conserva pesos desiguales cuando el conjunto cruza insumos', () => {
    const result = applyFormativeReinforcement(initial(), groups, { ...policy, mode: 'activity_set', activityIds: ['a1', 'b1'] }, 30)
    // Aporte original: 4*.25 + 5*.5 = 3.5; promedio conjunto 14/3.
    expect(result.insumosBase).toBeCloseTo(5.5 + .75 * ((14 / 3 + 8) / 2 - 14 / 3))
  })
  it('no cuenta dos veces IDs repetidos ni incluye sumativas o notas ausentes', () => {
    const a = applyFormativeReinforcement(initial(), groups, { ...policy, mode: 'activity_set', activityIds: ['a1'] }, 30)
    const b = applyFormativeReinforcement(initial(), groups, { ...policy, mode: 'activity_set', activityIds: ['a1', 'a1', 'exam', 'missing'] }, 30)
    expect(a).toEqual(b)
  })
  it('aplica el tope al conjunto recuperado, no al total trimestral', () => {
    const result = applyFormativeReinforcement(initial(), groups, { ...policy, score: 10 }, 30)
    expect(result.insumosBase).toBe(7)
    expect(result.total).toBeCloseTo(7.6)
  })
  it('no disminuye una nota inicial si el refuerzo es menor o ya supera el tope', () => {
    expect(applyFormativeReinforcement(initial(), groups, { ...policy, score: 1 }, 30).insumosBase).toBe(5.5)
    expect(applyFormativeReinforcement(initial(), groups, { ...policy, mode: 'activity_set', activityIds: ['a2'], score: 10 }, 30).insumosBase).toBe(5.5)
  })
  it('permite ponderaciones institucionales y normaliza las actividades originales', () => {
    const scaled = groups.map((g) => ({ ...g, activities: g.activities.map((a) => ({ ...a, score: a.score! * 2, maxScore: 20 })) }))
    const result = applyFormativeReinforcement(computePeriodSummary(scaled, 30, 10, 0), scaled, { ...policy, reinforcementWeight: 25 }, 30)
    expect(result.insumosBase).toBe(6.125)
  })
  it('deja intacto el resultado al retirar la aplicación o no tener notas', () => {
    expect(applyFormativeReinforcement(initial(), groups, { ...policy, score: null }, 30)).toEqual(initial())
    const empty = computePeriodSummary([], 30)
    expect(applyFormativeReinforcement(empty, [], policy, 30)).toEqual(empty)
  })
  it('no atribuye pesos de actividades cuando hay promedios manuales', () => {
    const manual = { ...initial(), insumoAvgs: [{ id: 'a', name: 'Tareas', avg: 9 }, initial().insumoAvgs[1]] }
    expect(applyFormativeReinforcement(manual, groups, { ...policy, mode: 'activity_set', activityIds: ['a1'] }, 30)).toEqual(manual)
  })
  it('rechaza modalidades desconocidas, pesos extremos y valores no finitos', () => {
    for (const patch of [{ mode: 'total' }, { reinforcementWeight: 0 }, { reinforcementWeight: 100 }, { reinforcementWeight: NaN }, { cap: 11 }, { cap: 0 }]) {
      expect(validateFormativePolicy({ ...policy, ...patch } as FormativeApplication, 10)).not.toBeNull()
    }
    expect(validateFormativePolicy(policy, 10)).toBeNull()
    expect(validateFormativePolicy({ ...policy, mode: null }, 10)).toBeNull()
  })
})
