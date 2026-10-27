export type FormalReportStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'RETURNED' | 'ATTENDED'
export type ReportBox = 'inbox' | 'sent' | 'drafts' | 'all'

export interface CreateFormalReportDto {
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

export interface UpdateFormalReportDto {
  content: Record<string, string>
}

export interface ListFormalReportsQuery {
  annexOnly?: 'true' | 'false'
  box?: ReportBox
  status?: FormalReportStatus
  typeKey?: string
  studentId?: string
  academicYearId?: string
  overdue?: 'true' | 'false'
}

export interface ReturnReportDto {
  note: string
}

export interface AttendReportDto {
  note?: string
}

export interface DeriveReportDto {
  typeKey: string
}

export interface CopyCaseAttachmentsDto {
  attachmentIds: string[]
}
