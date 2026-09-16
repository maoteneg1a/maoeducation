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

export interface GeneratedResourceLink {
  kind: 'web_search' | 'generate_document'
  resolvedUrl?: string
  documentSpec?: unknown
}

export interface GeneratedPhaseActivity {
  phase: PedagogicalPhase
  activity: string
  duaCodes: string[]
  resources: string[]
  evidence: string
  resourceLink?: GeneratedResourceLink
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

// ─── Validación — modelo por COMPETENCIAS (formato CNC/TIGA: N actividades
// numeradas por fase con su propio código DUA, recursos y evaluación
// consolidados una sola vez por semana) ─────────────────────────────────────

export interface GeneratedCompetencyActivity {
  text: string
  duaCode: string
}

export interface GeneratedCompetencyPhase {
  activities: GeneratedCompetencyActivity[]
}

// NOTA: a diferencia del modelo por destrezas, "criterio" NO lo redacta la IA —
// se deriva directamente de los códigos de indicador ya elegidos por el docente
// (ver competency-pedagogical-generator.service.ts). Evita que la IA reformule
// con palabras propias algo que ya es un código oficial (fuente de redundancia
// e inconsistencia), y garantiza que el código SIEMPRE se muestre.
export interface GeneratedCompetencyAssessment {
  evidence: string
  technique: string
  instrument: string
  instrumentLink?: GeneratedResourceLink
}

export interface GeneratedCompetencyPedagogyPayload {
  identityCode: string
  methodology: Record<PedagogicalPhase, GeneratedCompetencyPhase>
  resources: string[]
  resourceLink?: GeneratedResourceLink
  assessment: GeneratedCompetencyAssessment
}

const MIN_ACTIVITY_WORDS_COMPETENCY = 6

/** Todas las palabras significativas del texto combinado de TODAS las actividades de la semana — un recurso/criterio del nivel-semana se justifica contra el conjunto, no contra una sola actividad. */
function allActivitiesStems(methodology: Record<PedagogicalPhase, GeneratedCompetencyPhase>): Set<string> {
  const stems = new Set<string>()
  for (const phase of PHASES) {
    for (const activity of methodology[phase]?.activities ?? []) {
      for (const s of significantStems(activity.text)) stems.add(s)
    }
  }
  return stems
}

export function validateGeneratedCompetencyPedagogy(
  payload: GeneratedCompetencyPedagogyPayload,
  ctx: PedagogicalValidationContext,
): PedagogicalValidationResult {
  const errors: string[] = []

  if (payload.identityCode !== ctx.expectedIdentityCode) {
    errors.push('IDENTITY_CODE_ALTERED')
  }

  for (const phase of PHASES) {
    const block = payload.methodology?.[phase]
    if (!block || !Array.isArray(block.activities) || block.activities.length === 0) {
      errors.push(`${phase}_MISSING`)
      continue
    }
    for (const activity of block.activities) {
      if (!activity.text || typeof activity.text !== 'string') {
        errors.push(`${phase}_INCOMPLETE`)
        continue
      }
      const wordCount = activity.text.trim().split(/\s+/).filter(Boolean).length
      if (wordCount < MIN_ACTIVITY_WORDS_COMPETENCY || GENERIC_ACTIVITIES.has(activity.text.trim().toLowerCase())) {
        errors.push(`${phase}_GENERIC_ACTIVITY`)
      }
      if (!activity.duaCode || !ctx.allowedDuaCodes.has(activity.duaCode)) {
        errors.push('DUA_CODE_NOT_ALLOWED')
      }
    }
  }

  if (!Array.isArray(payload.resources) || payload.resources.length === 0) {
    errors.push('RESOURCES_MISSING')
  } else {
    const activityStems = allActivitiesStems(payload.methodology ?? ({} as Record<PedagogicalPhase, GeneratedCompetencyPhase>))
    if (payload.resources.some((r) => !isResourceJustified(r, [...activityStems].join(' ')))) {
      errors.push('RESOURCE_NOT_JUSTIFIED')
    }
  }
  if (payload.resourceLink) {
    if (payload.resourceLink.kind === 'web_search' && !payload.resourceLink.resolvedUrl) {
      errors.push('RESOURCE_LINK_MISSING_URL')
    }
    if (payload.resourceLink.kind === 'generate_document' && !payload.resourceLink.documentSpec) {
      errors.push('RESOURCE_LINK_MISSING_SPEC')
    }
  }

  const { assessment } = payload
  if (!assessment || !assessment.evidence || !assessment.technique || !assessment.instrument) {
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
  if (assessment.instrumentLink) {
    if (assessment.instrumentLink.kind === 'web_search' && !assessment.instrumentLink.resolvedUrl) {
      errors.push('INSTRUMENT_LINK_MISSING_URL')
    }
    if (assessment.instrumentLink.kind === 'generate_document' && !assessment.instrumentLink.documentSpec) {
      errors.push('INSTRUMENT_LINK_MISSING_SPEC')
    }
  }

  // Evidencia no debe repetir literalmente el texto de ninguna actividad —
  // pedido explícito del usuario: "HAY MUCHA REDUNDANCIA EN LAS PALABRAS".
  // El criterio ya no lo redacta la IA (se deriva de los códigos de indicador),
  // así que solo queda comparar evidencia contra actividades.
  const evidenceNorm = assessment.evidence.trim().toLowerCase()
  const activityTexts = PHASES.flatMap((phase) => payload.methodology?.[phase]?.activities ?? []).map((a) =>
    a.text.trim().toLowerCase(),
  )
  if (activityTexts.includes(evidenceNorm)) {
    errors.push('ASSESSMENT_EVIDENCE_NOT_OBSERVABLE')
  }

  const indicatorTerms = ctx.indicatorText
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 5)
  const aligned = indicatorTerms.some((term) => evidenceNorm.includes(term.replace(/[.,;:()]/g, '')))
  if (indicatorTerms.length > 0 && !aligned) {
    errors.push('ASSESSMENT_NOT_ALIGNED_WITH_INDICATOR')
  }

  return { status: errors.length === 0 ? 'VERIFIED' : 'REJECTED', errors: [...new Set(errors)] }
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
    // resourceLink es opcional, pero si el modelo lo incluye, cada kind exige su
    // dato correspondiente — un resourceLink incompleto pierde el link en
    // silencio (resolveResourceLinkText simplemente lo omite), así que mejor
    // rechazar y reintentar en vez de dejarlo pasar a medias.
    if (item.resourceLink) {
      if (item.resourceLink.kind === 'web_search' && !item.resourceLink.resolvedUrl) {
        errors.push(`${item.phase}_RESOURCE_LINK_MISSING_URL`)
      }
      if (item.resourceLink.kind === 'generate_document' && !item.resourceLink.documentSpec) {
        errors.push(`${item.phase}_RESOURCE_LINK_MISSING_SPEC`)
      }
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
