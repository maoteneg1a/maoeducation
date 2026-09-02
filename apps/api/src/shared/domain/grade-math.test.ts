import { describe, expect, it } from 'vitest'
import { computePeriodSummary, normalizeScore } from './grade-math'

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
})
