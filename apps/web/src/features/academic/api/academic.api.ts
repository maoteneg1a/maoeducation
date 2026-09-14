import { apiGet, apiPost, apiPut, apiPatch, apiDelete } from '@/shared/lib/api-client'

// ---- Interfaces ----

export interface Level {
  id: string
  name: string
  code: string
  sortOrder: number
  isActive: boolean
  /** "per_subject" (asistencia por materia) | "daily" (asistencia diaria por paralelo) */
  attendanceMode?: 'per_subject' | 'daily'
  /** Subnivel MINEDUC del banco curricular: preparatoria | elemental | media | superior | bgu */
  subnivel?: string | null
}

export interface Subject {
  id: string
  name: string
  code: string
  isActive: boolean
  isQualitative?: boolean
  curriculumAreaId?: string | null
}

export interface AcademicYear {
  id: string
  name: string
  startDate: string
  endDate: string
  isActive: boolean
}

export interface AcademicPeriod {
  id: string
  name: string
  periodNumber: number
  startDate: string
  endDate: string
  isActive: boolean
  isClosed: boolean
  schemeId: string
}

export interface Parallel {
  id: string
  name: string
  levelId: string
  academicYearId: string
  tutorId?: string | null
  capacity?: number
  isActive: boolean
  level?: { id: string; name: string; sortOrder: number }
  tutor?: { id: string; profile: { firstName: string; lastName: string } } | null
  _count?: { enrollments: number; courseAssignments: number }
}

export interface CourseAssignment {
  id: string
  teacherId: string
  teacherName?: string
  subjectId: string
  subjectName?: string
  parallelId: string
  parallelName?: string
  academicYearId: string
  isActive: boolean
  subject?: { id: string; name: string }
  parallel?: { id: string; name: string; level: { name: string; subnivel?: string | null } }
  teacher?: { id: string; profile: { firstName: string; lastName: string } }
  academicYear?: { id: string; name: string; isActive: boolean }
}

export interface AcademicPeriodScheme {
  id: string
  name: string
  code: string
  periodsCount: number
  isDefault: boolean
}

// ---- API ----

export const academicApi = {
  // Levels
  getLevels: () => apiGet<Level[]>('academic/levels'),
  createLevel: (data: Omit<Level, 'id' | 'isActive'>) => apiPost<Level>('academic/levels', data),
  updateLevel: (id: string, data: Partial<Omit<Level, 'id'>>) =>
    apiPut<Level>(`academic/levels/${id}`, data),
  toggleLevel: (id: string) => apiPatch<Level>(`academic/levels/${id}/toggle`),

  // Subjects
  getSubjects: () => apiGet<Subject[]>('academic/subjects'),
  createSubject: (data: Omit<Subject, 'id' | 'isActive'>) =>
    apiPost<Subject>('academic/subjects', data),
  updateSubject: (id: string, data: Partial<Omit<Subject, 'id'>>) =>
    apiPut<Subject>(`academic/subjects/${id}`, data),

  // Academic Years
  getYears: () => apiGet<AcademicYear[]>('academic/years'),
  createYear: (data: Omit<AcademicYear, 'id' | 'isActive'>) =>
    apiPost<AcademicYear>('academic/years', data),
  activateYear: (id: string) => apiPatch<AcademicYear>(`academic/years/${id}/activate`),

  // Periods
  getPeriods: (yearId: string) =>
    apiGet<AcademicPeriod[]>(`academic/years/${yearId}/periods`),
  createPeriod: (yearId: string, data: { name: string; order: number; startDate: string; endDate: string; schemeId?: string }) =>
    apiPost<AcademicPeriod>(`academic/years/${yearId}/periods`, data),
  updatePeriod: (periodId: string, data: Partial<{ name: string; order: number; startDate: string; endDate: string }>) =>
    apiPut<AcademicPeriod>(`academic/periods/${periodId}`, data),
  activatePeriod: (periodId: string) =>
    apiPatch<AcademicPeriod>(`academic/periods/${periodId}/activate`),
  setPeriodClosure: (periodId: string, isClosed: boolean) =>
    apiPatch<AcademicPeriod>(`academic/periods/${periodId}/closure`, { isClosed }),

  // Parallels
  getParallels: (yearId?: string) =>
    apiGet<Parallel[]>('academic/parallels', yearId ? { yearId } : undefined),
  createParallel: (data: Omit<Parallel, 'id' | 'isActive' | 'levelName'>) =>
    apiPost<Parallel>('academic/parallels', data),
  updateParallel: (id: string, data: Partial<Omit<Parallel, 'id' | 'levelName'>>) =>
    apiPut<Parallel>(`academic/parallels/${id}`, data),

  // Course Assignments
  getAssignments: (params?: Record<string, string>) =>
    apiGet<CourseAssignment[]>('academic/course-assignments', params),
  createAssignment: (data: Omit<CourseAssignment, 'id' | 'isActive' | 'teacherName' | 'subjectName' | 'parallelName'>) =>
    apiPost<CourseAssignment>('academic/course-assignments', data),
  deleteAssignment: (id: string) => apiDelete(`academic/course-assignments/${id}`),
  updateExamWeight: (id: string, examWeight: number) =>
    apiPatch<{ id: string; examWeight: number }>(`academic/course-assignments/${id}/exam-weight`, { examWeight }),
  getMyAssignments: (params?: Record<string, string>) =>
    apiGet<{ assignments: CourseAssignment[]; periods: AcademicPeriod[] }>('academic/my-course-assignments', params),

  // Period Schemes
  getSchemes: () => apiGet<AcademicPeriodScheme[]>('academic/period-schemes'),
}
