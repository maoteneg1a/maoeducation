import { describe, expect, it } from 'vitest'
import { distributeCompetencyWeeks, type DistributionCompetency, type WeekDistribution } from './competency-week-distribution'

function saber(id: string, type: 'declarativo' | 'procedimental' | 'actitudinal', code: string): { id: string; type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string } {
  return { id, type, code, description: code }
}

function competencyWithDeclarativos(id: string, count: number): DistributionCompetency {
  return {
    id,
    code: `CE.${id.toUpperCase()}`,
    text: `Competencia ${id}`,
    sabers: Array.from({ length: count }, (_, i) => saber(`${id}.d.${i + 1}`, 'declarativo', `${id}.d.${i + 1}`)),
  }
}

const COMPETENCY_A: DistributionCompetency = {
  id: 'a',
  code: 'CE.A',
  text: 'Competencia A',
  sabers: [
    saber('a.d.1', 'declarativo', 'a.d.1'),
    saber('a.d.2', 'declarativo', 'a.d.2'),
    saber('a.p.1', 'procedimental', 'a.p.1'),
    saber('a.p.2', 'procedimental', 'a.p.2'),
    saber('a.at.1', 'actitudinal', 'a.at.1'),
  ],
}

const COMPETENCY_B: DistributionCompetency = {
  id: 'b',
  code: 'CE.B',
  text: 'Competencia B',
  sabers: [saber('b.d.1', 'declarativo', 'b.d.1'), saber('b.at.1', 'actitudinal', 'b.at.1')],
}

// Cada semana de distributeCompetencyWeeks trae exactamente 1 competencia
// (el algoritmo de dosificación asigna bloques contiguos de UNA competencia
// por semana) — el shape es array para permitir que el wizard agregue más
// manualmente después, no porque el motor las mezcle.
function weekCompetencyId(week: WeekDistribution): string {
  expect(week.competencies).toHaveLength(1)
  return week.competencies[0].competencyId
}
function weekSaberIds(week: WeekDistribution): string[] {
  return week.competencies.flatMap((c) => c.saberIds)
}
function weekSabers(week: WeekDistribution) {
  return week.competencies.flatMap((c) => c.sabers)
}

describe('distributeCompetencyWeeks', () => {
  it('asigna 1 declarativo por semana dentro del bloque de una competencia', () => {
    const { weeks } = distributeCompetencyWeeks([COMPETENCY_A], 2)
    expect(weeks).toHaveLength(2)
    expect(weekSaberIds(weeks[0])).toContain('a.d.1')
    expect(weekSaberIds(weeks[1])).toContain('a.d.2')
  })

  it('bug real reportado: una competencia con muchos declarativos NO ocupa todas las semanas si hay otra disponible', () => {
    const dense = competencyWithDeclarativos('dense', 10)
    const other = competencyWithDeclarativos('other', 2)
    const { weeks } = distributeCompetencyWeeks([dense, other], 8)
    const competencyIdsUsed = new Set(weeks.map(weekCompetencyId))
    expect(competencyIdsUsed.size).toBeGreaterThan(1)
    expect(weeks.filter((w) => weekCompetencyId(w) === 'dense').length).toBeLessThan(8)
    expect(weeks.filter((w) => weekCompetencyId(w) === 'other').length).toBeGreaterThan(0)
  })

  it('reparte las semanas proporcional a la densidad de declarativos de cada competencia', () => {
    const dense = competencyWithDeclarativos('dense', 8)
    const sparse = competencyWithDeclarativos('sparse', 2)
    const { weeks } = distributeCompetencyWeeks([dense, sparse], 10)
    const denseWeeks = weeks.filter((w) => weekCompetencyId(w) === 'dense').length
    const sparseWeeks = weeks.filter((w) => weekCompetencyId(w) === 'sparse').length
    expect(denseWeeks + sparseWeeks).toBe(10)
    expect(denseWeeks).toBeGreaterThan(sparseWeeks)
    expect(sparseWeeks).toBeGreaterThanOrEqual(1)
  })

  it('respeta la capacidad por carga horaria (weeklyPeriods) al elegir cuántas competencias entran', () => {
    const many = [competencyWithDeclarativos('a', 3), competencyWithDeclarativos('b', 3), competencyWithDeclarativos('c', 3)]
    // weeklyPeriods=2, weeksCount=6 -> capacity = floor(2*6/12) = 1
    const { weeks, coverageWarning } = distributeCompetencyWeeks(many, 6, 2)
    const competencyIdsUsed = new Set(weeks.map(weekCompetencyId))
    expect(competencyIdsUsed.size).toBe(1)
    expect(coverageWarning).toContain('sin espacio')
  })

  it('sin weeklyPeriods, usa el fallback ceil(weeksCount/4) para la capacidad', () => {
    const many = [competencyWithDeclarativos('a', 2), competencyWithDeclarativos('b', 2), competencyWithDeclarativos('c', 2)]
    // fallback: ceil(8/4) = 2 competencias entran de las 3 disponibles
    const { weeks, coverageWarning } = distributeCompetencyWeeks(many, 8)
    const competencyIdsUsed = new Set(weeks.map(weekCompetencyId))
    expect(competencyIdsUsed.size).toBe(2)
    expect(coverageWarning).toContain('sin espacio')
  })

  it('reparte procedimentales/actitudinales solo entre las semanas que ocupa esa competencia', () => {
    const { weeks } = distributeCompetencyWeeks([COMPETENCY_A], 2)
    const allExtraIds = weeks.flatMap(weekSaberIds).filter((id) => id !== 'a.d.1' && id !== 'a.d.2')
    expect(allExtraIds.sort()).toEqual(['a.at.1', 'a.p.1', 'a.p.2'].sort())
    for (const week of weeks) {
      expect(weekSabers(week).every((s) => s.id.startsWith('a.'))).toBe(true)
    }
  })

  it('cicla los declarativos dentro del bloque y marca coverageWarning si se agotan antes de terminar', () => {
    const { weeks, coverageWarning } = distributeCompetencyWeeks([COMPETENCY_B], 3)
    expect(weeks).toHaveLength(3)
    expect(weeks.every((w) => weekCompetencyId(w) === 'b')).toBe(true)
    expect(coverageWarning).toBeTruthy()
  })

  it('no marca coverageWarning cuando los declarativos alcanzan exactamente y todas las competencias entran', () => {
    // capacity = floor(8*3/12) = 2 -> ambas entran; allocations [2,1] coincide
    // exactamente con sus declarativos (A tiene 2, B tiene 1) -> sin ciclo, sin sobrantes.
    const { coverageWarning } = distributeCompetencyWeeks([COMPETENCY_A, COMPETENCY_B], 3, 8)
    expect(coverageWarning).toBeUndefined()
  })

  it('si hay menos semanas que competencias con capacidad, recorta a las primeras N', () => {
    const many = [competencyWithDeclarativos('a', 2), competencyWithDeclarativos('b', 2), competencyWithDeclarativos('c', 2)]
    const { weeks } = distributeCompetencyWeeks(many, 2, 12) // capacity alto, pero solo 2 semanas
    expect(weeks).toHaveLength(2)
    const competencyIdsUsed = new Set(weeks.map(weekCompetencyId))
    expect(competencyIdsUsed.size).toBe(2)
    expect(competencyIdsUsed.has('a')).toBe(true)
    expect(competencyIdsUsed.has('b')).toBe(true)
  })

  it('devuelve un aviso y ninguna semana si ninguna competencia tiene declarativos', () => {
    const noDeclarativo: DistributionCompetency = { id: 'c', code: 'CE.C', text: 'C', sabers: [saber('c.p.1', 'procedimental', 'c.p.1')] }
    const { weeks, coverageWarning } = distributeCompetencyWeeks([noDeclarativo], 3)
    expect(weeks).toHaveLength(0)
    expect(coverageWarning).toBeTruthy()
  })
})
