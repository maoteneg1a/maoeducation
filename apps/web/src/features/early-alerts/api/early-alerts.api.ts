import { apiGet, apiPost } from '@/shared/lib/api-client'

export type EarlyAlertStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'

export interface EarlyAlertItem {
  id: string
  status: EarlyAlertStatus
  source: string
  scoreAtDetection: number | null
  currentScore: number | null
  qualitativeCode: string | null
  detectedAt: string
  resolvedAt: string | null
  dismissedReason: string | null
  student: { id: string; name: string; dni: string | null }
  assignment: { id: string; subjectName: string; teacherId: string; teacherName: string }
  parallel: { id: string; name: string; levelName: string; tutorId: string | null }
  reinforcementCase: { id: string; caseStatus: string } | null
  reports: Array<{ typeKey: string; label: string; sent: number; drafts: number; lastStatus: string | null }>
  canStartReinforcement: boolean
  canAct: boolean
}

export interface EarlyAlertsResponse {
  period: { id: string; name: string; isClosed: boolean }
  rules: { source: 'formative' | 'period_total'; moment: 'live' | 'period_close'; range: [number, number]; qualitativeCodes: string[] }
  reportTypes: Array<{ key: string; label: string; to: string }>
  items: EarlyAlertItem[]
}

export interface EarlyAlertsSummary {
  period: { id: string; name: string; isClosed: boolean }
  parallels: Array<{ parallelId: string; parallel: string; open: number; withoutReports: number; withCase: number }>
}

export interface DeskCase {
  id: string
  caseStatus: string
  learningTarget: string | null
  createdAt: string
  subject: string
  students: Array<{ id: string; name: string }>
  period: { id: string; name: string }
}

export const earlyAlertsApi = {
  list: (params: { periodId: string; parallelId?: string; courseAssignmentId?: string; studentId?: string; status?: EarlyAlertStatus | 'all' }) =>
    apiGet<EarlyAlertsResponse>('early-alerts', params),
  summary: (periodId: string) => apiGet<EarlyAlertsSummary>('early-alerts/summary', { periodId }),
  dismiss: (id: string, reason: string) => apiPost(`early-alerts/${id}/dismiss`, { reason }),
  reopen: (id: string) => apiPost(`early-alerts/${id}/reopen`),
  linkCase: (id: string, planId: string) => apiPost(`early-alerts/${id}/link-case`, { planId }),
  cases: (params: { periodId?: string; courseAssignmentId?: string; studentId?: string }) =>
    apiGet<DeskCase[]>('reinforcement-desk/cases', params),
}
