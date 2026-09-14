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
export type SituationStatus = 'borrador' | 'enviado' | 'revisado' | 'aprobado'

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
  title: string
  description?: string
  interdisciplinaryAreaIds?: string[]
}

export interface UpdateSituationDto {
  title?: string
  description?: string
  interdisciplinaryAreaIds?: string[]
}

// ─── Semana (estructura fija, replica el formato oficial) ──────────────────

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
  momentos?: PlanningMomentos
}

export interface UpdateWeekDto {
  name?: string
  startDate?: string | null
  endDate?: string | null
  competenciasEspecificas?: string
  indicadoresEvaluacion?: string
  skillIds?: string[]
  saberIds?: string[]
  momentos?: PlanningMomentos
}
