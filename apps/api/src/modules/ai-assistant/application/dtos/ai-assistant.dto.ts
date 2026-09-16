export interface DraftWeekDto {
  situationId: string
  /** Destrezas ya elegidas por el docente en el selector — lo único que debe seleccionar antes de pedir el borrador. */
  skillIds: string[]
  /** Nombre de la semana si el docente ya lo puso, para darle contexto a la IA. */
  weekName?: string
  /** Número de semana dentro del bloque — rota la estrategia/técnica del fallback determinista para que semanas consecutivas no salgan idénticas. */
  rotationSeed?: number
}

export interface DraftedSaber {
  id: string
  type: 'declarativo' | 'procedimental' | 'actitudinal'
  code: string
  description: string
}

export interface DraftWeekResult {
  competenciasEspecificas: string
  indicadoresEvaluacion: string
  /** Saberes NUEVOS que la IA propone (solo para destrezas sin saberes ya cargados) — se crean y se devuelven con id real. */
  newSabers: DraftedSaber[]
  /** IDs de saberes existentes que la IA decidió reusar (ya estaban en el banco). */
  reusedSaberIds: string[]
  momentos: {
    anticipacion: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
    construccionConocimiento: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
    consolidacion: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
  }
}

// ─── Proyecto interdisciplinario: generación completa desde un solo prompt ──

export interface DraftProjectDto {
  projectId: string
  /** Idea breve del docente (opcional) — si no la da, la IA la infiere del título del proyecto. */
  prompt?: string
}

export interface DraftedProjectContribution {
  contributionId: string
  contribucion: string
  responsabilidad: string
  /** Destrezas que la IA seleccionó del banco de ESA asignatura (ids reales) — solo si la contribución no tenía ninguna ya elegida. */
  skillIds: string[]
  /** Equivalente a skillIds para el modelo por competencias. */
  competencyIds: string[]
  newSabers: DraftedSaber[]
  reusedSaberIds: string[]
  weeks: {
    weekNumber: number
    weekProposito: string
    faseInicio: string
    faseDesarrollo: string
    faseCierre: string
    propositoPedagogico: string
    evidencias: string
  }[]
}

export interface DraftProjectResult {
  situacionReto: string
  contexto: string
  propositoComun: string
  productoFinal: string
  contributions: DraftedProjectContribution[]
}

// ─── Semana por COMPETENCIAS: motor en dos capas (IA validada + fallback determinista) ──

export interface DraftCompetencyWeekDto {
  situationId: string
  /** Competencias ya elegidas por el docente en el selector. */
  competencyIds: string[]
  weekName?: string
  /** Número de semana dentro del bloque — rota la estrategia/técnica del fallback determinista para que semanas consecutivas no salgan idénticas. */
  rotationSeed?: number
  /**
   * Número real de la semana (PlanningWeek.weekNumber) que se está generando —
   * usado para distribuir los saberes de la competencia entre las semanas del
   * bloque en vez de asignarlos TODOS a cada semana (imposible de cubrir en
   * una sola semana). Sin este dato se asume semana 1 de un bloque de 1.
   */
  weekNumber?: number
}

export interface DraftCompetencyWeekResult {
  indicadoresEvaluacion: string
  newSabers: DraftedSaber[]
  reusedSaberIds: string[]
  /** Formato CNC/TIGA: fases Inicio/Desarrollo/Cierre con N actividades numeradas (cada una con su propio código DUA), y recursos/evaluación consolidados UNA vez por semana — ver CompetencyWeekMomentos. */
  momentos: import('../../../../shared/domain/pedagogical-methodology').CompetencyWeekMomentos
  /** Transparencia con el docente: si vino de la IA validada o del motor de reglas de respaldo. */
  generationMode: 'AI_ENHANCED' | 'AI_FALLBACK'
  validationErrors: string[]
}
