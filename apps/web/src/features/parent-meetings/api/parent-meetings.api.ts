import type { StudentChoice } from '@/shared/lib/student-options'
import { apiGet, apiPost, apiPatch, apiDelete, apiClient } from '@/shared/lib/api-client'

export interface MeetingPerson {
  id: string
  profile: { firstName: string; lastName: string; dni?: string | null }
}

export interface ParentMeeting {
  id: string
  studentId: string | null
  student: MeetingPerson | null
  recordedBy: string
  recorder: MeetingPerson
  meetingDate: string
  meetingTime: string | null
  visitorName: string
  visitorRelation: string | null
  subject: string
  details: string
  agreements: string | null
  signatureKey: string | null
  signedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateParentMeetingInput {
  studentId?: string | null
  meetingDate: string
  meetingTime?: string
  visitorName: string
  visitorRelation?: string
  subject: string
  details: string
  agreements?: string
}

// ---- Atenciones ----
export const listParentMeetings = (params?: Record<string, string>) =>
  apiGet<ParentMeeting[]>('parent-meetings', params)

export const getParentMeeting = (id: string) => apiGet<ParentMeeting>(`parent-meetings/${id}`)

export const createParentMeeting = (data: CreateParentMeetingInput) =>
  apiPost<ParentMeeting>('parent-meetings', data)

export const updateParentMeeting = (id: string, data: Partial<CreateParentMeetingInput>) =>
  apiPatch<ParentMeeting>(`parent-meetings/${id}`, data)

export const deleteParentMeeting = (id: string) => apiDelete(`parent-meetings/${id}`)

/** Guarda la firma del visitante (PNG como data URL). */
export const saveParentMeetingSignature = (id: string, signature: string) =>
  apiPost<ParentMeeting>(`parent-meetings/${id}/signature`, { signature })

/** Estudiantes que el actor puede asociar (docente → sus paralelos; admin/DECE/etc → todos). */
export const getMeetingStudents = () =>
  apiGet<StudentChoice[]>('parent-meetings/students')

/** Descarga el acta de atención en PDF. */
export async function downloadActaPdf(id: string) {
  const blob = await apiClient.get(`parent-meetings/${id}/acta.pdf`).blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `acta-atencion-${id}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
