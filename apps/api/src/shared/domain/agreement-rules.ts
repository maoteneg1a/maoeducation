/**
 * Reglas normativas de evaluación (Acuerdo MINEDEC-MINEDEC-2026-00082-A) —
 * TODAS parametrizables por institución.
 *
 * Los valores del acuerdo viven aquí solo como PRESET: cada institución los
 * guarda en `Institution.settings.agreementRules` y puede cambiarlos. El motor
 * nunca usa una constante normativa directamente: siempre pasa por
 * `resolveAgreement()`, que devuelve `null` cuando la institución (o el año
 * lectivo) sigue con el marco anterior — en ese caso el motor conserva su
 * comportamiento histórico sin ningún cambio (opt-in).
 */

export type Sostenimiento = 'fiscal' | 'particular' | 'fiscomisional' | 'municipal'
export type AcademicRegimeCode = 'SIERRA_AMAZONIA' | 'COSTA_GALAPAGOS'
/** LEGACY = comportamiento previo de Auleka (Acuerdo 2024-00031-A). */
export type NormativeFramework = 'MINEDEC-2026-00082-A' | 'LEGACY'
export type SubnivelCode = 'inicial' | 'preparatoria' | 'elemental' | 'media' | 'superior' | 'bgu'

export const SOSTENIMIENTOS: Sostenimiento[] = ['fiscal', 'particular', 'fiscomisional', 'municipal']
export const FRAMEWORKS: NormativeFramework[] = ['MINEDEC-2026-00082-A', 'LEGACY']
export const SUBNIVELES: SubnivelCode[] = ['inicial', 'preparatoria', 'elemental', 'media', 'superior', 'bgu']

export interface NormativeProfile {
  sostenimiento: Sostenimiento
  regime: AcademicRegimeCode
  /** Marco por defecto de la institución. */
  framework: NormativeFramework
  /** Excepción por año lectivo (p. ej. Costa 2026-2027 sigue con LEGACY). */
  frameworkByYear: Record<string, NormativeFramework>
}

export interface ImprovementRule {
  enabled: boolean
  /** Rango (inclusive) de la nota inicial que habilita esta modalidad. */
  min: number
  max: number
  /** Nota máxima resultante. */
  cap: number
  /** Máximo de evaluaciones mejoradas por asignatura en el año (0 = sin límite). */
  perSubject: number
  /** Máximo de evaluaciones mejoradas entre todas las asignaturas en el año (0 = sin límite). */
  perYear: number
}

export interface AgreementRules {
  decimals: { places: number; method: 'truncate' | 'round' }
  earlyAlert: {
    /** formative = base formativa del periodo (art. 10.1); period_total = nota total del periodo. */
    source: 'formative' | 'period_total'
    /** live = se recalcula con cada consulta; period_close = solo con el periodo cerrado. */
    moment: 'live' | 'period_close'
    quantitativeMin: number
    quantitativeMax: number
    /** Códigos cualitativos que activan la alerta (Preparatoria/Elemental). */
    qualitativeCodes: string[]
    /** Subniveles evaluados con escala cualitativa para la alerta. */
    qualitativeSubniveles: SubnivelCode[]
    /** Subniveles en los que NO se generan alertas (p. ej. Inicial). */
    excludedSubniveles: SubnivelCode[]
  }
  /** Refuerzo de actividades FORMATIVAS (art. 10.4). */
  formativeReinforcement: { method: 'average' | 'replace'; cap: number | null }
  /** Mejora de evaluaciones SUMATIVAS (art. 11–14). */
  summativeImprovement: { direct: ImprovementRule; withReinforcement: ImprovementRule }
  /** Recuperación pedagógica por periodo (PedagogicRecovery). */
  periodRecovery: { method: 'average' | 'replace_if_higher'; cap: number | null }
  /** Art. 18: evaluación atrasada sin justificación. */
  lateAssessment: { unjustifiedScore: number; applyTo: 'summative' | 'all' }
  promotion: {
    automaticSubniveles: SubnivelCode[]
    minToPass: number
    supletorioMin: number
    supletorioMax: number
    /** Nota máxima del supletorio, registrada como promedio final (art. 22). */
    supletorioCap: number
    /** Promedio igual o menor → repitencia directa (art. 25). */
    directRepeatMax: number
    directRepeatSubniveles: SubnivelCode[]
    /** Art. 27: en estos subniveles la junta de docentes puede promover. */
    juntaDecisionSubniveles: SubnivelCode[]
  }
  /** Ponderación referencial (obligatoria para fiscales, art. 36). */
  weights: { formative: number; summative: number }
}

export const AGREEMENT_00082A_PRESET: AgreementRules = {
  decimals: { places: 2, method: 'truncate' },
  earlyAlert: {
    source: 'formative',
    moment: 'live',
    quantitativeMin: 0.01,
    quantitativeMax: 6.99,
    qualitativeCodes: ['E-', 'E+', 'D-', 'D+', 'C-', 'C+'],
    qualitativeSubniveles: ['preparatoria', 'elemental'],
    excludedSubniveles: ['inicial'],
  },
  formativeReinforcement: { method: 'average', cap: 7 },
  summativeImprovement: {
    direct: { enabled: true, min: 7.01, max: 8.99, cap: 9, perSubject: 1, perYear: 3 },
    withReinforcement: { enabled: true, min: 0.01, max: 6.99, cap: 7, perSubject: 2, perYear: 6 },
  },
  periodRecovery: { method: 'average', cap: 7 },
  lateAssessment: { unjustifiedScore: 1, applyTo: 'summative' },
  promotion: {
    automaticSubniveles: ['inicial', 'preparatoria', 'elemental'],
    minToPass: 7,
    supletorioMin: 4.01,
    supletorioMax: 6.99,
    supletorioCap: 7,
    directRepeatMax: 4,
    directRepeatSubniveles: ['superior', 'bgu'],
    juntaDecisionSubniveles: ['media'],
  },
  weights: { formative: 70, summative: 30 },
}

export const DEFAULT_NORMATIVE_PROFILE: NormativeProfile = {
  sostenimiento: 'fiscal',
  regime: 'SIERRA_AMAZONIA',
  // Instituciones existentes: opt-in. Solo las nuevas nacen con el marco 2026.
  framework: 'LEGACY',
  frameworkByYear: {},
}

/** Escala de valor (A+…E-) del art. 7, sin F-. Rangos numéricos editables por la institución. */
export const AGREEMENT_00082A_VALUE_SCALE = [
  { min: 9.5, max: 10.0, code: 'A+' },
  { min: 9.0, max: 9.49, code: 'A-' },
  { min: 8.0, max: 8.99, code: 'B+' },
  { min: 7.0, max: 7.99, code: 'B-' },
  { min: 6.0, max: 6.99, code: 'C+' },
  { min: 5.0, max: 5.99, code: 'C-' },
  { min: 4.51, max: 4.99, code: 'D+' },
  { min: 4.01, max: 4.5, code: 'D-' },
  { min: 2.67, max: 4.0, code: 'E+' },
  { min: 0, max: 2.66, code: 'E-' },
]

/** Bandas de equivalencia del art. 7 (alcanzado / en proceso / iniciado). */
export const AGREEMENT_00082A_QUALITATIVE_BANDS = [
  { min: 7.0, max: 10.0, code: 'AL', label: 'Destreza o aprendizaje alcanzado' },
  { min: 5.0, max: 6.99, code: 'EP', label: 'Destreza o aprendizaje en proceso de desarrollo' },
  { min: 0, max: 4.99, code: 'IN', label: 'Destreza o aprendizaje iniciado' },
]

// ─── Lectura desde settings (con fallback a preset) ──────────────────────────

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v)

/** Merge profundo de objetos planos (los arrays se reemplazan, no se mezclan). */
export function deepMerge<T>(base: T, patch: unknown): T {
  if (!isObj(base) || !isObj(patch)) return (patch === undefined ? base : (patch as T))
  const out: Obj = { ...(base as Obj) }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    out[k] = isObj(out[k]) && isObj(v) ? deepMerge(out[k], v) : v
  }
  return out as T
}

export function extractNormativeProfile(settings: unknown): NormativeProfile {
  const s = (isObj(settings) ? settings : {}) as Obj
  const p = deepMerge(DEFAULT_NORMATIVE_PROFILE, s.normativeProfile ?? {})
  return { ...p, frameworkByYear: isObj(p.frameworkByYear) ? (p.frameworkByYear as Record<string, NormativeFramework>) : {} }
}

export function extractAgreementRules(settings: unknown): AgreementRules {
  const s = (isObj(settings) ? settings : {}) as Obj
  return deepMerge(AGREEMENT_00082A_PRESET, s.agreementRules ?? {})
}

export function frameworkForYear(profile: NormativeProfile, academicYearId?: string | null): NormativeFramework {
  if (academicYearId && profile.frameworkByYear[academicYearId]) return profile.frameworkByYear[academicYearId]
  return profile.framework
}

/**
 * Reglas activas para la institución/año, o `null` si aplica el marco anterior
 * (el motor conserva su comportamiento histórico).
 */
export function resolveAgreement(settings: unknown, academicYearId?: string | null): AgreementRules | null {
  const profile = extractNormativeProfile(settings)
  if (frameworkForYear(profile, academicYearId) !== 'MINEDEC-2026-00082-A') return null
  return extractAgreementRules(settings)
}

// ─── Cálculo ─────────────────────────────────────────────────────────────────

/** Trunca (o redondea) a `places` decimales. Corrige el error binario (6.99999… → 6.99). */
export function applyDecimals(value: number | null, rule: AgreementRules['decimals'] | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return value
  if (!rule) return value
  const f = 10 ** rule.places
  const scaled = Number((value * f).toFixed(6))
  return (rule.method === 'truncate' ? Math.trunc(scaled) : Math.round(scaled)) / f
}

/** Formatea una nota respetando el método de decimales configurado. */
export function formatScore(value: number | null, rule: AgreementRules['decimals'] | null | undefined, places = 2): string {
  if (value == null) return '—'
  const v = applyDecimals(value, rule ?? { places, method: 'round' })
  return (v as number).toFixed(rule?.places ?? places)
}

export function capScore(value: number, cap: number | null | undefined): number {
  return cap == null ? value : Math.min(value, cap)
}

export type ImprovementMode = 'formative' | 'direct' | 'with_reinforcement'

/**
 * Nota resultante de reforzar/mejorar una actividad según el acuerdo.
 * - formativa: promedio (o reemplazo) con tope `formativeReinforcement.cap`.
 * - sumativa: modalidad según la nota inicial (directa 7,01–8,99 tope 9; con refuerzo 0,01–6,99 tope 7).
 * Devuelve `null` en `mode` si la nota inicial no habilita ninguna modalidad sumativa.
 */
export function improvedScore(
  rules: AgreementRules,
  base: number,
  reinforcement: number,
  isSummative: boolean,
  scaleMax = 10,
): { score: number; mode: ImprovementMode | null } {
  // Las reglas se expresan sobre 10; se escalan si la actividad usa otro máximo.
  const k = scaleMax / 10
  if (!isSummative) {
    const fr = rules.formativeReinforcement
    const raw = fr.method === 'average' ? (base + reinforcement) / 2 : reinforcement
    return { score: Math.max(base, capScore(raw, fr.cap == null ? null : fr.cap * k)), mode: 'formative' }
  }
  const { direct, withReinforcement } = rules.summativeImprovement
  const b10 = base / k
  const rule = direct.enabled && b10 >= direct.min && b10 <= direct.max
    ? { r: direct, mode: 'direct' as const }
    : withReinforcement.enabled && b10 >= withReinforcement.min && b10 <= withReinforcement.max
      ? { r: withReinforcement, mode: 'with_reinforcement' as const }
      : null
  if (!rule) return { score: base, mode: null }
  return { score: capScore((base + reinforcement) / 2, rule.r.cap * k), mode: rule.mode }
}

export function isAlertScore(rules: AgreementRules, score: number | null): boolean {
  if (score == null) return false
  return score >= rules.earlyAlert.quantitativeMin && score <= rules.earlyAlert.quantitativeMax
}

export type AgreementSubjectStatus =
  | 'approved'
  | 'automatic'
  | 'supletorio'
  | 'repeat_direct'
  | 'junta'
  | 'pending'

/** Estado de una asignatura al final del año según el acuerdo y el subnivel del grado. */
export function agreementSubjectStatus(
  rules: AgreementRules,
  annualAvg: number | null,
  subnivel: string | null | undefined,
): AgreementSubjectStatus {
  const p = rules.promotion
  const sub = (subnivel ?? '') as SubnivelCode
  if (p.automaticSubniveles.includes(sub)) return 'automatic'
  if (annualAvg == null) return 'pending'
  if (annualAvg >= p.minToPass) return 'approved'
  if (annualAvg >= p.supletorioMin && annualAvg <= p.supletorioMax) return 'supletorio'
  if (annualAvg <= p.directRepeatMax) {
    if (p.directRepeatSubniveles.includes(sub)) return 'repeat_direct'
    if (p.juntaDecisionSubniveles.includes(sub)) return 'junta'
    return 'repeat_direct'
  }
  return 'supletorio'
}

// ─── Advertencias de cumplimiento (no bloquean) ──────────────────────────────

export interface ComplianceWarning {
  code: string
  message: string
  article: string
}

/**
 * Compara la configuración con el preset del acuerdo. Para instituciones
 * fiscales las diferencias son incumplimientos; para el resto, solo avisos
 * (el acuerdo les permite definir sus propios mecanismos).
 */
export function complianceWarnings(profile: NormativeProfile, rules: AgreementRules, examWeight?: number): ComplianceWarning[] {
  if (profile.framework !== 'MINEDEC-2026-00082-A') {
    return [{ code: 'legacy', message: 'La institución usa el marco anterior (Acuerdo 2024-00031-A).', article: 'Transitoria 8' }]
  }
  const P = AGREEMENT_00082A_PRESET
  const out: ComplianceWarning[] = []
  const add = (code: string, message: string, article: string) => out.push({ code, message, article })
  if (rules.decimals.method !== 'truncate' || rules.decimals.places !== 2) add('decimals', 'Los promedios deben expresarse con dos decimales truncados.', 'Art. 8')
  if (rules.earlyAlert.quantitativeMax !== P.earlyAlert.quantitativeMax) add('alert_range', 'El rango de alerta temprana del acuerdo es 0,01 a 6,99.', 'Art. 10')
  if (rules.formativeReinforcement.method !== 'average' || rules.formativeReinforcement.cap !== 7) add('reinforcement', 'El refuerzo se promedia con la nota inicial y llega hasta 7,00.', 'Art. 10.4')
  if (rules.promotion.minToPass !== 7) add('min_to_pass', 'La promoción directa exige 7,00 en cada asignatura.', 'Art. 21')
  if (rules.promotion.supletorioMin !== 4.01 || rules.promotion.supletorioMax !== 6.99) add('supletorio_range', 'El supletorio corresponde a promedios entre 4,01 y 6,99.', 'Art. 23')
  if (rules.promotion.supletorioCap !== 7) add('supletorio_cap', 'La nota máxima del supletorio es 7,00.', 'Art. 22')
  if (rules.promotion.directRepeatMax !== 4) add('direct_repeat', 'La repitencia directa corresponde a 4,00 o menos.', 'Art. 25')
  if (rules.lateAssessment.unjustifiedScore !== 1) add('late', 'La evaluación atrasada no rendida sin justificación se registra con uno.', 'Art. 18')
  const w = examWeight ?? rules.weights.summative
  if (w !== 30 || rules.weights.formative !== 70) add('weights', 'La ponderación de fiscales es 70 % formativa y 30 % sumativa.', 'Art. 36')
  if (profile.sostenimiento !== 'fiscal') {
    return out.map((x) => ({ ...x, message: `${x.message} (Referencial para ${profile.sostenimiento}: la institución puede definir su propio mecanismo.)` }))
  }
  return out
}
