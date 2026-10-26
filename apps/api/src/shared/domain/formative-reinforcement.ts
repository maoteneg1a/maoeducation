import { average, normalizeScore, periodTotal, type InsumoGroupInput, type PeriodSummary } from './grade-math'

export interface FormativePolicy {
  mode: 'activity_set' | 'period_formative' | null
  reinforcementWeight: number
  cap: number
}

export interface FormativeApplication extends FormativePolicy {
  activityIds: string[]
  gradingScaleMax?: number
  /** Resultado del plan expresado en la misma escala que la base formativa. */
  score: number | null
}

export function validateFormativePolicy(p: FormativePolicy, scale: number): string | null {
  if (!p || ![null, 'activity_set', 'period_formative'].includes(p.mode)) return 'Modalidad de refuerzo formativo inválida'
  if (!Number.isFinite(p.reinforcementWeight) || p.reinforcementWeight <= 0 || p.reinforcementWeight >= 100) return 'El peso del refuerzo debe ser mayor que 0 y menor que 100'
  if (!Number.isFinite(p.cap) || p.cap <= 0 || p.cap > scale) return 'El tope de refuerzo debe estar dentro de la escala de calificación'
  return null
}

/** Conserva la estructura canónica: igual peso por insumo y por actividad dentro del insumo. */
export function applyFormativeReinforcement(
  summary: PeriodSummary,
  groups: InsumoGroupInput[],
  application: FormativeApplication | undefined,
  summativeWeight: number,
  scale = 10,
): PeriodSummary {
  if (!application?.mode || application.score == null || summary.insumosBase == null) return summary
  const originalScale = application.gradingScaleMax ?? scale
  if (!Number.isFinite(originalScale) || originalScale <= 0) return summary
  const score = application.score * scale / originalScale
  const cap = application.cap * scale / originalScale
  const { reinforcementWeight, mode } = application
  if (validateFormativePolicy({ ...application, cap }, scale) || !Number.isFinite(score) || score < 0 || score > scale) return summary
  let initial = summary.insumosBase
  let share = 1
  if (mode === 'activity_set') {
    const selected = new Set(application.activityIds)
    const validGroups = groups.map((g) => ({
      id: g.id,
      activities: g.activities.filter((a) => a.kind === 'regular' && normalizeScore(a.score, a.maxScore, scale) != null),
    })).filter((g) => g.activities.length > 0)
    const calculatedBase = average(validGroups.map((g) => average(g.activities.map((a) => normalizeScore(a.score, a.maxScore, scale)))))
    if (calculatedBase == null || Math.abs(calculatedBase - summary.insumosBase) > 1e-8) return summary
    // Los promedios manuales no permiten atribuir un peso fiable a actividades individuales.
    if (validGroups.some((g) => Math.abs((summary.insumoAvgs.find((i) => i.id === g.id)?.avg ?? 0) -
      (average(g.activities.map((a) => normalizeScore(a.score, a.maxScore, scale))) ?? 0)) > 1e-8)) return summary
    let contribution = 0
    share = 0
    for (const g of validGroups) for (const a of g.activities) {
      if (!a.id || !selected.has(a.id)) continue
      const weight = 1 / validGroups.length / g.activities.length
      share += weight
      contribution += normalizeScore(a.score, a.maxScore, scale)! * weight
    }
    if (!share) return summary
    initial = contribution / share
  }
  const w = reinforcementWeight / 100
  // Una mejora nunca reduce la nota de origen, incluso si ya supera el tope.
  const adjusted = Math.max(initial, Math.min(cap, initial * (1 - w) + score * w))
  const insumosBase = summary.insumosBase + share * (adjusted - initial)
  return {
    ...summary,
    insumosBase,
    formativeReinforcement: { mode, initial: summary.insumosBase, result: score, adjusted: insumosBase, weight: reinforcementWeight, cap },
    total: periodTotal(insumosBase, summary.summativeAvg, summativeWeight, summary.hasSummative),
  }
}
