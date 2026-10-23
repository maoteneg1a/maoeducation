import { apiGet } from '@/shared/lib/api-client'

export type DossierItemStatus = 'ok' | 'partial' | 'missing' | 'na'

export interface DossierEvidence {
  id: string
  label: string
  folio: string | null
  status: string
  date: string | null
  kind: 'formal_report' | 'parent_meeting' | 'reinforcement_case' | 'enrollment'
  subject?: string | null
}

export interface DossierItem {
  key: string
  label: string
  source: 'formal_report' | 'parent_meetings' | 'reinforcement_case' | 'enrollment_adaptation'
  reportType: string | null
  minCount: number
  perSubject: boolean
  optional: boolean
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
  riskSubjects: Array<{ id: string; name: string }>
  completion: number
  items: DossierItem[]
}

export function getDossier(studentId: string, academicYearId: string) {
  return apiGet<Dossier>('formal-reports/dossier', { studentId, academicYearId })
}
