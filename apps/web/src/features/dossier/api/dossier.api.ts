import { apiClient, apiGet, apiDelete } from '@/shared/lib/api-client'

export type DossierItemStatus = 'ok' | 'partial' | 'missing' | 'na'

export interface DossierEvidence {
  id: string
  label: string
  folio: string | null
  status: string
  date: string | null
  kind: 'formal_report' | 'parent_meeting' | 'reinforcement_case' | 'enrollment' | 'uploaded_file'
  subject?: string | null
  canOpen?: boolean
  canRemove?: boolean
  uploader?: string
  observation?: string | null
}

export interface DossierItem {
  key: string
  label: string
  source: 'formal_report' | 'parent_meetings' | 'reinforcement_case' | 'enrollment_adaptation'
  reportType: string | null
  minCount: number
  perSubject: boolean
  optional: boolean
  requiresSignature: boolean
  canUpload: boolean
  canGenerate: boolean
  requiresReinforcementCase: boolean
  notApplicableReason: string | null
  uploaded: number
  status: DossierItemStatus
  acknowledged: number
  pending: number
  subjects: Array<{ subject: string; count: number; required: number; ok: boolean }>
  evidence: DossierEvidence[]
}

export interface Dossier {
  student: { id: string; name: string; dni: string | null }
  parallel: { id: string; name: string; subnivel: string }
  academicYear: { id: string; name: string }
  applies: boolean
  subjects: Array<{ id: string; name: string }>
  selectedSubjectId: string | null
  cases: Array<{ id: string; subject: string; periodId: string; period: string }>
  canUpload: boolean
  uploadSettings: { maxSizeMb: number; allowedMime: string[] }
  completion: number
  items: DossierItem[]
}

export function getDossier(studentId: string, academicYearId: string, courseAssignmentId?: string) {
  return apiGet<Dossier>('formal-reports/dossier', { studentId, academicYearId, courseAssignmentId })
}

export interface DossierContext { studentId: string; academicYearId: string; courseAssignmentId?: string; itemKey: string }
export async function uploadDossierFile(ctx: DossierContext, file: File, isSigned: boolean, observation: string) {
  const body = new FormData()
  body.append('file', file)
  const searchParams = new URLSearchParams({ studentId: ctx.studentId, academicYearId: ctx.academicYearId, itemKey: ctx.itemKey, isSigned: String(isSigned), observation })
  if (ctx.courseAssignmentId) searchParams.set('courseAssignmentId', ctx.courseAssignmentId)
  return apiClient.post('formal-reports/dossier/files', { searchParams, body }).json<{ id: string }>()
}
export async function downloadDossierFile(id: string, fileName: string) {
  const blob = await apiClient.get(`formal-reports/dossier/files/${id}`).blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export const removeDossierFile = (id: string) => apiDelete(`formal-reports/dossier/files/${id}`)
export async function setDossierApplicability(ctx: DossierContext, notApplicable: boolean, reason?: string) {
  await apiClient.put('formal-reports/dossier/applicability', { json: { ...ctx, notApplicable, reason } })
}
