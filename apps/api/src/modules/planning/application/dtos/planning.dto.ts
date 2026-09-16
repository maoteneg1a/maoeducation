export interface PlanningField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'checkbox' | 'date'
  required?: boolean
  options?: string[]
  placeholder?: string
}

export interface PlanningSection {
  title: string
  fields: PlanningField[]
}

export interface PlanningSchema {
  sections: PlanningSection[]
}

export type PlanningTemplateType = 'pca'
export type ApprovalStatus = 'borrador' | 'enviado' | 'aprobado'
// Pedido explícito del usuario: la Situación de Aprendizaje (Planificación
// Microcurricular semanal) YA NO tiene flujo de aprobación por terceros
// (director de área/subdirección) — solo el propio docente marca cuándo
// terminó. Transición libre en ambas direcciones: "listo" -> "borrador" si
// necesita seguir editando. Esto NO aplica a CurriculumPlan/PCA (ApprovalStatus
// arriba), que conserva su flujo de 2 pasos sin cambios.
export type SituationStatus = 'borrador' | 'listo'

export interface CreateTemplateDto {
  type: PlanningTemplateType
  name: string
  schema: PlanningSchema
}

export interface UpdateTemplateDto {
  name?: string
  schema?: PlanningSchema
  isDefault?: boolean
  isActive?: boolean
}

export interface CreatePlanDto {
  courseAssignmentId: string
  templateId?: string
  data?: Record<string, unknown>
}

export interface UpdatePlanDto {
  data?: Record<string, unknown>
}

// ─── Situación de aprendizaje (documento de Planificación Microcurricular) ──

export interface CreateSituationDto {
  planId: string
  academicPeriodId: string
  /**
   * Opcional: si no viene, se deriva de la competencia elegida (o del periodo).
   * En el modelo por competencias el docente no escribe nada — solo selecciona
   * periodo y competencia.
   */
  title?: string
  description?: string
  /** Opcional: si no vienen, se toman del periodo académico. */
  startDate?: string
  endDate?: string
  /** @deprecated sin UI que lo escriba — usa interdisciplinarySubjectIds. */
  interdisciplinaryAreaIds?: string[]
  /** Materias (Subject) del propio docente con las que hay conexión interdisciplinar — mínimo 2 para contar como tal. */
  interdisciplinarySubjectIds?: string[]
  /** Competencias del bloque, elegidas una sola vez al crear. */
  competencyIds?: string[]
}

export interface UpdateSituationDto {
  title?: string
  description?: string
  competencyIds?: string[]
  startDate?: string | null
  endDate?: string | null
  /** @deprecated sin UI que lo escriba — usa interdisciplinarySubjectIds. */
  interdisciplinaryAreaIds?: string[]
  interdisciplinarySubjectIds?: string[]
}

// ─── Semana (estructura fija, replica el formato oficial) ──────────────────

/** Modelo por DESTREZAS — sin cambios, un bloque de texto por fase (ANTICIPATION/CONSTRUCTION/CONSOLIDATION). */
export interface PlanningMoment {
  estrategiasDua?: string
  recursos?: string
  tecnica?: string
  instrumento?: string
}

export interface PlanningMomentos {
  anticipacion?: PlanningMoment
  construccionConocimiento?: PlanningMoment
  consolidacion?: PlanningMoment
}

/** Modelo por COMPETENCIAS — formato CNC/TIGA: N actividades numeradas por fase
 * (Inicio/Desarrollo/Cierre) con su propio código DUA cada una; recursos y
 * evaluación consolidados UNA vez por semana (no repetidos por fase). */
export interface CompetencyPlanningActivity {
  text: string
  duaCode: string
}
export interface CompetencyPlanningPhase {
  activities: CompetencyPlanningActivity[]
}
export interface CompetencyPlanningMomentos {
  fases: {
    inicio?: CompetencyPlanningPhase
    desarrollo?: CompetencyPlanningPhase
    cierre?: CompetencyPlanningPhase
  }
  recursos?: string[]
  recursoLink?: { title: string; url: string }
  evaluacion?: {
    evidencia?: string
    criterio?: string
    instrumento?: string
    instrumentoLink?: { title: string; url: string }
  }
}

/** momentos guarda uno de los 2 shapes según el planningModel de la institución al momento de crear la semana — nunca se mezclan en la misma semana. */
export type WeekMomentos = PlanningMomentos | CompetencyPlanningMomentos

export interface CreateWeekDto {
  situationId: string
  weekNumber: number
  name?: string
  startDate?: string
  endDate?: string
  competenciasEspecificas?: string
  indicadoresEvaluacion?: string
  skillIds?: string[]
  saberIds?: string[]
  competencyIds?: string[]
  competencyIndicatorIds?: string[]
  competencySaberIds?: string[]
  momentos?: WeekMomentos
}

export interface UpdateWeekDto {
  name?: string
  startDate?: string | null
  endDate?: string | null
  competenciasEspecificas?: string
  indicadoresEvaluacion?: string
  skillIds?: string[]
  saberIds?: string[]
  competencyIds?: string[]
  competencyIndicatorIds?: string[]
  competencySaberIds?: string[]
  momentos?: WeekMomentos
}
