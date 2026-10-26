import type { FormativeReinforcementConfig } from '@/features/settings/api/settings.api'
import { apiClient, apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/shared/lib/api-client'

export type CaseStatus = 'DETECTED' | 'PLANNED' | 'IN_REINFORCEMENT' | 'EVALUATED' | 'CLOSED' | 'CONTINUES_REINFORCEMENT'
export type AttendanceStatus = 'present' | 'absent' | 'justified'

export const CASE_STATUS_LABEL: Record<string, string> = {
  DETECTED: 'Detectado',
  PLANNED: 'Planificado',
  IN_REINFORCEMENT: 'En refuerzo',
  EVALUATED: 'Evaluado',
  CLOSED: 'Cerrado',
  CONTINUES_REINFORCEMENT: 'Continúa refuerzo',
}

export interface CaseListItem {
  id: string
  caseStatus: CaseStatus
  mode: string
  cycleNumber: number
  createdAt: string
  learningTarget: string | null
  initialResult: string | null
  period: { id: string; name: string }
  students: Array<{ id: string; name: string }>
  subject: string
  parallel: { id: string; name: string }
  sessions: number
  attachments: number
  reports: { drafts: number; sent: number }
  canEdit: boolean
}

export interface ListCasesParams {
  yearId?: string
  periodId?: string
  parallelId?: string
  courseAssignmentId?: string
  studentId?: string
  caseStatus?: string
}

type PersonLite = { id: string; profile: { firstName: string; lastName: string } | null }

/** Forma del caso legado (REINFORCEMENT_CASE_INCLUDE). Solo los campos que se muestran. */
export interface LegacyCase {
  id: string
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  caseStatus: CaseStatus
  mode: string
  cycleNumber: number
  detectionSourceCode: string | null
  detectionObservation: string | null
  detectionInitialResult: string | null
  detectionEvidenceOrigin: string | null
  detectedOn: string | null
  needObservation: string | null
  learningTargetTitle: string | null
  learningTargetDescription: string | null
  proposalLearningToReinforce: string | null
  proposalObjective: string | null
  proposalActiveStrategy: string | null
  proposalConcreteActivity: string | null
  proposalResource: string | null
  proposalEvidence: string | null
  proposalEvaluation: string | null
  proposalDurationFrequency: string | null
  proposalExpectedResult: string | null
  courseAssignment: { id: string; subject: { id: string; name: string }; parallel: { id: string; name: string; level: { name: string } } }
  academicPeriod: { id: string; name: string }
  participants: Array<{ studentId: string; student: PersonLite }>
  communications: Array<{ id: string; date: string; mediumLabel: string; recipient: string; institutionalText: string }>
  commitments: Array<{ id: string; commitmentLabel: string; responsible: string; targetDate: string | null; note: string | null }>
  followUps: Array<{ id: string; date: string; strategyApplied: string; evidence: string; observation: string; observedProgress: string | null; nextAction: string | null }>
  reevaluations: Array<{
    id: string
    date: string
    evaluation: string
    initialResult: string | null
    subsequentResult: string | null
    observedProgress: string | null
    pedagogicalDecision: string | null
    outcomes: Array<{ id: string; studentId: string; result: string; assessmentValue: string | null; observation: string | null; student: PersonLite }>
  }>
}

export interface CaseScore {
  studentId: string
  alertId: string | null
  alertStatus: string | null
  atDetection: number | null
  formative: number | null
  summative: number | null
  total: number | null
  target: number | null
}

export interface CaseSession {
  id: string
  date: string
  title: string
  description: string | null
  targetActivityId: string | null
  attendances: Array<{
    studentId: string
    status: AttendanceStatus
    score: number | null
    observation: string | null
    appliedScore: number | null
    appliedMode: string | null
  }>
}

export interface CaseAttachment {
  id: string
  category: string
  categoryLabel: string
  fileName: string
  mimeType: string
  fileSize: number
  sessionId: string | null
  uploadedBy: string
  canDelete: boolean
  createdAt: string
}

export interface CaseReport {
  id: string
  folio: string | null
  typeKey: string
  typeLabel: string
  status: string
  sentAt: string | null
  recipientInstanceLabel: string
  confidential: boolean
  authorId: string
}

export interface CaseDetail {
  case: LegacyCase
  canEdit: boolean
  students: Array<{ id: string; name: string }>
  scores: CaseScore[]
  sessions: CaseSession[]
  attachments: CaseAttachment[]
  reports: CaseReport[]
  reportTypes: Array<{ key: string; label: string; to: string; requiresReinforcementCase: boolean }>
  attachmentConfig: { categories: Array<{ key: string; label: string }>; maxSizeMb: number; allowedMime: string[] }
}

export interface CaseActivity {
  id: string
  name: string
  maxScore: number
  date: string | null
  type: string
  summative: boolean
  insumo: string | null
  grades: Array<{ studentId: string; original: number | null; effective: number | null; reinforced: boolean }>
}

export interface SessionInput {
  date: string
  title: string
  description?: string | null
  targetActivityId?: string | null
}

export interface AttendanceInput {
  studentId: string
  status: AttendanceStatus
  score?: number | null
  observation?: string | null
}

export interface FormativeResultInput {
  studentId: string
  activityIds: string[]
  sessionIds: string[]
  reason?: string
  revoke?: boolean
  expectedPreviewToken?: string
  expectedResultId?: string | null
}
export interface FormativeHistory {
  id: string
  studentId: string
  planId: string
  recordedBy: string
  recordedByName: string
  createdAt: string
  reason: string
  payload: FormativeReinforcementConfig & { activityIds: string[]; score: number | null; initialFormative: number | null; adjustedFormative: number | null }
}
export interface FormativeOptions {
  policy: FormativeReinforcementConfig
  scale: number
  canApply: boolean
  history: FormativeHistory[]
}
export interface FormativePreview {
  previewToken: string
  application: FormativeReinforcementConfig & { score: number | null }
  initial: { formative: number | null; total: number | null }
  adjusted: { formative: number | null; total: number | null }
}
const base = 'reinforcement-desk/cases'

export interface StartReinforcementInput {
  alertIds: string[]
  learningTarget: string
  objective?: string
  strategies?: string
  schedule?: string
}
export interface SaveReinforcementPlanInput {
  learningTarget: string
  objective: string
  strategies: string
  resources?: string
  evaluation?: string
  schedule?: string
  notes?: string
  action?: 'save' | 'close' | 'continue'
  outcomes?: Array<{ studentId: string; result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED'; observation?: string; assessmentValue?: string }>
}
export const reinforcementDeskApi = {
  startFromAlerts: (data: StartReinforcementInput) => apiPost<{ id: string; alreadyLinked: boolean }>(`${base}/from-alerts`, data),
  savePlan: (id: string, data: SaveReinforcementPlanInput) => apiPut(`${base}/${id}/plan`, data),
  formativeOptions: (id: string) => apiGet<FormativeOptions>(`${base}/${id}/formative`),
  previewFormative: (id: string, data: FormativeResultInput) => apiPost<FormativePreview>(`${base}/${id}/formative/preview`, data),
  applyFormative: (id: string, data: FormativeResultInput) => apiPost<FormativeHistory>(`${base}/${id}/formative/apply`, data),
  list: (params: ListCasesParams) => apiGet<CaseListItem[]>(base, params as Record<string, string | undefined>),
  detail: (id: string) => apiGet<CaseDetail>(`${base}/${id}`),
  activities: (id: string) => apiGet<CaseActivity[]>(`${base}/${id}/activities`),
  createSession: (id: string, data: SessionInput) => apiPost<{ id: string }>(`${base}/${id}/sessions`, data),
  updateSession: (id: string, sessionId: string, data: Partial<SessionInput>) =>
    apiPatch<{ id: string }>(`${base}/${id}/sessions/${sessionId}`, data),
  deleteSession: (id: string, sessionId: string) => apiDelete(`${base}/${id}/sessions/${sessionId}`),
  saveAttendance: (id: string, sessionId: string, items: AttendanceInput[]) =>
    apiPut<CaseDetail>(`${base}/${id}/sessions/${sessionId}/attendance`, { items }),
  uploadAttachment: (id: string, file: File, category: string, sessionId?: string) => {
    const form = new FormData()
    form.append('file', file)
    const searchParams: Record<string, string> = { category }
    if (sessionId) searchParams.sessionId = sessionId
    return apiClient.post(`${base}/${id}/attachments`, { body: form, searchParams, timeout: 60_000 }).json<CaseDetail>()
  },
  downloadAttachment: async (id: string, attachment: { id: string; fileName: string }) => {
    const blob = await apiClient.get(`${base}/${id}/attachments/${attachment.id}`).blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = attachment.fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  },
  deleteAttachment: (id: string, attachmentId: string) =>
    apiClient.delete(`${base}/${id}/attachments/${attachmentId}`).json<CaseDetail>(),
}
