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
    const wordCount = item.activity.trim().split(/\s+/).filter(Boolean).length
    if (!item.activity || wordCount < MIN_ACTIVITY_WORDS || GENERIC_ACTIVITIES.has(item.activity.trim().toLowerCase())) {
      errors.push(`${item.phase}_GENERIC_ACTIVITY`)
    }
    if (item.duaCodes.some((code) => !ctx.allowedDuaCodes.has(code))) {
      errors.push('DUA_CODE_NOT_ALLOWED')
    }
    const activityLower = item.activity.toLowerCase()
    if (item.resources.some((r) => !activityLower.includes(r.toLowerCase()))) {
      errors.push('RESOURCE_NOT_JUSTIFIED')
    }
    if (!item.evidence || item.evidence.trim() === item.activity.trim()) {
      errors.push(`${item.phase}_EVIDENCE_NOT_OBSERVABLE`)
    }
  }

  const { assessment } = payload
  if (!assessment.activity || !assessment.technique || !assessment.instrument || !assessment.evidence || assessment.criteria.length === 0) {
    errors.push('ASSESSMENT_INCOMPLETE')
  }
  if (!ctx.allowedTechniqueCodes.has(assessment.technique)) {
    errors.push('TECHNIQUE_NOT_ALLOWED')
  } else if (!ctx.techniqueInstrumentMap.get(assessment.technique)?.has(assessment.instrument)) {
    errors.push('TECHNIQUE_INSTRUMENT_INCOMPATIBLE')
  }
  if (!ctx.allowedInstrumentCodes.has(assessment.instrument)) {
    errors.push('INSTRUMENT_NOT_ALLOWED')
  }
  if (!assessment.evidence || assessment.evidence.trim() === assessment.activity.trim()) {
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
