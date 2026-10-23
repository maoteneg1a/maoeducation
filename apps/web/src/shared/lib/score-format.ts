export interface DecimalsRule {
  places: number
  method: 'truncate' | 'round'
}

/** Aplica truncado o redondeo (Acuerdo 2026-00082-A art. 8: dos decimales truncados). */
export function applyDecimals(value: number | null | undefined, rule?: DecimalsRule | null): number | null {
  if (value == null || !Number.isFinite(value)) return value ?? null
  if (!rule) return value
  const f = 10 ** rule.places
  const scaled = Number((value * f).toFixed(6))
  return (rule.method === 'truncate' ? Math.trunc(scaled) : Math.round(scaled)) / f
}

/** Formatea una nota respetando el método de decimales configurado (sin regla: redondeo a 2). */
export function formatScore(value: number | null | undefined, rule?: DecimalsRule | null, fallback = '—'): string {
  if (value == null || !Number.isFinite(value)) return fallback
  if (!rule) return value.toFixed(2)
  return (applyDecimals(value, rule) as number).toFixed(rule.places)
}
