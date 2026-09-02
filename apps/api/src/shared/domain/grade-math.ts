/**
 * Helpers puros del motor de notas, fuente ÚNICA de cálculo compartida por
 * boletín, resumen del profesor, "mis notas" del alumno y promoción.
 *
 * Regla (confirmada por el usuario):
 *  - La base FORMATIVA es el PROMEDIO DE LOS PROMEDIOS POR INSUMO (por categoría):
 *    cada insumo promedia sus actividades regulares, y la base promedia esos promedios.
 *    Cada insumo pesa igual (los pesos por-insumo NO se usan). Pondera 100 - summativeWeight (70%).
 *  - El restante (summativeWeight, 30%) = PROMEDIO de Examen y Proyecto:
 *    examen = actividades tipo `exam`, proyecto = actividades tipo `project`.
 *    (Equivale a Examen 15% + Proyecto 15% cuando summativeWeight = 30.)
 *  - Las actividades sin nota se IGNORAN (para un cero, se registra 0 explícito).
 */

/** Promedio simple ignorando valores nulos. Devuelve null si no hay ninguno. */
export function average(scores: Array<number | null | undefined>): number | null {
  const valid = scores.filter((s): s is number => s != null)
  return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null
}

/** Banda de la escala de valor cualitativo (rango numérico → código A+…F−). */
export interface QualitativeBand {
  min: number
  max: number
  code: string
}

/** Traduce una nota numérica (/10) a su código cualitativo (A+…F−), o null. */
export function toQualitativeCode(value: number | null, scale: QualitativeBand[]): string | null {
  if (value == null) return null
  const band = scale.find((b) => value >= b.min && value <= b.max)
  return band ? band.code : null
}

/** Normaliza una nota a la escala institucional según el puntaje máximo de la actividad. */
export function normalizeScore(
  score: number | null | undefined,
  maxScore: number,
  gradingScaleMax = 10,
): number | null {
  if (score == null) return null
  if (!maxScore || maxScore <= 0 || !gradingScaleMax || gradingScaleMax <= 0) return null
  return (score / maxScore) * gradingScaleMax
}

/** Compatibilidad para consumidores que necesiten explícitamente la escala /10. */
export function normalize10(score: number | null | undefined, maxScore: number): number | null {
  return normalizeScore(score, maxScore, 10)
}

/** Tipo de actividad para el cálculo: formativa (regular), examen o proyecto. */
export type ActivityKind = 'regular' | 'exam' | 'project'

/** Deriva el `kind` a partir del código del tipo de actividad. */
export function activityKind(activityTypeCode: string): ActivityKind {
  if (activityTypeCode === 'exam') return 'exam'
  if (activityTypeCode === 'project') return 'project'
  return 'regular'
}

/** Actividad para el cálculo: su nota (cruda), su puntaje máximo y su tipo. */
export interface ScoredActivity {
  score: number | null
  maxScore: number
  kind: ActivityKind
}

/** Grupo de actividades de un insumo (o "Sin insumo"). */
export interface InsumoGroupInput {
  id: string
  name: string
  activities: ScoredActivity[]
}

/** Promedio formativo de un insumo, expresado en la escala institucional. */
export function insumoGroupAverage(activities: ScoredActivity[], gradingScaleMax = 10): number | null {
  return average(
    activities
      .filter((a) => a.kind === 'regular')
      .map((a) => normalizeScore(a.score, a.maxScore, gradingScaleMax)),
  )
}

export interface PeriodSummary {
  insumoAvgs: Array<{ id: string; name: string; avg: number | null }>
  insumosBase: number | null
  examenAvg: number | null
  proyectoAvg: number | null
  summativeAvg: number | null
  hasSummative: boolean
  total: number | null
}

/**
 * Total ponderado de un periodo: base formativa + sumativa (examen/proyecto) según su peso.
 * Si no hay sumativa, el total es la base formativa.
 */
export function periodTotal(
  regularAvg: number | null,
  summativeAvg: number | null,
  summativeWeight: number,
  hasSummative: boolean,
): number | null {
  if (hasSummative) {
    const regularWeight = 100 - summativeWeight
    if (regularAvg != null && summativeAvg != null) {
      return regularAvg * (regularWeight / 100) + summativeAvg * (summativeWeight / 100)
    }
    if (regularAvg != null) return regularAvg
    if (summativeAvg != null) return summativeAvg
    return null
  }
  return regularAvg
}

/**
 * Aplica la nota de recuperación pedagógica al total del período según el modo configurado.
 * - replace_if_higher: la nota de recuperación reemplaza el período solo si es mayor.
 * - average: promedia la nota original con la de recuperación.
 * Si no hay recuperación (recoveryScore null), devuelve el total original.
 */
export function applyRecovery(
  periodTotal: number | null,
  recoveryScore: number | null,
  mode: 'replace_if_higher' | 'average',
): number | null {
  if (periodTotal === null) return null
  if (recoveryScore === null) return periodTotal
  if (mode === 'replace_if_higher') return Math.max(periodTotal, recoveryScore)
  return (periodTotal + recoveryScore) / 2
}

/**
 * Resumen canónico de un periodo para una asignación/estudiante:
 * base formativa (promedio por insumo), examen, proyecto, sumativa (promedio de ambos)
 * y total ponderado. `hasSummative` se basa en que existan actividades de examen o proyecto.
 */
export function computePeriodSummary(
  groups: InsumoGroupInput[],
  summativeWeight: number,
  gradingScaleMax = 10,
): PeriodSummary {
  const insumoAvgs = groups.map((g) => ({
    id: g.id,
    name: g.name,
    avg: insumoGroupAverage(g.activities, gradingScaleMax),
  }))
  const insumosBase = average(insumoAvgs.map((i) => i.avg))

  const all = groups.flatMap((g) => g.activities)
  const examActivities = all.filter((a) => a.kind === 'exam')
  const projectActivities = all.filter((a) => a.kind === 'project')
  const examenAvg = average(examActivities.map((a) => normalizeScore(a.score, a.maxScore, gradingScaleMax)))
  const proyectoAvg = average(projectActivities.map((a) => normalizeScore(a.score, a.maxScore, gradingScaleMax)))
  const summativeAvg = average([examenAvg, proyectoAvg])
  const hasSummative = examActivities.length > 0 || projectActivities.length > 0

  const total = periodTotal(insumosBase, summativeAvg, summativeWeight, hasSummative)
  return { insumoAvgs, insumosBase, examenAvg, proyectoAvg, summativeAvg, hasSummative, total }
}
