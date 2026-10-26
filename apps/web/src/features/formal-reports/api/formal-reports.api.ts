import { apiClient, apiDelete, apiGet, apiPatch, apiPost } from '@/shared/lib/api-client'

export type FormalReportStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'RETURNED' | 'ATTENDED'
export type ReportBox = 'inbox' | 'sent' | 'drafts' | 'all'
export type ReportFieldType = 'text' | 'textarea' | 'date'

export interface ReportField {
  key: string
  label: string
  type: ReportFieldType
  required: boolean
  placeholder?: string
  defaultValue?: string
}

export interface ReportTypeConfig {
  key: string
  label: string
  description?: string
  enabled: boolean
  scope: 'student' | 'parallel' | 'institution'
  authorRoles: string[]
  to: string
  triggeredByAlert: boolean
  requiresReinforcementCase: boolean
  snapshot: 'none' | 'grades' | 'reinforcement_case' | 'reinforcement_sessions' | 'early_alerts'
  fields: ReportField[]
  ackDeadlineDays: number
  escalateTo?: string | null
  confidential: boolean
  canDeriveTo: string[]
  pdfTitle: string
  pdfTemplate?: 'annex_alerts' | 'annex_commitment' | 'annex_plan' | 'annex_progress' | 'annex_attendance'
  pdfFooter?: string
  signatures: string[]
}

export interface ReportInstance {
  key: string
  label: string
  resolver: string
  role?: string
  userIds?: string[]
}

export interface ReportsFlowConfig {
  folioPrefix: string
  instances: ReportInstance[]
  reportTypes: ReportTypeConfig[]
  attachments: {
    maxSizeMb: number
    allowedMime: string[]
    uploaderRoles: string[]
    categories: Array<{ key: string; label: string; visibleToRoles: string[] }>
  }
}

export interface FormalReport {
  id: string
  folio: string | null
  typeKey: string
  typeLabel: string
  scope: string
  status: FormalReportStatus
  confidential: boolean
  contentHidden: boolean
  academicYearId: string
  studentId: string | null
  student: { id: string; name: string; dni: string | null } | null
  parallelId: string | null
  courseAssignmentId: string | null
  academicPeriodId: string | null
  alertId: string | null
  reinforcementPlanId: string | null
  parentReport: { id: string; folio: string | null; typeLabel: string } | null
  subsequentVersions?: Array<{ id: string; folio: string | null; status: FormalReportStatus }>
  previousVersionId: string | null
  derived: Array<{ id: string; folio: string | null; typeLabel: string; status: FormalReportStatus; recipientInstanceLabel: string }>
  author: { id: string; name: string }
  recipientInstance: string
  recipientInstanceLabel: string
  recipients: Array<{ userId: string; name: string; readAt: string | null }>
  content: Record<string, string>
  snapshot: Record<string, unknown>
  typeConfig: Partial<ReportTypeConfig>
  signatures?: { author: { name: string; signedAt: string } | null; recipient: { name: string; signedAt: string } | null }
  contentHash: string | null
  sentAt: string | null
  ackDeadlineAt: string | null
  overdue: boolean
  receivedAt: string | null
  receivedById: string | null
  returnedAt: string | null
  returnNote: string | null
  attendedAt: string | null
  responseNote: string | null
  escalatedAt: string | null
  attachments: Array<{ id: string; fileName: string; mimeType: string; fileSize: number; category: string }>
  createdAt: string
  updatedAt: string
  permissions: {
    isAuthor: boolean
    isRecipient: boolean
    canEdit: boolean
    canReceive: boolean
    canReturn: boolean
    canAttend: boolean
    canDerive: boolean
    canNewVersion: boolean
  }
}

export interface CreateFormalReportInput {
  typeKey: string
  studentId?: string
  parallelId?: string
  courseAssignmentId?: string
  academicPeriodId?: string
  academicYearId?: string
  alertId?: string
  reinforcementPlanId?: string
  content?: Record<string, string>
}

export interface ListFormalReportsParams {
  box?: ReportBox
  status?: FormalReportStatus
  typeKey?: string
  studentId?: string
  academicYearId?: string
  overdue?: 'true' | 'false'
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const formalReportsApi = {
  amendment: (id: string) => apiPost<FormalReport>(`formal-reports/${id}/amendment`),
  list: (params: ListFormalReportsParams = {}) =>
    apiGet<FormalReport[]>('formal-reports', params as Record<string, string | undefined>),
  counts: () => apiGet<{ inboxPending: number; overdueSent: number; drafts: number }>('formal-reports/counts'),
  get: (id: string) => apiGet<FormalReport>(`formal-reports/${id}`),
  create: (data: CreateFormalReportInput) => apiPost<FormalReport>('formal-reports', data),
  update: (id: string, content: Record<string, string>) => apiPatch<FormalReport>(`formal-reports/${id}`, { content }),
  remove: (id: string) => apiDelete(`formal-reports/${id}`),
  snapshotPreview: (id: string) => apiGet<Record<string, unknown>>(`formal-reports/${id}/snapshot-preview`),
  send: (id: string) => apiPost<FormalReport>(`formal-reports/${id}/send`),
  receive: (id: string) => apiPost<FormalReport>(`formal-reports/${id}/receive`),
  returnReport: (id: string, note: string) => apiPost<FormalReport>(`formal-reports/${id}/return`, { note }),
  attend: (id: string, note?: string) => apiPost<FormalReport>(`formal-reports/${id}/attend`, { note }),
  derive: (id: string, typeKey: string) => apiPost<FormalReport>(`formal-reports/${id}/derive`, { typeKey }),
  newVersion: (id: string) => apiPost<FormalReport>(`formal-reports/${id}/new-version`),
  uploadAttachment: (id: string, file: File, category: string) => {
    const form = new FormData()
    form.append('file', file)
    return apiClient
      .post(`formal-reports/${id}/attachments`, { body: form, searchParams: { category }, timeout: 120000 })
      .json<FormalReport>()
  },
  copyFromCase: (id: string, attachmentIds: string[]) =>
    apiPost<FormalReport>(`formal-reports/${id}/attachments/from-case`, { attachmentIds }),
  removeAttachment: (id: string, attachmentId: string) =>
    apiClient.delete(`formal-reports/${id}/attachments/${attachmentId}`).json<FormalReport>(),
  downloadAttachment: async (id: string, attachmentId: string, fileName: string) => {
    const blob = await apiClient.get(`formal-reports/${id}/attachments/${attachmentId}`).blob()
    saveBlob(blob, fileName)
  },
  pdfBlob: (id: string) => apiClient.get(`formal-reports/${id}/pdf`, { timeout: 150000 }).blob(),
  downloadPdf: async (id: string, fileName: string) => {
    const blob = await apiClient.get(`formal-reports/${id}/pdf`, { timeout: 150000 }).blob()
    saveBlob(blob, fileName)
  },
  downloadDocx: async (id: string, fileName: string) => {
    const blob = await apiClient.get(`formal-reports/${id}/docx`).blob()
    saveBlob(blob, fileName)
  },
  reportsFlow: () =>
    apiGet<{ config: ReportsFlowConfig; defaults: ReportsFlowConfig; roles: Array<{ name: string; label: string }> }>('institution/reports-flow'),
}

/** Archivos del caso de refuerzo (para "Agregar desde el caso"). */
export function getCaseAttachments(planId: string) {
  return apiGet<{ attachments: Array<{ id: string; fileName: string; categoryLabel: string; fileSize: number }> }>(
    `reinforcement-desk/cases/${planId}`,
  ).then((d) => d.attachments ?? [])
}
