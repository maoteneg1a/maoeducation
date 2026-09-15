import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'
import type { CurriculumSkill } from '@/features/curriculum/api/curriculum.api'
import type { Competency } from '@/features/competency-curriculum/api/competency-curriculum.api'

export type PlanningTemplateType = 'pca'
export type ApprovalStatus = 'borrador' | 'enviado' | 'aprobado'
export type SituationStatus = 'borrador' | 'enviado' | 'revisado' | 'aprobado'

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

export interface PlanningTemplate {
  id: string
  type: PlanningTemplateType
  name: string
  isDefault: boolean
  isActive: boolean
  schema: PlanningSchema
}

export interface CurriculumPlan {
  id: string
  courseAssignmentId: string
  templateId: string
  status: ApprovalStatus
  data: Record<string, unknown>
  createdAt: string
  approvedAt: string | null
  courseAssignment?: {
    id: string
    academicYearId: string
    subject: { id: string; name: string }
    parallel: { id: string; name: string; level: { id: string; name: string; subnivel: string | null } }
  }
  template?: PlanningTemplate
  situations?: LearningSituation[]
  _count?: { situations: number }
}

export interface LearningSituation {
  id: string
  planId: string
  academicPeriodId: string
  title: string
  description: string | null
  /** Competencias del bloque, elegidas al crear la situación. */
  competencyIds: string[]
  startDate: string | null
  endDate: string | null
  interdisciplinaryAreaIds: string[]
  status: SituationStatus
  createdAt: string
  reviewedAt: string | null
  approvedAt: string | null
  academicPeriod?: { id: string; name: string }
  plan?: CurriculumPlan
  weeks?: PlanningWeek[]
  _count?: { weeks: number }
}

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

export interface PlanningWeek {
  id: string
  situationId: string
  weekNumber: number
  name: string | null
  startDate: string | null
  endDate: string | null
  competenciasEspecificas: string | null
  indicadoresEvaluacion: string | null
  skillIds: string[]
  saberIds: string[]
  competencyIds: string[]
  competencyIndicatorIds: string[]
  competencySaberIds: string[]
  momentos: PlanningMomentos
  createdAt: string
}

export const planningApi = {
  // Plantillas (PCA)
  listTemplates: (type?: PlanningTemplateType) =>
    apiGet<PlanningTemplate[]>('planning/templates', type ? { type } : undefined),

  // PCA
  listPlans: (courseAssignmentIds?: string[]) =>
    apiGet<CurriculumPlan[]>(
      'planning/plans',
      courseAssignmentIds?.length ? { courseAssignmentIds: courseAssignmentIds.join(',') } : undefined,
    ),

  getPlan: (id: string) => apiGet<CurriculumPlan>(`planning/plans/${id}`),

  createPlan: (data: { courseAssignmentId: string; templateId?: string; data?: Record<string, unknown> }) =>
    apiPost<CurriculumPlan>('planning/plans', data),

  updatePlan: (id: string, data: { data: Record<string, unknown> }) =>
    apiPut<CurriculumPlan>(`planning/plans/${id}`, data),

  submitPlan: (id: string) => apiPost<CurriculumPlan>(`planning/plans/${id}/submit`),

  approvePlan: (id: string) => apiPost<CurriculumPlan>(`planning/plans/${id}/approve`),

  // Situaciones de aprendizaje
  listSituations: (planId: string) => apiGet<LearningSituation[]>(`planning/plans/${planId}/situations`),

  getSituation: (id: string) => apiGet<LearningSituation>(`planning/situations/${id}`),

  createSituation: (data: {
    planId: string
    academicPeriodId: string
    /** Si se omite, el backend lo deriva de la competencia (o del periodo). */
    title?: string
    description?: string
    /** Si se omiten, el backend toma las del periodo académico. */
    startDate?: string
    endDate?: string
    interdisciplinaryAreaIds?: string[]
    competencyIds?: string[]
  }) => apiPost<LearningSituation>('planning/situations', data),

  updateSituation: (
    id: string,
    data: Partial<{
      title: string
      description: string
      startDate: string | null
      endDate: string | null
      interdisciplinaryAreaIds: string[]
      competencyIds: string[]
    }>,
  ) => apiPut<LearningSituation>(`planning/situations/${id}`, data),

  submitSituation: (id: string) => apiPost<LearningSituation>(`planning/situations/${id}/submit`),

  reviewSituation: (id: string) => apiPost<LearningSituation>(`planning/situations/${id}/review`),

  approveSituation: (id: string) => apiPost<LearningSituation>(`planning/situations/${id}/approve`),

  deleteSituation: (id: string) => apiDelete(`planning/situations/${id}`),

  // Semanas
  listWeeks: (situationId: string) => apiGet<PlanningWeek[]>(`planning/situations/${situationId}/weeks`),

  getWeek: (id: string) => apiGet<PlanningWeek>(`planning/weeks/${id}`),

  createWeek: (data: {
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
    momentos?: PlanningMomentos
  }) => apiPost<PlanningWeek>('planning/weeks', data),

  updateWeek: (
    id: string,
    data: Partial<{
      name: string
      startDate: string | null
      endDate: string | null
      competenciasEspecificas: string
      indicadoresEvaluacion: string
      skillIds: string[]
      saberIds: string[]
      competencyIds: string[]
      competencyIndicatorIds: string[]
      competencySaberIds: string[]
      momentos: PlanningMomentos
    }>,
  ) => apiPut<PlanningWeek>(`planning/weeks/${id}`, data),

  deleteWeek: (id: string) => apiDelete(`planning/weeks/${id}`),

  /** Destrezas que ya están planificadas para este curso+periodo — lo único disponible para el resto del sistema. */
  listPlannedSkills: (courseAssignmentId: string, academicPeriodId: string) =>
    apiGet<CurriculumSkill[]>('planning/planned-skills', { courseAssignmentId, academicPeriodId }),

  /** Igual que listPlannedSkills pero para el modelo por competencias. */
  listPlannedCompetencies: (courseAssignmentId: string, academicPeriodId: string) =>
    apiGet<Competency[]>('planning/planned-competencies', { courseAssignmentId, academicPeriodId }),

}
