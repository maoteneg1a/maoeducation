import { describe, expect, it } from 'vitest'
import { distributeCompetencyWeeks, type DistributionCompetency } from './competency-week-distribution'

function saber(id: string, type: 'declarativo' | 'procedimental' | 'actitudinal', code: string): { id: string; type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string } {
  return { id, type, code, description: code }
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

describe('distributeCompetencyWeeks', () => {
  it('asigna 1 declarativo por semana', () => {
    const { weeks } = distributeCompetencyWeeks([COMPETENCY_A], 2)
    expect(weeks).toHaveLength(2)
    expect(weeks[0].saberIds).toContain('a.d.1')
    expect(weeks[1].saberIds).toContain('a.d.2')
  })

  it('pasa a la siguiente competencia cuando la actual se queda sin declarativos', () => {
    const { weeks } = distributeCompetencyWeeks([COMPETENCY_A, COMPETENCY_B], 3)
    expect(weeks[0].competencyId).toBe('a')
    expect(weeks[1].competencyId).toBe('a')
    expect(weeks[2].competencyId).toBe('b')
    expect(weeks[2].saberIds).toContain('b.d.1')
  })

  it('reparte procedimentales/actitudinales solo entre las semanas que ocupa esa competencia', () => {
    const { weeks } = distributeCompetencyWeeks([COMPETENCY_A], 2)
    const allExtraIds = weeks.flatMap((w) => w.saberIds).filter((id) => id !== 'a.d.1' && id !== 'a.d.2')
    expect(allExtraIds.sort()).toEqual(['a.at.1', 'a.p.1', 'a.p.2'].sort())
    // Ninguna semana debe llevar saberes de otra competencia.
    for (const week of weeks) {
      expect(week.sabers.every((s) => s.id.startsWith('a.'))).toBe(true)
    }
  })

  it('cicla desde la primera competencia y marca coverageWarning si se agotan todos los declarativos', () => {
    const { weeks, coverageWarning } = distributeCompetencyWeeks([COMPETENCY_B], 3)
    expect(weeks).toHaveLength(3)
    expect(weeks[0].competencyId).toBe('b')
    expect(weeks[1].competencyId).toBe('b')
    expect(weeks[2].competencyId).toBe('b')
    expect(coverageWarning).toBeTruthy()
  })

  it('no marca coverageWarning cuando los declarativos alcanzan exactamente', () => {
    const { coverageWarning } = distributeCompetencyWeeks([COMPETENCY_A, COMPETENCY_B], 3)
    expect(coverageWarning).toBeUndefined()
  })

  it('devuelve un aviso y ninguna semana si ninguna competencia tiene declarativos', () => {
    const noDeclarativo: DistributionCompetency = { id: 'c', code: 'CE.C', text: 'C', sabers: [saber('c.p.1', 'procedimental', 'c.p.1')] }
    const { weeks, coverageWarning } = distributeCompetencyWeeks([noDeclarativo], 3)
    expect(weeks).toHaveLength(0)
    expect(coverageWarning).toBeTruthy()
  })
})
