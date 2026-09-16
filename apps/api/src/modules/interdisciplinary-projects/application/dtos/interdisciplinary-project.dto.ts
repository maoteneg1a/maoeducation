export type InterdisciplinaryProjectStatus = 'borrador' | 'enviado' | 'aprobado'

export interface CreateInterdisciplinaryProjectDto {
  parallelId: string
  academicPeriodId: string
  title: string
  situacionReto?: string
  contexto?: string
  propositoComun?: string
  productoFinal?: string
  weeksCount: number
}

export interface UpdateInterdisciplinaryProjectDto {
  title?: string
  situacionReto?: string
  contexto?: string
  propositoComun?: string
  productoFinal?: string
  weeksCount?: number
  status?: InterdisciplinaryProjectStatus
}

export interface ListInterdisciplinaryProjectsQuery {
  parallelId: string
  academicPeriodId: string
}

// ─── Contribución (aporte disciplinar de una asignatura) ───────────────────

export interface JoinProjectDto {
  courseAssignmentId: string
}

export interface UpdateContributionDto {
  contribucion?: string
  responsabilidad?: string
  skillIds?: string[]
  saberIds?: string[]
  competencyIds?: string[]
  competencySaberIds?: string[]
}

// ─── Entrada de semana (integración por hitos) ─────────────────────────────

export interface UpsertWeekEntryDto {
  weekNumber: number
  weekProposito?: string
  faseInicio?: string
  faseDesarrollo?: string
  faseCierre?: string
  propositoPedagogico?: string
  evidencias?: string
}

// ─── Generación casi automática desde una Situación de Aprendizaje ─────────

/** El docente solo indica desde qué situación de aprendizaje partir — todo lo demás lo infiere la IA. */
export interface DraftInterdisciplinaryProjectDto {
  situationId: string
}
