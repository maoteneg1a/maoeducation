import { apiGet, apiPost, apiPatch, apiPut } from '@/shared/lib/api-client'
import { apiClient } from '@/shared/lib/api-client'

export interface IncidentPerson {
  id: string
  profile: { firstName: string; lastName: string; dni?: string }
}

export interface IncidentType {
  id: string
  name: string
  code: string
  severity: 'leve' | 'grave' | 'muy_grave'
  description?: string | null
  requiresDece: boolean
  requiresCommitment: boolean
  isActive: boolean
  sortOrder: number
}

export interface IncidentEvent {
  id: string
  type: string
  description: string | null
  createdAt: string
  actor: IncidentPerson
}

export interface IncidentCommitment {
  id: string
  terms: string
  followUpDate: string | null
  status: string
  createdAt: string
  creator: IncidentPerson
}

export interface IncidentAttachment {
  id: string
  fileName: string
  storedName: string
  mimeType: string
  fileSize: number
  createdAt: string
  uploader: IncidentPerson
}

export interface Incident {
  id: string
  studentId: string
  student: IncidentPerson
  reporter: IncidentPerson
  incidentTypeId?: string | null
  incidentType?: { id: string; name: string; severity: string } | null
  assignedDeceId?: string | null
  assignedDece?: IncidentPerson | null
  incidentDate: string
  category: string
  description: string
  severity: string
  status: string
  workflowState: string
  guardianNotifiedAt?: string | null
  resolutionNotes?: string
  resolvedAt?: string
  createdAt: string
  events?: IncidentEvent[]
  commitments?: IncidentCommitment[]
  attachments?: IncidentAttachment[]
}

// ---- Incidentes ----
export const listIncidents = (params?: Record<string, string>) =>
  apiGet<Incident[]>('incidents', params)

export const getIncident = (id: string) => apiGet<Incident>(`incidents/${id}`)

export const createIncident = (data: {
  studentId: string
  incidentDate: string
  incidentTypeId?: string
  category: string
  description: string
  severity: string
}) => apiPost<Incident>('incidents', data)

export const updateIncident = (id: string, data: Partial<Incident>) =>
  apiPatch<Incident>(`incidents/${id}`, data)

export const changeIncidentState = (id: string, data: { workflowState: string; note?: string }) =>
  apiPatch<Incident>(`incidents/${id}/state`, data)

export const assignDece = (id: string, data: { deceId: string; note?: string }) =>
  apiPost<Incident>(`incidents/${id}/assign-dece`, data)

export const addIncidentEvent = (id: string, data: { description: string }) =>
  apiPost<IncidentEvent>(`incidents/${id}/events`, data)

export const notifyGuardian = (id: string) =>
  apiPost<{ notified: number }>(`incidents/${id}/notify-guardian`, {})

// ---- Actas ----
export const listCommitments = (id: string) =>
  apiGet<IncidentCommitment[]>(`incidents/${id}/commitments`)

export interface CommitmentDetails {
  meetingPlace?: string
  meetingDate?: string
  purpose?: string
  participants: Array<{ name: string; role: string; dni?: string }>
  agreements: Array<{ action: string; responsible: string; dueDate?: string; verification?: string }>
  observations?: string
  includeTimeline?: boolean
  timelineEventIds?: string[]
  includeEvidenceList?: boolean
}

export const createCommitment = (id: string, data: { terms: string; followUpDate?: string; document?: CommitmentDetails }) =>
  apiPost<IncidentCommitment>(`incidents/${id}/commitments`, data)

export async function downloadCommitmentPdf(incidentId: string, commitmentId: string) {
  const blob = await apiClient
    .get(`incidents/${incidentId}/commitments/${commitmentId}/pdf`)
    .blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `acta-${commitmentId}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- Evidencias ----
export async function uploadEvidence(id: string, file: File): Promise<IncidentAttachment> {
  const form = new FormData()
  form.append('file', file)
  return apiClient.post(`incidents/${id}/attachments`, { body: form }).json<IncidentAttachment>()
}

export const deleteEvidence = (id: string, attachmentId: string) =>
  apiClient.delete(`incidents/${id}/attachments/${attachmentId}`).then(() => undefined)

// ---- Tipos de falta ----
export const listIncidentTypes = () => apiGet<IncidentType[]>('incident-types')

export const createIncidentType = (data: {
  name: string
  severity?: string
  description?: string
  requiresDece?: boolean
  requiresCommitment?: boolean
}) => apiPost<IncidentType>('incident-types', data)

export const updateIncidentType = (
  id: string,
  data: Partial<{
    name: string
    severity: string
    description: string
    requiresDece: boolean
    requiresCommitment: boolean
  }>,
) => apiPut<IncidentType>(`incident-types/${id}`, data)

export const toggleIncidentType = (id: string) =>
  apiPatch<IncidentType>(`incident-types/${id}/toggle`)

// ---- Usuarios (para selects) ----
export const getUsers = (params?: Record<string, string>) =>
  apiGet<{
    data: Array<{ id: string; fullName: string; email: string; roles: string[] }>
    total: number
  }>('users', params)

/** Estudiantes que el actor puede reportar (docente → sus paralelos; admin/DECE → todos). */
export const getReportableStudents = () =>
  apiGet<Array<{ id: string; fullName: string; dni: string | null }>>('incidents/students')


/** Ruta autenticada del adjunto (se descarga con openProtectedFile). */
export function getIncidentAttachmentUrl(storedName: string) {
  return `files/incidents/${storedName}`
}
