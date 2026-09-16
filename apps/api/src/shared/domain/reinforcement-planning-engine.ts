/**
 * Motor determinista (SIN IA) para secuenciar el plan temporal de un caso de
 * refuerzo pedagógico — puerto literal de reinforcement_planning_engine.py
 * (motor TIGA). Mismo patrón de ubicación que otros motores deterministas del
 * proyecto (pedagogical-methodology.ts, workload-resolution.ts).
 *
 * 6 fases fijas con contenido predefinido en español, asignadas según la
 * posición proporcional del índice de semana dentro de la duración total.
 * NUNCA falla ni consulta fuentes externas: genera siempre un plan completo.
 */

import type { LearningTarget, PedagogicalNeed, ReinforcementMode } from './reinforcement-domain'

export type ReinforcementPhase =
  | 'RECOVERY_EXPLORATION'
  | 'MODELING'
  | 'GUIDED_PRACTICE'
  | 'APPLICATION'
  | 'TRANSFER'
  | 'CHECK_REEVALUATION'

interface PhaseContent {
  heading: string
  objective: string
  strategy: string
  resource: string
  mechanism: string
}

const PHASE_CONTENT: Record<ReinforcementPhase, PhaseContent> = {
  RECOVERY_EXPLORATION: {
    heading: 'Activación y exploración focal',
    objective: 'Recuperar referentes previos y precisar la dificultad observable.',
    strategy: 'Preguntas breves, representación inicial y contraste guiado',
    resource: 'Registro inicial elaborado con materiales del entorno o del aula',
    mechanism: 'Registro de observación y preguntas de comprobación',
  },
  MODELING: {
    heading: 'Modelado del procedimiento',
    objective: 'Hacer visible una ruta de resolución vinculada con el aprendizaje focal.',
    strategy: 'Ejemplo trabajado y explicación de decisiones',
    resource: 'Ejemplo anotado en pizarra, cuaderno o ficha reutilizable',
    mechanism: 'Lista de cotejo del procedimiento explicado',
  },
  GUIDED_PRACTICE: {
    heading: 'Práctica guiada con retroalimentación',
    objective: 'Aplicar la ruta modelada con apoyo gradual y corrección oportuna.',
    strategy: 'Andamiaje mediante consignas, pistas y retroalimentación inmediata',
    resource: 'Consigna graduada y recursos ya disponibles en el aula',
    mechanism: 'Observación del desempeño con criterio de logro',
  },
  APPLICATION: {
    heading: 'Aplicación contextualizada',
    objective: 'Usar el aprendizaje focal en una tarea significativa y verificable.',
    strategy: 'Resolución contextualizada con autonomía creciente',
    resource: 'Situación del entorno, cuaderno y material institucional disponible',
    mechanism: 'Rúbrica breve o lista de cotejo del producto',
  },
  TRANSFER: {
    heading: 'Transferencia a una situación diferente',
    objective: 'Seleccionar y aplicar la estrategia pertinente en un contexto nuevo.',
    strategy: 'Variación de contexto y explicación de la elección realizada',
    resource: 'Caso alternativo preparado con recursos reutilizables',
    mechanism: 'Comparación de desempeño entre contextos',
  },
  CHECK_REEVALUATION: {
    heading: 'Comprobación del aprendizaje focal',
    objective: 'Producir evidencia posterior comparable con el resultado inicial.',
    strategy: 'Tarea integradora y reflexión sobre el procedimiento',
    resource: 'Instrumento previsto y evidencia conservada durante el ciclo',
    mechanism: 'Valoración comparativa de evidencia inicial y posterior',
  },
}

const ACTIVITY_LENSES: readonly string[] = [
  'recuperar una representación previa y señalar qué elementos resultan útiles',
  'clasificar ejemplos y contraejemplos explicando el criterio utilizado',
  'contrastar una respuesta inicial con una referencia y localizar el punto de dificultad',
  'observar un ejemplo trabajado y reconstruir oralmente sus decisiones clave',
  'completar un procedimiento parcialmente resuelto justificando cada elección',
  'resolver una variante con pistas graduadas y revisar de inmediato el resultado',
  'analizar un error frecuente y proponer una corrección verificable',
  'comparar dos rutas de solución y seleccionar la más pertinente',
  'aplicar el aprendizaje en una situación cercana y registrar el procedimiento',
  'representar la misma idea mediante un formato alternativo y explicar equivalencias',
  'resolver una tarea con menor apoyo y comprobarla con un criterio explícito',
  'intercambiar estrategias, contrastar evidencias y ajustar la propia producción',
  'aplicar el procedimiento en un caso con datos o condiciones diferentes',
  'crear un ejemplo propio que cumpla los criterios y someterlo a comprobación',
  'integrar lo aprendido en un producto breve y explicar las decisiones tomadas',
  'resolver una evidencia final, compararla con la inicial y formular una reflexión',
]

export interface ReinforcementTemporalUnit {
  temporalIndex: number
  phase: ReinforcementPhase
  learningFocus: string
  specificObjective: string
  strategy: string
  concreteActivity: string
  requiredResource: string
  observableEvidence: string
  evaluationMechanism: string
  frequency: string
  advancementCriterion: string
  nextStep: string
}

export interface ReinforcementTemporalPlan {
  durationWeeks: number
  mode: ReinforcementMode
  configuredFrequency: string
  initialResultReference: string
  units: ReinforcementTemporalUnit[]
}

/** Calcada EXACTA de _phase_for en reinforcement_planning_engine.py. */
function phaseFor(index: number, duration: number): ReinforcementPhase {
  if (duration === 1) return 'CHECK_REEVALUATION'
  if (index === duration) return 'CHECK_REEVALUATION'
  if (duration === 2) return 'RECOVERY_EXPLORATION'
  if (duration === 3) return (['RECOVERY_EXPLORATION', 'GUIDED_PRACTICE'] as const)[index - 1]
  if (duration === 4) return (['RECOVERY_EXPLORATION', 'MODELING', 'APPLICATION'] as const)[index - 1]
  const progress = (index - 1) / (duration - 1)
  if (progress < 0.18) return 'RECOVERY_EXPLORATION'
  if (progress < 0.36) return 'MODELING'
  if (progress < 0.58) return 'GUIDED_PRACTICE'
  if (progress < 0.78) return 'APPLICATION'
  return 'TRANSFER'
}

export interface GeneratePlanOptions {
  mode?: ReinforcementMode
  frequency?: string
  initialResult?: string
}

/**
 * Genera el plan temporal de N semanas — sin persistir, sin IA. Puerto literal
 * de ReinforcementPlanningEngine.generate en reinforcement_planning_engine.py.
 */
export function generateReinforcementPlan(
  learningTarget: LearningTarget,
  pedagogicalNeeds: PedagogicalNeed[],
  durationWeeks: number,
  options: GeneratePlanOptions = {},
): ReinforcementTemporalPlan {
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1) {
    throw new Error('REINFORCEMENT_DURATION_MUST_BE_POSITIVE')
  }
  const mode = (options.mode ?? 'INDIVIDUAL') as ReinforcementMode
  if (mode !== 'INDIVIDUAL' && mode !== 'GROUP') {
    throw new Error('INVALID_REINFORCEMENT_MODE')
  }
  if (!pedagogicalNeeds.length) {
    throw new Error('PEDAGOGICAL_NEED_REQUIRED')
  }

  const configuredFrequency = (options.frequency ?? '').trim()
  const focus = learningTarget.description.trim() || learningTarget.title.trim()
  const sourceActivities = learningTarget.activities.map((a) => a.trim()).filter(Boolean)
  const needs = pedagogicalNeeds

  const units: ReinforcementTemporalUnit[] = []
  for (let index = 1; index <= durationWeeks; index++) {
    const phase = phaseFor(index, durationWeeks)
    const { heading, objective, strategy, resource, mechanism } = PHASE_CONTENT[phase]
    const need = needs[(index - 1) % needs.length]
    const source = sourceActivities.length ? sourceActivities[(index - 1) % sourceActivities.length] : focus
    const lens = ACTIVITY_LENSES[(index - 1) % ACTIVITY_LENSES.length]
    const cycle = Math.floor((index - 1) / ACTIVITY_LENSES.length) + 1
    const depth =
      cycle > 1
        ? `con autonomía creciente e incorporando ${cycle - 1} condiciones nuevas de transferencia`
        : 'con acompañamiento proporcional'

    let activity = `A partir de «${source}», ${lens}, ${depth}, atendiendo a ${need.label.toLowerCase()}.`
    if (durationWeeks === 1) {
      activity =
        `A partir de «${source}», recuperar una respuesta inicial, observar un modelo breve, ` +
        `realizar una práctica focal, aplicarla y comprobar la evidencia obtenida, ` +
        `atendiendo a ${need.label.toLowerCase()}.`
    }

    const isFinal = index === durationWeeks
    const evidence = isFinal
      ? 'Evidencia posterior comparable con el resultado inicial y registro de la valoración docente'
      : `Producción observable de ${heading.toLowerCase()} con explicación de decisiones`
    const criterion = isFinal
      ? 'La evidencia permite al docente comparar el desempeño inicial y posterior'
      : 'Cumple el criterio focal y explica el procedimiento con el apoyo previsto'
    const nextStep = isFinal
      ? 'El docente revisa la comparación y registra la decisión pedagógica correspondiente'
      : 'Avanzar a la siguiente unidad o ajustar el apoyo según la evidencia observada'

    units.push({
      temporalIndex: index,
      phase,
      learningFocus: focus,
      specificObjective: objective,
      strategy,
      concreteActivity: activity,
      requiredResource: resource,
      observableEvidence: evidence,
      evaluationMechanism: mechanism,
      frequency: configuredFrequency,
      advancementCriterion: criterion,
      nextStep,
    })
  }

  return {
    durationWeeks,
    mode,
    configuredFrequency,
    initialResultReference: (options.initialResult ?? '').trim(),
    units,
  }
}
