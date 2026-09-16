/**
 * Dominio neutral del proceso de refuerzo pedagógico — puerto de
 * reinforcement_domain.py (motor TIGA). Máquina de estados y tipos
 * compartidos entre el motor de planificación, los casos de uso del módulo
 * pedagogic-recovery y el PDF.
 */

export type ReinforcementStatus =
  | 'DETECTED'
  | 'PLANNED'
  | 'IN_REINFORCEMENT'
  | 'EVALUATED'
  | 'CLOSED'
  | 'CONTINUES_REINFORCEMENT'

/** Transiciones válidas — calcadas 1:1 de ALLOWED_TRANSITIONS en reinforcement_domain.py. */
export const ALLOWED_TRANSITIONS: Record<ReinforcementStatus, ReinforcementStatus[]> = {
  DETECTED: ['PLANNED'],
  PLANNED: ['IN_REINFORCEMENT'],
  IN_REINFORCEMENT: ['EVALUATED'],
  EVALUATED: ['CLOSED', 'CONTINUES_REINFORCEMENT'],
  CONTINUES_REINFORCEMENT: ['PLANNED', 'IN_REINFORCEMENT'],
  CLOSED: [],
}

export class InvalidStatusTransitionError extends Error {
  constructor(from: ReinforcementStatus, to: ReinforcementStatus) {
    super(`INVALID_STATUS_TRANSITION:${from}->${to}`)
  }
}

/** Valida y aplica una transición de estado; lanza si no es una transición permitida. */
export function assertTransition(from: ReinforcementStatus, to: ReinforcementStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new InvalidStatusTransitionError(from, to)
  }
}

export type ReinforcementMode = 'INDIVIDUAL' | 'GROUP'

export type PedagogicalDecision =
  | ''
  | 'LEARNING_ACHIEVED'
  | 'CONTINUE_REINFORCEMENT'
  | 'MODIFY_STRATEGY_OR_SUPPORT'
  | 'INSTITUTIONAL_FOLLOW_UP'

export type ReevaluationResult = 'CONSOLIDATED' | 'NOT_CONSOLIDATED'

export interface PedagogicalNeed {
  code: string
  label: string
  observation?: string
}

export interface LearningTarget {
  title: string
  description: string
  activities: string[]
  evidence: string
}

/** Sugerencia auto-generada de comunicación al representante — nunca sustituye la decisión del docente. */
export function suggestCommunicationText(
  mediumLabel: string,
  participantNames: string[],
  recipient: string,
  commitmentLabels: string[],
): string {
  const names = participantNames.join(', ')
  const commitmentText = commitmentLabels.length
    ? ` Se acuerda ${commitmentLabels.map((l) => l.toLowerCase()).join('; ')}.`
    : ''
  return (
    `Mediante ${mediumLabel.toLowerCase()}, se informa a ${recipient} sobre el plan de refuerzo ` +
    `pedagógico de ${names}, establecido para fortalecer el aprendizaje priorizado.${commitmentText}`
  )
}

export const PERSISTENT_DIFFICULTY_SUGGESTION =
  'Se sugiere revisar, con decisión profesional e institucional, la ruta de apoyo que corresponda. ' +
  'Esta observación no constituye diagnóstico, NEE ni derivación automática.'

/** Puerto literal de ReinforcementService._duration_frequency_text. */
export function durationFrequencyText(durationWeeks: number, frequency?: string): string {
  const weeks = Number.isInteger(durationWeeks) ? durationWeeks : 0
  if (weeks < 1) return 'Frecuencia y duración del ciclo por configurar según la necesidad pedagógica'
  const normalizedFrequency = (frequency ?? '').trim()
  const durationLabel = weeks === 1 ? 'una semana' : `${weeks} semanas`
  if (normalizedFrequency) {
    return `${normalizedFrequency} durante ${durationLabel}, con seguimiento según el avance observado`
  }
  const sessions = Math.max(2, weeks)
  const sessionLabel = sessions === 1 ? 'sesión' : 'sesiones'
  return `${sessions} ${sessionLabel} durante ${durationLabel}, con seguimiento según el avance observado`
}

const TIGA_PREFIXES = ['Propuesta pedagógica TIGA:', 'Propuesta TIGA:', 'TIGA:']

/** Puerto literal de ReinforcementService._natural_text. */
export function naturalText(value: string | null | undefined): string {
  let text = (value ?? '').trim()
  for (const prefix of TIGA_PREFIXES) {
    if (text.toLowerCase().startsWith(prefix.toLowerCase())) {
      text = text.slice(prefix.length).trim()
      break
    }
  }
  return text || 'Resolver una actividad breve y explicar el procedimiento utilizado.'
}

/** Puerto literal de ReinforcementService._natural_evidence. */
export function naturalEvidence(value: string | null | undefined): string {
  const text = naturalText(value)
  if (!text || text === 'Resolver una actividad breve y explicar el procedimiento utilizado.') {
    return 'Producto breve o desempeño observable revisado con el instrumento previsto'
  }
  return text
}
