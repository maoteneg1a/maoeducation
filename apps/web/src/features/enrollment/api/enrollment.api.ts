import { apiGet, apiPost, apiPatch } from '@/shared/lib/api-client'

export interface Enrollment {
  id: string
  status: string
  enrolledAt: string
  student: {
    id: string
    profile: { firstName: string; lastName: string; dni?: string }
  }
  parallel: { id: string; name: string; level: { id: string; name: string } }
  academicYear: { id: string; name: string; isActive: boolean }
  hasAdaptation?: boolean
  adaptationType?: 'temporal' | 'permanente' | null
  adaptationNotes?: string | null
}

export interface AcademicYear {
  id: string
  name: string
  isActive: boolean
}

export interface Parallel {
  id: string
  name: string
  level: { id: string; name: string }
  academicYear: { id: string; name: string; isActive: boolean }
  _count: { enrollments: number }
}

export interface StudentOption {
  id: string
  fullName: string
  email: string
  dni?: string | null
}

export function listEnrollments(params?: Record<string, string>) {
  return apiGet<Enrollment[]>('enrollments', params)
}

export function createEnrollment(data: { studentId: string; parallelId: string; academicYearId: string }) {
  return apiPost<Enrollment>('enrollments', data)
}

export function bulkEnroll(data: { studentIds: string[]; parallelId: string; academicYearId: string }) {
  return apiPost<{ created: number; skipped: number }>('enrollments/bulk', data)
}

export function updateEnrollmentStatus(id: string, status: string) {
  return apiPatch(`enrollments/${id}/status`, { status })
}

export function updateEnrollmentAdaptation(
  id: string,
  data: { hasAdaptation: boolean; adaptationType?: 'temporal' | 'permanente' | null; adaptationNotes?: string | null },
) {
  return apiPatch<Enrollment>(`enrollments/${id}/adaptation`, data)
}

export function getYears() {
  return apiGet<AcademicYear[]>('academic/years')
}

export function getParallels(yearId?: string) {
  return apiGet<Parallel[]>('academic/parallels', yearId ? { yearId } : undefined)
}

export function getStudents(search?: string) {
  // Endpoint propio de matrícula (accesible también al docente, no solo admin).
  return apiGet<StudentOption[]>('enrollments/students', search ? { search } : undefined)
}

export function createStudentEnrollment(data: {
  firstName: string
  lastName: string
  dni: string
  birthDate?: string
  parallelId: string
  academicYearId: string
}) {
  return apiPost<Enrollment>('enrollments/student', data)
}
