/**
 * Catálogos pedagógicos fijos para detección y refuerzo — puerto literal de
 * reinforcement_catalog.py (motor TIGA). Las categorías describen necesidades
 * OBSERVABLES, no diagnósticos ni categorías de NEE/discapacidad.
 *
 * Fijos y globales a propósito (no configurables por institución), igual que
 * el catálogo DUA/assessment-catalog ya existente — son un vocabulario común
 * de observación docente, no un parámetro institucional.
 */

export const DETECTION_SOURCES: Record<string, string> = {
  DIAGNOSTIC_ASSESSMENT: 'Evaluación diagnóstica',
  FORMATIVE_ASSESSMENT: 'Evaluación formativa',
  SUMMATIVE_ASSESSMENT: 'Evaluación sumativa',
  TEACHER_OBSERVATION: 'Observación docente',
  EVIDENCE_PRODUCT: 'Evidencia o producto',
  NOT_CONSOLIDATED: 'Aprendizaje no consolidado',
  OTHER: 'Otro',
}

export const PEDAGOGICAL_NEEDS: Record<string, string> = {
  UNDERSTANDING: 'Comprensión del aprendizaje trabajado',
  APPLICATION_PROCEDURE: 'Aplicación o procedimiento',
  REASONING_PROBLEM_SOLVING: 'Razonamiento y resolución de problemas',
  PRODUCTION_COMMUNICATION: 'Producción o comunicación',
  AUTONOMY: 'Autonomía',
  LEARNING_PACE: 'Ritmo de aprendizaje',
  PARTICIPATION: 'Participación',
  ACTIVITY_COMPLETION: 'Desarrollo/cumplimiento de actividades',
  OTHER: 'Otra necesidad pedagógica',
}

export const COMMUNICATION_MEDIA: Record<string, string> = {
  MEETING: 'Reunión',
  CALL: 'Llamada',
  INSTITUTIONAL_MESSAGE: 'Mensaje institucional',
  WRITTEN_COMMUNICATION: 'Comunicación escrita',
  OTHER: 'Otro',
}

export const COMMITMENT_TYPES: Record<string, string> = {
  ACTIVITY_SUPPORT: 'Acompañamiento en actividades',
  ATTENDANCE: 'Asistencia',
  HOME_PRACTICE: 'Práctica/refuerzo en casa',
  ACTIVITY_REVIEW: 'Revisión de actividades/tareas',
  OTHER: 'Otro',
}

/** código de necesidad -> [estrategia sugerida, actividad sugerida] */
export const NEED_PROPOSALS: Record<string, [string, string]> = {
  UNDERSTANDING: [
    'Explicación dialogada y modelado con ejemplos graduados',
    'Reconstruir el aprendizaje con un ejemplo guiado y explicarlo con palabras propias.',
  ],
  APPLICATION_PROCEDURE: [
    'Modelado paso a paso y práctica guiada con retiro gradual del apoyo',
    'Resolver una actividad equivalente siguiendo y justificando cada paso.',
  ],
  REASONING_PROBLEM_SOLVING: [
    'Preguntas de razonamiento y resolución cooperativa de situaciones',
    'Comparar estrategias, seleccionar una y justificar la solución obtenida.',
  ],
  PRODUCTION_COMMUNICATION: [
    'Producción por etapas con criterios visibles y retroalimentación',
    'Elaborar, revisar y presentar un producto breve alineado con los criterios.',
  ],
  AUTONOMY: [
    'Andamiaje con lista de pasos y autoevaluación',
    'Completar una tarea breve usando una guía y verificar el propio avance.',
  ],
  LEARNING_PACE: [
    'Práctica distribuida en segmentos breves con pausas de comprobación',
    'Realizar ejercicios graduados en sesiones breves y registrar avances.',
  ],
  PARTICIPATION: [
    'Participación estructurada con roles y turnos seguros',
    'Aportar en una actividad guiada y explicar una decisión del equipo.',
  ],
  ACTIVITY_COMPLETION: [
    'Organización de la tarea en metas cortas con verificación',
    'Completar una actividad pendiente por etapas y revisar el producto final.',
  ],
  OTHER: [
    'Estrategia pedagógica definida por el docente',
    'Desarrollar una actividad concreta acordada para atender la necesidad observada.',
  ],
}

/** Lanza si el código no existe en el catálogo dado; devuelve la etiqueta legible. */
export function catalogLabel(catalog: Record<string, string>, code: string): string {
  const label = catalog[code]
  if (label === undefined) throw new Error(`CATALOG_CODE_INVALID:${code}`)
  return label
}
