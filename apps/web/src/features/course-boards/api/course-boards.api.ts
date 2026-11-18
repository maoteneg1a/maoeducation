export interface MeetingDetails {
  number: string; shift: string; invitationDate: string; meetingDate: string; startTime: string; scheduledEndTime: string; actualEndTime: string
  location: string; responsible: string; phone: string; email: string; background: string; agenda: string; development: string
  participants: Array<{ userId?: string; name: string; role: string; attendance: 'pending' | 'present' | 'absent' }>
}
import { apiClient, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'
export interface BoardConfig {
  secretaries: Record<string, string>
  convocationBackground: string; headerBackground: string; tableHeaderBackground: string; textColor: string; borderColor: string
  watermarkEnabled: boolean; watermarkOpacity: number
  title: string; situationLabel: string; actionsLabel: string; recommendationsLabel: string
  showAttendance: boolean; showIncidents: boolean; showReinforcement: boolean
  reportTypes: Array<{ key: string; label: string; enabled: boolean; authors: 'tutor' | 'teacher' | 'both' }>
}
export interface BoardOptions {
  years: Array<{ id: string; name: string; isActive: boolean }>; yearId: string
  periods: Array<{ id: string; name: string; isActive: boolean }>
  parallels: Array<{ id: string; name: string; participant: boolean; secretaryId: string | null; boards: Array<{ id: string; academicPeriodId: string; status: string; chairId: string | null }> }>
  chairs: Array<{ id: string; name: string }>; secretaryCandidates: Array<{ id: string; name: string }>; config: BoardConfig; canConfigure: boolean
}
export interface BoardReport {
  title: string; authorName: string; subjectName: string | null
  situation: string; actions: string; recommendations: string
  labels: { situation: string; actions: string; recommendations: string }
}
export interface BoardData {
  gradesHash: string; notesConfirmed: boolean; canConfirmGrades: boolean; canReopen: boolean
  id: string; yearId: string; status: string; revision: number; matrixHash: string; closedAt: string | null; conclusions: string
  invitation: { id: string; publishedAt: string; needsUpdate: boolean } | null
  meeting: MeetingDetails; canEditInvitation: boolean; canEditMeeting: boolean; canPublishInvitation: boolean
  chairId: string | null; chairName: string; canDirect: boolean; canUpload: boolean; canAssignChair: boolean; canReport: boolean
  isTutor: boolean; isSecretary: boolean; secretaryId: string | null; secretaryName: string | null; isAuthority: boolean; ownAssignmentIds: string[]
  matrix: {
    institutionName: string; parallelName: string; periodName: string; yearName: string; tutorName: string; generatedAt: string; config: BoardConfig
    subjects: Array<{ id: string; name: string; teacherId: string; teacherName: string; isQualitative: boolean }>
    rows: Array<{ id: string; name: string; dni: string | null; grades: Array<{ assignmentId: string; value: number | null; display: string; partial: boolean }>; absences: number; late: number; incidents: number; reinforcement: number; behavior: string | null; observation: string | null }>
  }
  evidence: Array<{ id: string; kind: string; label: string; fileName: string; mimeType: string; isSigned: boolean; createdAt: string; authorName: string; document: BoardReport | null }>
  uploadSettings: { maxSizeMb: number; allowedMime: string[] }
}
export const getBoardOptions = (yearId?: string) => apiGet<BoardOptions>('course-boards/options', yearId ? { yearId } : undefined)
export const getBoard = (id: string) => apiGet<BoardData>(`course-boards/${id}`)
export const createBoard = (parallelId: string, periodId: string) => apiPost<{ id: string }>('course-boards', { parallelId, periodId })
export const saveBoardConfig = (config: BoardConfig) => apiPut<BoardConfig>('course-boards/config', config)
export const consolidatedPdf = (id: string) => apiPost<{ id: string }>(`course-boards/${id}/consolidated`, {})
export const generateBoardReport = (id: string, data: { typeKey: string; courseAssignmentId?: string; situation: string; actions: string; recommendations: string }) => apiPost<{ id: string }>(`course-boards/${id}/reports`, data)
export const closeBoard = (id: string, conclusions: string, revision: number, matrixHash: string) => apiPost<{ id: string }>(`course-boards/${id}/close`, { conclusions, revision, matrixHash })
export const reopenBoard = (id: string) => apiPost(`course-boards/${id}/reopen`, {})
export const setBoardChair = (id: string, chairId: string) => apiPut(`course-boards/${id}/chair`, { chairId })
export async function uploadBoardEvidence(id: string, file: File, signed: boolean) {
  const body = new FormData(); body.append('file', file)
  return apiClient.post(`course-boards/${id}/evidence?signed=${signed}`, { body }).json<{ id: string }>()
}

export const saveMeeting = (id: string, meeting: MeetingDetails, revision: number) => apiPut<{ revision: number; meeting: MeetingDetails }>(`course-boards/${id}/meeting`, { meeting, revision })
export const meetingPdf = (id: string, kind: 'CALL' | 'ATTENDANCE' | 'MINUTES') => apiPost<{ id: string }>(`course-boards/${id}/documents/${kind}`, {})

export interface InvitationPreview {
  revision: number; title: string; body: string; recipients: Array<{ id: string; name: string }>; unlinked: string[]
  alreadyPublished: boolean; updating: boolean; noticeId: string | null
}
export const previewInvitation = (id: string) => apiGet<InvitationPreview>(`course-boards/${id}/invitation`)
export const publishInvitation = (id: string, revision: number) => apiPost<{ id: string }>(`course-boards/${id}/invitation`, { revision })

export const getBoardAccess = () => apiGet<{ canAccess: boolean }>('course-boards/access')
export const confirmBoardGrades = (id: string, gradesHash: string) => apiPost<{ ok: boolean }>(`course-boards/${id}/confirm-grades`, { gradesHash })
