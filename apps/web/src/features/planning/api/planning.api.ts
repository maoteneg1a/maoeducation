import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'
import type { CurriculumSkill } from '@/features/curriculum/api/curriculum.api'
import type { Competency } from '@/features/competency-curriculum/api/competency-curriculum.api'

export type PlanningTemplateType = 'pca'
/**
 * @deprecated CurriculumPlan.status ya no tiene flujo de aprobación por
 * terceros (quedaba desconectado del estado real de sus LearningSituation
 * hijas y mostraba información contradictoria en la UI). El campo se
 * conserva en la respuesta del backend por histórico, pero no debe usarse
 * para gating de UI ni de negocio — ver PlanningListPage para el indicador
 * derivado de las situaciones reales.
 */
export type ApprovalStatus = 'borrador' | 'enviado' | 'aprobado'
/** Sin flujo de aprobación por terceros — solo el docente decide, transición libre en ambos sentidos. */
export type SituationStatus = 'borrador' | 'listo'

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
  /** @deprecated sin UI que lo escriba — usa interdisciplinarySubjectIds. */
  interdisciplinaryAreaIds: string[]
  /** Materias (Subject) del propio docente con las que hay conexión interdisciplinar — mínimo 2 para contar como tal. */
  interdisciplinarySubjectIds: string[]
  status: SituationStatus
  createdAt: string
  reviewedAt: string | null
  approvedAt: string | null
  academicPeriod?: { id: string; name: string }
  plan?: CurriculumPlan
  weeks?: PlanningWeek[]
  _count?: { weeks: number }
}

/** Modelo por DESTREZAS — un bloque de texto por fase (sin cambios). */
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
 * evaluación consolidados UNA vez por semana. */
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

/** El shape guardado depende del planningModel de la institución al crear la semana — nunca se mezclan. */
export type WeekMomentos = PlanningMomentos | CompetencyPlanningMomentos

/** Type guard — distingue el shape por competencias (tiene "fases") del de destrezas (tiene claves de fase directas). */
export function isCompetencyMomentos(m: WeekMomentos | undefined | null): m is CompetencyPlanningMomentos {
  return !!m && 'fases' in m
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
  momentos: WeekMomentos
  createdAt: string
}

// ─── Distribución de competencias/saberes por semana ──────────────────────

export interface DistributionSaber {
  id: string
  type: 'declarativo' | 'procedimental' | 'actitudinal'
  code: string
  description: string
}

export interface SuggestedWeekDistribution {
  weekNumber: number
  competencyId: string
  competencyCode: string
  competencyText: string
  saberIds: string[]
  sabers: DistributionSaber[]
}

export interface SuggestDistributionResult {
  weeks: SuggestedWeekDistribution[]
  calendarWeeks: number
  coverageWarning?: string
  weeksCountWarning?: string
}

export interface ConfirmDistributionWeekInput {
  weekNumber: number
  competencyId: string
  saberIds: string[]
}

export interface ConfirmDistributionResult {
  situation: LearningSituation
  weeks: PlanningWeek[]
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
    interdisciplinarySubjectIds?: string[]
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
      interdisciplinarySubjectIds: string[]
      competencyIds: string[]
    }>,
  ) => apiPut<LearningSituation>(`planning/situations/${id}`, data),

  /** Sin flujo de aprobación por terceros — el docente marca "listo" cuando termina. */
  markSituationReady: (id: string) => apiPost<LearningSituation>(`planning/situations/${id}/mark-ready`),

  /** El docente puede volver a "borrador" una situación ya marcada como lista. */
  reopenSituation: (id: string) => apiPost<LearningSituation>(`planning/situations/${id}/reopen`),

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
    momentos?: WeekMomentos
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
      momentos: WeekMomentos
    }>,
  ) => apiPut<PlanningWeek>(`planning/weeks/${id}`, data),

  deleteWeek: (id: string) => apiDelete(`planning/weeks/${id}`),

  /** Destrezas que ya están planificadas para este curso+periodo — lo único disponible para el resto del sistema. */
  listPlannedSkills: (courseAssignmentId: string, academicPeriodId: string) =>
    apiGet<CurriculumSkill[]>('planning/planned-skills', { courseAssignmentId, academicPeriodId }),

  /** Igual que listPlannedSkills pero para el modelo por competencias. */
  listPlannedCompetencies: (courseAssignmentId: string, academicPeriodId: string) =>
    apiGet<Competency[]>('planning/planned-competencies', { courseAssignmentId, academicPeriodId }),

  // Distribución de competencias/saberes por semana — reemplaza la elección
  // manual de situación: el docente elige periodo + N semanas, ve la
  // sugerencia, la edita si quiere, y confirma.
  suggestDistribution: (courseAssignmentId: string, academicPeriodId: string, data: { weeksCount: number }) =>
    apiPost<SuggestDistributionResult>(
      `planning/course-assignments/${courseAssignmentId}/periods/${academicPeriodId}/suggest-distribution`,
      data,
    ),

  confirmDistribution: (
    courseAssignmentId: string,
    academicPeriodId: string,
    data: { weeksCount: number; weeks: ConfirmDistributionWeekInput[] },
  ) =>
    apiPost<ConfirmDistributionResult>(
      `planning/course-assignments/${courseAssignmentId}/periods/${academicPeriodId}/confirm-distribution`,
      data,
    ),
}
