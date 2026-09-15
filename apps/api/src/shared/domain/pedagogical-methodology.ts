/**
 * Motor determinista de metodología/evaluación — SIEMPRE disponible (sin IA),
 * fuente de verdad y fallback del generador con IA (ver competency-pedagogical-
 * generator.service.ts). Compone texto seleccionando de catálogos reales
 * (DUA, técnicas/instrumentos de evaluación) en vez de escribir desde cero;
 * el resultado es plantillado pero siempre coherente y disponible.
 */

export type PedagogicalPhase = 'ANTICIPATION' | 'CONSTRUCTION' | 'CONSOLIDATION'
export const PHASES: PedagogicalPhase[] = ['ANTICIPATION', 'CONSTRUCTION', 'CONSOLIDATION']

export interface DuaStrategyInput {
  id: string
  text: string
  compatiblePhases: string[]
  checkpointOperationalCode: string
}

export interface AssessmentCatalogInput {
  techniques: { code: string; label: string; compatibleInstrumentCodes: string[] }[]
  instruments: { code: string; label: string }[]
}

export interface MomentoDeterministico {
  estrategiasDua: string
  recursos: string
  tecnica: string
  instrumento: string
}

export interface DeterministicMethodologyResult {
  momentos: Record<'anticipacion' | 'construccionConocimiento' | 'consolidacion', MomentoDeterministico>
  tecnicaEvaluacion: string
  instrumentoEvaluacion: string
}

const PHASE_KEY: Record<PedagogicalPhase, keyof DeterministicMethodologyResult['momentos']> = {
  ANTICIPATION: 'anticipacion',
  CONSTRUCTION: 'construccionConocimiento',
  CONSOLIDATION: 'consolidacion',
}

const GENERIC_RESOURCES = ['pizarra', 'cuaderno', 'material del aula']

/**
 * Elige, de forma determinista (sin IA), una estrategia DUA compatible con
 * cada fase y una técnica/instrumento de evaluación válido. Nunca falla: si
 * no hay estrategia compatible con una fase específica, usa la primera
 * disponible del catálogo completo.
 */
export function buildDeterministicMethodology(
  duaStrategies: DuaStrategyInput[],
  assessmentCatalog: AssessmentCatalogInput,
): DeterministicMethodologyResult {
  const momentos = {} as DeterministicMethodologyResult['momentos']

  for (const phase of PHASES) {
    const compatible = duaStrategies.filter((s) => s.compatiblePhases.includes(phase))
    const pick = compatible[0] ?? duaStrategies[0]
    const key = PHASE_KEY[phase]
    momentos[key] = {
      estrategiasDua: pick
        ? `[${pick.checkpointOperationalCode}] ${pick.text}`
        : 'Sin estrategia DUA disponible en el catálogo — el docente debe redactarla.',
      recursos: GENERIC_RESOURCES.join(', '),
      tecnica: '',
      instrumento: '',
    }
  }

  const technique = assessmentCatalog.techniques[0]
  const instrumentCode = technique?.compatibleInstrumentCodes[0]
  const instrument = assessmentCatalog.instruments.find((i) => i.code === instrumentCode) ?? assessmentCatalog.instruments[0]

  // La técnica/instrumento de evaluación se refleja también en el momento de Consolidación
  // (donde ocurre la evaluación formal), consistente con el formato de PUD.
  momentos.consolidacion.tecnica = technique?.label ?? ''
  momentos.consolidacion.instrumento = instrument?.label ?? ''

  return {
    momentos,
    tecnicaEvaluacion: technique?.label ?? '',
    instrumentoEvaluacion: instrument?.label ?? '',
  }
}
