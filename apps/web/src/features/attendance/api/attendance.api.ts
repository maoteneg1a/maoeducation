import { apiGet, apiPatch, apiPost } from '@/shared/lib/api-client'

export interface AttendanceStudent {
  id: string
  profile: { firstName: string; lastName: string; dni?: string }
}

export interface AttendanceRecord {
  id: string
  status: 'present' | 'absent' | 'late' | 'excused'
  notes?: string
}

export interface AttendanceEntry {
  student: AttendanceStudent
  record: AttendanceRecord | null
  dailyRecord?: AttendanceRecord | null
}

export interface CourseAssignment {
  id: string
  subject: { id: string; name: string }
  parallel: {
    id: string
    name: string
    tutorId?: string | null
    level: { id?: string; name: string; attendanceMode?: 'per_subject' | 'daily' }
  }
  academicYear: { id: string; name: string; isActive: boolean }
  teacher: { id: string; profile: { firstName: string; lastName: string } }
}

export function getAttendance(courseAssignmentId: string, date: string) {
  return apiGet<AttendanceEntry[]>('attendance', { courseAssignmentId, date })
}

export function bulkSaveAttendance(payload: {
  courseAssignmentId: string
  date: string
  records: Array<{ studentId: string; status: string; notes?: string }>
}) {
  return apiPost('attendance/bulk', payload)
}

/** Asistencia diaria por paralelo (niveles con attendanceMode = "daily"). */
export function getDailyAttendance(parallelId: string, date: string) {
  return apiGet<AttendanceEntry[]>('attendance', { parallelId, date })
}

export function bulkSaveDailyAttendance(payload: {
  parallelId: string
  date: string
  records: Array<{ studentId: string; status: string; notes?: string }>
}) {
  return apiPost('attendance/bulk', payload)
}

export function getAssignments(params?: Record<string, string>) {
  return apiGet<CourseAssignment[]>('academic/course-assignments', params)
}

export interface StudentSearchResult {
  id: string
  fullName: string
  dni: string | null
}

export interface StudentAbsenceRecord {
  id: string
  date: string
  status: 'absent' | 'late'
  notes: string | null
  subject: { name: string } | null
}

export interface StudentAbsencesData {
  student: { id: string; fullName: string; dni: string | null }
  attendanceMode: 'per_subject' | 'daily'
  parallelName: string
  levelName: string
  records: StudentAbsenceRecord[]
}

export function searchStudents(search: string) {
  return apiGet<StudentSearchResult[]>('enrollments/students', search ? { search } : undefined)
}

export function getStudentAbsences(studentId: string) {
  return apiGet<StudentAbsencesData>(`attendance/student/${studentId}/absences`)
}

// ─── Solicitudes de justificación (familias) ─────────────────────────────────

export interface JustificationRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  createdAt: string
  reviewNotes: string | null
  student: { id: string; name: string }
  requestedBy: string
  records: Array<{ id: string; date: string; status: string; subject: string | null }>
}

export function requestJustification(payload: { studentId: string; attendanceRecordIds: string[]; reason: string }) {
  return apiPost<{ id: string; status: string }>('attendance/justification-requests', payload)
}

export function listJustificationRequests(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  return apiGet<JustificationRequest[]>('attendance/justification-requests', { status })
}

export function reviewJustificationRequest(id: string, payload: { approve: boolean; notes?: string }) {
  return apiPatch<{ ok: true }>(`attendance/justification-requests/${id}`, payload)
}

/** Complemento por hora para paralelos con jornada diaria. */
export function getClassHour(courseAssignmentId: string, date: string, period: number) {
  return apiGet<AttendanceEntry[]>('attendance/class-hour', { courseAssignmentId, date, period: String(period) })
}
export function saveClassHour(payload: { courseAssignmentId: string; date: string; period: number; records: Array<{ studentId: string; status: string; notes?: string }> }) {
  return apiPost('attendance/class-hour', payload)
}
export function getClassHistory(courseAssignmentId: string) {
  return apiGet<Array<{ date: string; period: number; _count: { _all: number } }>>('attendance/class-history', { courseAssignmentId })
}
