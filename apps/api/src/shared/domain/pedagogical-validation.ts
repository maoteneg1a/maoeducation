/**
 * Validación agresiva de la respuesta del LLM antes de aceptarla — réplica
 * funcional del patrón `validate_generated_pedagogy` de TIGA. La IA nunca es
 * confiable por defecto: se verifica que no alteró códigos curriculares, que
 * la actividad no es genérica, que los recursos mencionados aparecen
 * literalmente en el texto, que la técnica/instrumento pertenecen al catálogo
 * permitido, y que la evaluación está alineada con el indicador. Si algo
 * falla, quien llama debe reintentar con los errores o caer al fallback
 * determinista — esta función solo diagnostica, nunca decide qué hacer.
 */

import { PHASES, type PedagogicalPhase } from './pedagogical-methodology'

const GENERIC_ACTIVITIES = new Set(['realizar una actividad sobre el tema.', 'explicar el tema.', 'trabajar en grupos.'])
const MIN_ACTIVITY_WORDS = 8
const STOPWORDS = new Set(['de', 'la', 'el', 'los', 'las', 'con', 'para', 'y', 'en', 'un', 'una', 'del', 'al', 'su', 'sus'])

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
}

/** Quita plurales simples (-s/-es) para que "hojas"/"hoja" cuenten como la misma palabra. */
function stem(word: string): string {
  if (word.length > 5 && word.endsWith('es')) return word.slice(0, -2)
  if (word.length > 4 && word.endsWith('s')) return word.slice(0, -1)
  return word
}

function significantStems(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
      .map(stem),
  )
}

/**
 * Un recurso está "justificado" si sus palabras significativas (por raíz,
 * tolerando singular/plural) aparecen en el texto de la actividad — no exige
 * el string completo idéntico carácter por carácter, porque un LLM real casi
 * nunca repite una frase larga textualmente aunque el recurso sí esté descrito
 * en la actividad (ej. resource="hojas de trabajo" vs activity "...usando una
 * hoja de trabajo..."). Si NINGUNA palabra significativa del recurso aparece
 * en la actividad, se considera inventado/no justificado.
 */
function isResourceJustified(resource: string, activity: string): boolean {
  const resourceStems = significantStems(resource)
  if (resourceStems.size === 0) return true
  const activityStems = significantStems(activity)
  for (const stem of resourceStems) {
    if (activityStems.has(stem)) return true
  }
  return false
}

export interface GeneratedPhaseActivity {
  phase: PedagogicalPhase
  activity: string
  duaCodes: string[]
  resources: string[]
  evidence: string
}

export interface GeneratedAssessment {
  activity: string
  technique: string
  instrument: string
  evidence: string
  criteria: string[]
}

export interface GeneratedPedagogyPayload {
  identityCode: string
  methodology: GeneratedPhaseActivity[]
  assessment: GeneratedAssessment
}

export interface PedagogicalValidationContext {
  /** Código de la competencia/destreza + indicador seleccionado — debe venir idéntico en la respuesta. */
  expectedIdentityCode: string
  indicatorText: string
  allowedDuaCodes: Set<string>
  allowedTechniqueCodes: Set<string>
  techniqueInstrumentMap: Map<string, Set<string>>
  allowedInstrumentCodes: Set<string>
}

export interface PedagogicalValidationResult {
  status: 'VERIFIED' | 'REJECTED'
  errors: string[]
}

export function validateGeneratedPedagogy(
  payload: GeneratedPedagogyPayload,
  ctx: PedagogicalValidationContext,
): PedagogicalValidationResult {
  const errors: string[] = []

  if (payload.identityCode !== ctx.expectedIdentityCode) {
    errors.push('IDENTITY_CODE_ALTERED')
  }

  const seenPhases = new Set(payload.methodology.map((m) => m.phase))
  for (const phase of PHASES) {
    if (!seenPhases.has(phase)) errors.push(`${phase}_MISSING`)
  }

  for (const item of payload.methodology) {
    // Un campo faltante/malformado en la respuesta del modelo es un error de validación,
    // no debe tumbar la petición completa con una excepción sin control.
    if (!item.activity || typeof item.activity !== 'string') {
      errors.push(`${item.phase}_INCOMPLETE`)
      continue
    }
    const wordCount = item.activity.trim().split(/\s+/).filter(Boolean).length
    if (wordCount < MIN_ACTIVITY_WORDS || GENERIC_ACTIVITIES.has(item.activity.trim().toLowerCase())) {
      errors.push(`${item.phase}_GENERIC_ACTIVITY`)
    }
    if (!Array.isArray(item.duaCodes) || item.duaCodes.some((code) => !ctx.allowedDuaCodes.has(code))) {
      errors.push('DUA_CODE_NOT_ALLOWED')
    }
    if (!Array.isArray(item.resources) || item.resources.some((r) => !isResourceJustified(r, item.activity))) {
      errors.push('RESOURCE_NOT_JUSTIFIED')
    }
    if (!item.evidence || typeof item.evidence !== 'string' || item.evidence.trim() === item.activity.trim()) {
      errors.push(`${item.phase}_EVIDENCE_NOT_OBSERVABLE`)
    }
  }

  const { assessment } = payload
  if (
    !assessment.activity ||
    !assessment.technique ||
    !assessment.instrument ||
    !assessment.evidence ||
    !Array.isArray(assessment.criteria) ||
    assessment.criteria.length === 0
  ) {
    errors.push('ASSESSMENT_INCOMPLETE')
    return { status: 'REJECTED', errors: [...new Set(errors)] }
  }
  if (!ctx.allowedTechniqueCodes.has(assessment.technique)) {
    errors.push('TECHNIQUE_NOT_ALLOWED')
  } else if (!ctx.techniqueInstrumentMap.get(assessment.technique)?.has(assessment.instrument)) {
    errors.push('TECHNIQUE_INSTRUMENT_INCOMPATIBLE')
  }
  if (!ctx.allowedInstrumentCodes.has(assessment.instrument)) {
    errors.push('INSTRUMENT_NOT_ALLOWED')
  }
  if (assessment.evidence.trim() === assessment.activity.trim()) {
    errors.push('ASSESSMENT_EVIDENCE_NOT_OBSERVABLE')
  }

  const indicatorTerms = ctx.indicatorText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 5)
  const assessmentText = [assessment.activity, assessment.evidence, ...assessment.criteria].join(' ').toLowerCase()
  const aligned = indicatorTerms.some((term) => assessmentText.includes(term.replace(/[.,;:()]/g, '')))
  if (indicatorTerms.length > 0 && !aligned) {
    errors.push('ASSESSMENT_NOT_ALIGNED_WITH_INDICATOR')
  }

  return { status: errors.length === 0 ? 'VERIFIED' : 'REJECTED', errors: [...new Set(errors)] }
}
