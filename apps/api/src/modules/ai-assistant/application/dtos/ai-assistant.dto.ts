export interface DraftWeekDto {
  situationId: string
  /** Destrezas ya elegidas por el docente en el selector — lo único que debe seleccionar antes de pedir el borrador. */
  skillIds: string[]
  /** Nombre de la semana si el docente ya lo puso, para darle contexto a la IA. */
  weekName?: string
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
