export type EarlyAlertStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'

export interface ListEarlyAlertsQuery {
  periodId: string
  parallelId?: string
  courseAssignmentId?: string
  studentId?: string
  status?: EarlyAlertStatus | 'all'
}

export interface AlertReportProgress {
  typeKey: string
  label: string
  sent: number
  drafts: number
  lastStatus: string | null
}

export interface EarlyAlertItemDto {
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
  reports: AlertReportProgress[]
  canStartReinforcement: boolean
  canAct: boolean
}

export interface DismissAlertDto {
  reason: string
}

export interface LinkCaseDto {
  planId: string
}
