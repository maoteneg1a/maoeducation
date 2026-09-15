import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/shared/lib/api-client'

// ---- Interfaces ----

export interface ActivityType {
  id: string
  name: string
  code: string
  isActive: boolean
  sortOrder: number
}

export interface Insumo {
  id: string
  name: string
  sortOrder: number
  weight: number
  courseAssignmentId: string
  academicPeriodId: string
}

export interface Activity {
  id: string
  name: string
  description?: string
  maxScore: number
  activityDate: string
  isPublished: boolean
  activityTypeId: string
  activityTypeName?: string
  insumoId?: string
  taskId?: string
  courseAssignmentId: string
  academicPeriodId: string
  /** Destreza del banco curricular vinculada a esta actividad — habilita el refuerzo automático por destreza. */
  curriculumSkillId?: string | null
  curriculumSkill?: { id: string; code: string; description: string } | null
  /** Equivalente a curriculumSkillId para el modelo por competencias. */
  competencyId?: string | null
  competency?: { id: string; code: string; text: string } | null
}

export type GradeStatus = 'entregado' | 'no_realizado' | 'atrasado' | 'excusado'

export interface StudentGrade {
  studentId: string
  studentName: string
  activityId: string
  score: number | null
  status: GradeStatus
  isExcused: boolean
}

interface GradeApiRow {
  student: { id: string; profile: { firstName: string; lastName: string } }
  enrollmentStatus: string
  grade: { id: string; score: number | null; status?: string | null; notes?: string | null } | null
}

export interface GradeInput {
  studentId: string
  activityId: string
  score: number | null
  status?: GradeStatus
  notes?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StudentGradesSummary = any

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GradesSummary = any

// ---- API ----

export const activitiesApi = {
  // Activity types
  getTypes: () => apiGet<ActivityType[]>('activity-types'),
  createType: (data: Omit<ActivityType, 'id'>) => apiPost<ActivityType>('activity-types', data),
  updateType: (id: string, data: Partial<Omit<ActivityType, 'id'>>) =>
    apiPut<ActivityType>(`activity-types/${id}`, data),
  toggleType: (id: string) => apiPatch<ActivityType>(`activity-types/${id}/toggle`),

  // Insumos
  getInsumos: (courseAssignmentId: string, periodId: string) =>
    apiGet<Insumo[]>('insumos', { courseAssignmentId, periodId }),
  createInsumo: (data: Omit<Insumo, 'id'>) => apiPost<Insumo>('insumos', data),
  updateInsumo: (id: string, data: Partial<Omit<Insumo, 'id'>>) =>
    apiPut<Insumo>(`insumos/${id}`, data),
  deleteInsumo: (id: string) => apiDelete(`insumos/${id}`),
  getParallelTemplate: (parallelId: string, academicYearId: string, periodId: string) =>
    apiGet<Array<{ name: string; weight: number | null; sortOrder: number }>>('insumos/parallel-template', { parallelId, academicYearId, periodId }),
  setupParallelInsumos: (data: {
    parallelId: string
    academicYearId: string
    periodId: string
    insumos: Array<{ name: string; weight?: number; sortOrder: number }>
  }) => apiPost<{ message: string; assignments: number }>('insumos/parallel-setup', data),

  // Activities
  getActivities: (params: {
    courseAssignmentId: string
    periodId: string
    insumoId?: string
  }) => apiGet<Activity[]>('activities', params),

  createActivity: (data: Omit<Activity, 'id' | 'isPublished' | 'activityTypeName'>) =>
    apiPost<Activity>('activities', data),
  updateActivity: (id: string, data: Partial<Omit<Activity, 'id' | 'activityTypeName'>>) =>
    apiPut<Activity>(`activities/${id}`, data),
  publishActivity: (id: string) => apiPatch<Activity>(`activities/${id}/publish`),
  assignInsumo: (id: string, insumoId: string) =>
    apiPatch<Activity>(`activities/${id}/insumo`, { insumoId }),
  deleteActivity: (id: string) => apiDelete(`activities/${id}`),

  // Grades
  getGradesByActivity: (activityId: string) =>
    apiGet<GradeApiRow[]>('grades', { activityId }).then((rows) =>
      rows.map((r): StudentGrade => ({
        studentId: r.student.id,
        studentName: `${r.student.profile.firstName} ${r.student.profile.lastName}`,
        activityId,
        score: r.grade?.score ?? null,
        status: (r.grade?.status as GradeStatus) ?? 'entregado',
        isExcused: false,
      })),
    ),
  bulkSaveGrades: (grades: GradeInput[]) => apiPut<void>('grades/bulk', { grades }),
  getStudentGrades: (studentId: string, params?: object) =>
    apiGet<StudentGradesSummary>(`grades/student/${studentId}`, params as Record<string, string>),
  getGradesSummary: (courseAssignmentId: string, periodId: string) =>
    apiGet<GradesSummary>('grades/summary', { courseAssignmentId, periodId }),
}
