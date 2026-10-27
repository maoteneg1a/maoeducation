import { describe, expect, it } from 'vitest'
import { computePeriodSummary, effectiveActivityScore, normalizeScore, validPeriodWeights } from './grade-math'

describe('grade math institutional scale', () => {
  it('keeps a score over 5 on the configured /5 scale', () => {
    expect(normalizeScore(4.9, 5, 5)).toBeCloseTo(4.9)
  })

  it('expresses the complete period summary on the configured scale', () => {
    const summary = computePeriodSummary(
      [
        {
          id: 'partials',
          name: 'Parciales',
          activities: [
            { score: 4.9, maxScore: 5, kind: 'regular' },
            { score: 4.5, maxScore: 5, kind: 'regular' },
          ],
        },
      ],
      30,
      5,
    )

    expect(summary.insumosBase).toBeCloseTo(4.7)
    expect(summary.total).toBeCloseTo(4.7)
  })

  it('normalizes activities with different point totals to the institution scale', () => {
    const summary = computePeriodSummary(
      [
        {
          id: 'workshops',
          name: 'Talleres',
          activities: [
            { score: 4, maxScore: 5, kind: 'regular' },
            { score: 8, maxScore: 10, kind: 'regular' },
          ],
        },
      ],
      30,
      5,
    )

    expect(summary.insumosBase).toBeCloseTo(4)
  })

  it('recalculates an averaged reinforcement instead of trusting a stale stored score', () => {
    expect(effectiveActivityScore({
      score: '29.50',
      baseScore: '5',
      reinforcementScore: '9',
      reinforcementMode: 'average',
    })).toBe(7)
  })
})


describe('separate exam and project percentages', () => {
  const groups = [{ id: 'work', name: 'Trabajo', activities: [
    { score: 8, maxScore: 10, kind: 'regular' as const },
    { score: 6, maxScore: 10, kind: 'exam' as const },
    { score: 10, maxScore: 10, kind: 'project' as const },
  ] }]

  it('calculates 70% formative, 20% exam and 10% project', () => {
    const summary = computePeriodSummary(groups, 30, 10, 10)
    expect(summary.summativeAvg).toBeCloseTo(22 / 3)
    expect(summary.total).toBeCloseTo(7.8)
  })

  it('preserves the legacy 70/15/15 split for courses without an explicit project weight', () => {
    expect(computePeriodSummary(groups, 30).total).toBeCloseTo(8)
  })

  it('excludes the project when its weight is zero', () => {
    expect(computePeriodSummary(groups, 30, 10, 0).total).toBeCloseTo(7.4)
  })

  it('excludes the exam when the project uses the entire summative percentage', () => {
    expect(computePeriodSummary(groups, 30, 10, 30).total).toBeCloseTo(8.6)
  })

  it('uses only formative grades when both summative percentages are zero', () => {
    expect(computePeriodSummary(groups, 0, 10, 0).total).toBeCloseTo(8)
  })

  it('uses only the project when it accounts for 100% of the period', () => {
    expect(computePeriodSummary(groups, 100, 10, 100).total).toBeCloseTo(10)
  })

  it('ignores missing grades while keeping the configured weights among available summative grades', () => {
    const pendingExam = [{ ...groups[0], activities: groups[0].activities.map((a) => a.kind === 'exam' ? { ...a, score: null } : a) }]
    expect(computePeriodSummary(pendingExam, 30, 10, 10).total).toBeCloseTo(8.6)
  })

  it('respects a recorded zero instead of treating it as a missing project grade', () => {
    const zeroProject = [{ ...groups[0], activities: groups[0].activities.map((a) => a.kind === 'project' ? { ...a, score: 0 } : a) }]
    expect(computePeriodSummary(zeroProject, 30, 10, 10).total).toBeCloseTo(6.8)
  })

  it('normalizes configured weights on a scale other than 10', () => {
    expect(computePeriodSummary(groups, 30, 5, 10).total).toBeCloseTo(3.9)
  })

  it.each([[101, 10], [30, 31], [30, -1], [NaN, 10], [30, Infinity], [30.5, 10]])('rejects invalid weights %s/%s', (total, project) => {
    expect(validPeriodWeights(total, project)).toBe(false)
  })
})


describe('mejora individual sin descenso de la actividad', () => {
  it('reconcilia valores históricos: original 3 y mejora 1 conservan 3 aunque se hubiera guardado 2', () => {
    expect(effectiveActivityScore({ score: 2, baseScore: 3, reinforcementScore: 1, reinforcementMode: 'agreement_formative' })).toBe(3)
    expect(effectiveActivityScore({ score: 2.5, baseScore: 3, reinforcementScore: 2, reinforcementMode: 'agreement_formative' })).toBe(3)
  })
  it('conserva el comportamiento sumativo separado', () => {
    expect(effectiveActivityScore({ score: 6, baseScore: 5, reinforcementScore: 7, reinforcementMode: 'agreement_with_reinforcement' })).toBe(6)
  })
})
