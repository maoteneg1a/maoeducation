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
 *
 * `rotationSeed` (típicamente el número de semana o índice del intento) hace
 * que semanas consecutivas del mismo bloque roten de estrategia/técnica en
 * vez de repetir siempre la primera del catálogo — sin este parámetro, cada
 * semana que cae al fallback (por timeout o error de la IA) se veía idéntica.
 */
export function buildDeterministicMethodology(
  duaStrategies: DuaStrategyInput[],
  assessmentCatalog: AssessmentCatalogInput,
  rotationSeed = 0,
): DeterministicMethodologyResult {
  const momentos = {} as DeterministicMethodologyResult['momentos']

  for (const phase of PHASES) {
    const compatible = duaStrategies.filter((s) => s.compatiblePhases.includes(phase))
    const pool = compatible.length ? compatible : duaStrategies
    const pick = pool.length ? pool[rotationSeed % pool.length] : undefined
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

  const technique = assessmentCatalog.techniques.length
    ? assessmentCatalog.techniques[rotationSeed % assessmentCatalog.techniques.length]
    : undefined
  const instrumentCode = technique?.compatibleInstrumentCodes[rotationSeed % Math.max(technique?.compatibleInstrumentCodes.length ?? 1, 1)]
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

// ─── Motor determinista — modelo por COMPETENCIAS (formato CNC/TIGA: fases
// "Inicio/Desarrollo/Cierre" con N actividades numeradas y su propio código
// DUA cada una, dentro de UNA sola tabla semanal de 3 columnas — Recursos y
// Evaluación consolidados una vez por semana, NO repetidos por fase) ───────
//
// Deliberadamente una función SEPARADA de `buildDeterministicMethodology`
// (que sigue intacta y en uso por el modelo de destrezas, con su forma de
// datos anterior: un solo bloque de texto `estrategiasDua` por fase) — así
// el cambio de forma de datos pedido para competencias no arriesga romper
// el flujo de destrezas.

export interface CompetencyActivityItem {
  text: string
  duaCode: string
}

export interface CompetencyPhaseBlock {
  activities: CompetencyActivityItem[]
}

/** Claves de fase para el modelo por competencias — ya en español final (Inicio/Desarrollo/Cierre), sin necesidad de tabla de labels aparte como en destrezas. */
export type CompetencyPhaseKey = 'inicio' | 'desarrollo' | 'cierre'
export const COMPETENCY_PHASE_KEYS: CompetencyPhaseKey[] = ['inicio', 'desarrollo', 'cierre']

export interface CompetencyWeekMomentos {
  fases: Record<CompetencyPhaseKey, CompetencyPhaseBlock>
  recursos: string[]
  recursoLink?: { title: string; url: string }
  evaluacion: {
    evidencia: string
    criterio: string
    instrumento: string
    instrumentoLink?: { title: string; url: string }
  }
}

export interface PhaseActivityCounts {
  anticipation: number
  construction: number
  consolidation: number
}

const PHASE_COUNT_KEY: Record<PedagogicalPhase, keyof PhaseActivityCounts> = {
  ANTICIPATION: 'anticipation',
  CONSTRUCTION: 'construction',
  CONSOLIDATION: 'consolidation',
}

const PHASE_TO_COMPETENCY_KEY: Record<PedagogicalPhase, CompetencyPhaseKey> = {
  ANTICIPATION: 'inicio',
  CONSTRUCTION: 'desarrollo',
  CONSOLIDATION: 'cierre',
}

/**
 * Igual espíritu que `buildDeterministicMethodology` pero produce la
 * estructura semanal completa del modelo por competencias: N actividades
 * numeradas por fase (según `phaseCounts`, calcado de la densidad por carga
 * horaria) — cada una con su propio código DUA individual — más recursos y
 * evaluación consolidados UNA vez para toda la semana (nunca repetidos por
 * fase). Si el catálogo tiene menos estrategias compatibles que actividades
 * pedidas, rota/repite las disponibles (nunca falla).
 */
export function buildDeterministicCompetencyMethodology(
  duaStrategies: DuaStrategyInput[],
  assessmentCatalog: AssessmentCatalogInput,
  phaseCounts: PhaseActivityCounts,
  rotationSeed = 0,
): CompetencyWeekMomentos {
  const fases = {} as CompetencyWeekMomentos['fases']

  for (const phase of PHASES) {
    const compatible = duaStrategies.filter((s) => s.compatiblePhases.includes(phase))
    const pool = compatible.length ? compatible : duaStrategies
    const count = Math.max(1, phaseCounts[PHASE_COUNT_KEY[phase]] ?? 1)
    const activities: CompetencyActivityItem[] = []
    for (let i = 0; i < count; i++) {
      const pick = pool.length ? pool[(rotationSeed + i) % pool.length] : undefined
      activities.push(
        pick
          ? { text: pick.text, duaCode: pick.checkpointOperationalCode }
          : { text: 'Sin estrategia DUA disponible en el catálogo — el docente debe redactarla.', duaCode: '' },
      )
    }
    fases[PHASE_TO_COMPETENCY_KEY[phase]] = { activities }
  }

  const technique = assessmentCatalog.techniques.length
    ? assessmentCatalog.techniques[rotationSeed % assessmentCatalog.techniques.length]
    : undefined
  const instrumentCode = technique?.compatibleInstrumentCodes[rotationSeed % Math.max(technique?.compatibleInstrumentCodes.length ?? 1, 1)]
  const instrument = assessmentCatalog.instruments.find((i) => i.code === instrumentCode) ?? assessmentCatalog.instruments[0]

  return {
    fases,
    recursos: GENERIC_RESOURCES,
    evaluacion: {
      evidencia: 'Producto o desempeño verificable de la semana — el docente debe redactarlo con el detalle observado en clase.',
      criterio: '',
      instrumento: instrument?.label ?? '',
    },
  }
}

// ─── Colores del highlight DUA por principio — calcados EXACTAMENTE de la
// app de referencia TIGA (dua_visual.py: DUA_PRINCIPLE_I_COLOR/II/III), con
// la que existe un acuerdo explícito de reutilización de formato. Un código
// DUA tiene forma "I.3.1" / "II.6.3" / "III.8.4" — el número romano antes del
// primer punto identifica el principio (I=Representación, II=Acción y
// Expresión, III=Motivación/Compromiso) y determina el color de fondo del
// badge en el PDF, sin importar el checkpoint específico dentro del principio. ──
export const DUA_PRINCIPLE_COLORS: Record<'I' | 'II' | 'III', string> = {
  I: '#A9D18E', // verde — Representación
  II: '#9DC3E6', // azul — Acción y Expresión
  III: '#E78AC3', // rosado — Motivación y Compromiso
}
export const DUA_UNKNOWN_COLOR = '#D9D9D9'

/** Extrae el número romano de principio (I/II/III) de un código DUA tipo "I.3.1" — o null si no calza el patrón. */
export function getDuaPrinciple(code: string | undefined | null): 'I' | 'II' | 'III' | null {
  const value = (code ?? '').trim()
  const match = /^(I|II|III)\.\d+\.\d+$/.exec(value)
  return (match?.[1] as 'I' | 'II' | 'III' | undefined) ?? null
}

/** Color de fondo del badge DUA para un código — mismo color para todo el principio, calcado de TIGA. */
export function getDuaColor(code: string | undefined | null): string {
  const principle = getDuaPrinciple(code)
  return principle ? DUA_PRINCIPLE_COLORS[principle] : DUA_UNKNOWN_COLOR
}
