import { average } from './grade-math'
import type { FormativePolicy, FormativeApplication } from './formative-reinforcement'

export interface RegisterEvidence {
  sessionId: string; planId: string; title: string; date: string; targetActivityId: string | null
  status: string; score: number | null; scoreScaleMax: number | null; appliedScore: number | null
}

/** Vacío no es cero. Solo las actividades calificadas y asistidas entran al promedio. */
export function automaticRegisterInput(policy: FormativePolicy, scale: number, rows: RegisterEvidence[], validOriginalIds: Set<string>, previous?: { activityIds?: string[]; evidence?: Array<{ sessionId: string }> }) {
  const activityIds = new Set<string>()
  const evidence: Array<{ sessionId: string; planId: string; title: string; date: string; score: number; sourceScore: number; maxScore: number }> = []
  for (const row of rows) {
    if (row.status !== 'present' || row.score == null || row.appliedScore != null) continue
    let targets = row.targetActivityId ? [row.targetActivityId] : []
    // Conserva el vínculo explícito de aplicaciones históricas antes de existir el registro automático.
    if (!targets.length && previous?.evidence?.some((entry) => entry.sessionId === row.sessionId)) targets = previous.activityIds ?? []
    if (row.targetActivityId && !validOriginalIds.has(row.targetActivityId)) continue
    if (policy.mode === 'activity_set') {
      targets = targets.filter((id) => validOriginalIds.has(id))
      if (!targets.length) continue
    }
    const maxScore = row.scoreScaleMax ?? scale
    if (!Number.isFinite(row.score) || !Number.isFinite(maxScore) || maxScore <= 0 || row.score < 0 || row.score > maxScore) continue
    if (policy.mode === 'activity_set') targets.forEach((id) => activityIds.add(id))
    evidence.push({ sessionId: row.sessionId, planId: row.planId, title: row.title, date: row.date, score: row.score * scale / maxScore, sourceScore: row.score, maxScore })
  }
  evidence.sort((a, b) => a.sessionId.localeCompare(b.sessionId))
  const application: FormativeApplication = { ...policy, gradingScaleMax: scale, activityIds: [...activityIds].sort(), score: average(evidence.map((entry) => entry.score)) }
  return { application, evidence }
}
