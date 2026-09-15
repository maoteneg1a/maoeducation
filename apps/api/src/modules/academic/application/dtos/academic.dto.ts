export interface CreateLevelDto {
  name: string
  order?: number
  description?: string
}

export interface UpdateLevelDto {
  name?: string
  order?: number
  description?: string
  attendanceMode?: 'per_subject' | 'daily'
}

export interface CreateSubjectDto {
  name: string
  code?: string
  description?: string
  color?: string
  isQualitative?: boolean
  curriculumAreaId?: string | null
  competencyAreaId?: string | null
}

export interface UpdateSubjectDto {
  name?: string
  code?: string
  description?: string
  color?: string
  isQualitative?: boolean
  curriculumAreaId?: string | null
  competencyAreaId?: string | null
}

export interface CreateAcademicYearDto {
  name: string
  startDate: string
  endDate: string
}

export interface CreateAcademicPeriodDto {
  name: string
  order: number
  startDate: string
  endDate: string
  schemeId?: string
}

export interface UpdateAcademicPeriodDto {
  name?: string
  order?: number
  startDate?: string
  endDate?: string
}

export interface CreateParallelDto {
  name: string
  levelId: string
  academicYearId: string
  capacity?: number
  tutorId?: string
}

export interface UpdateParallelDto {
  name?: string
  levelId?: string
  capacity?: number
  tutorId?: string | null
}

export interface CreateCourseAssignmentDto {
  parallelId: string
  subjectId: string
  teacherId: string
  academicYearId: string
  hoursPerWeek?: number
}

export interface ListQueryDto {
  page?: number
  limit?: number
  search?: string
}
