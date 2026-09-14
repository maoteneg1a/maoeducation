export interface CreateActivityTypeDto {
  name: string
  color?: string
  description?: string
}

export interface UpdateActivityTypeDto {
  name?: string
  color?: string
  description?: string
}

export interface CreateInsumoDto {
  name: string
  description?: string
  courseAssignmentId: string
  academicPeriodId: string
  weight?: number
  order?: number
}

export interface UpdateInsumoDto {
  name?: string
  description?: string
  weight?: number
  order?: number
}

export interface CreateActivityDto {
  courseAssignmentId: string
  academicPeriodId: string
  activityTypeId: string
  insumoId?: string
  taskId?: string
  curriculumSkillId?: string
  name: string
  description?: string
  maxScore: number
  activityDate?: string
  metadata?: Record<string, unknown>
}

export interface UpdateActivityDto {
  name?: string
  description?: string
  maxScore?: number
  activityDate?: string
  insumoId?: string | null
  curriculumSkillId?: string | null
  metadata?: Record<string, unknown>
}

export interface BulkGradeDto {
  grades: Array<{
    studentId: string
    activityId: string
    score: number | null
    status?: string
    notes?: string
  }>
}

export interface ListActivitiesQueryDto {
  courseAssignmentId: string
  periodId: string
  insumoId?: string
}
