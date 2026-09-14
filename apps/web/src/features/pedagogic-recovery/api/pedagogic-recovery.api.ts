import { apiClient, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'

export interface PedagogicRecoveryStudentRow {
  studentId: string
  studentName: string
  periodTotal: number | null
  recoveryScore: number | null
  effectiveTotal: number | null
  recovered: boolean
}

export interface PedagogicRecoverySubject {
  assignmentId: string
  subjectName: string
  students: PedagogicRecoveryStudentRow[]
}

export interface PedagogicRecoveryPageData {
  parallel: { id: string; name: string; level: { name: string } }
  period: { id: string; name: string; isClosed: boolean }
  recoveryMode: 'replace_if_higher' | 'average'
  passingGrade: number
  subjects: PedagogicRecoverySubject[]
}

export function getPedagogicRecovery(params: { parallelId: string; periodId: string; yearId: string }) {
  return apiGet<PedagogicRecoveryPageData>('pedagogic-recovery', params)
}

export function savePedagogicRecovery(data: {
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  score: number | null
  notes?: string
}) {
  return apiPut('pedagogic-recovery', data)
}

// ─── Candidatos de refuerzo detectados automáticamente por destreza ────────

export interface SkillReinforcementStudent {
  studentId: string
  studentName: string
  average: number
}

export interface SkillReinforcementCandidate {
  curriculumSkillId: string
  skillCode: string
  skillDescription: string
  passingGrade: number
  students: SkillReinforcementStudent[]
}

export function getSkillReinforcementCandidates(params: {
  courseAssignmentId: string
  academicPeriodId: string
}) {
  return apiGet<SkillReinforcementCandidate[]>('pedagogic-recovery/skill-reinforcement', params)
}

// ─── Plan de Refuerzo Académico Individualizado ────────────────────────────

export type ReinforcementPlanType = 'academico' | 'nee'
export type ReinforcementPlanStatus = 'borrador' | 'activo' | 'cerrado'

export interface ReinforcementPlanSkillItem {
  curriculumSkill: { id: string; code: string; description: string }
  averageAtDetection: number | null
  notes: string | null
}

export interface ReinforcementPlan {
  id: string
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  planType: ReinforcementPlanType
  status: ReinforcementPlanStatus
  objetivoGeneral: string | null
  estrategias: string | null
  responsables: string | null
  fechaInicio: string | null
  fechaSeguimiento: string | null
  observacionesFinales: string | null
  createdAt: string
  student: { id: string; profile: { firstName: string; lastName: string } }
  skills: ReinforcementPlanSkillItem[]
}

export function listReinforcementPlans(params: { courseAssignmentId: string; academicPeriodId: string }) {
  return apiGet<ReinforcementPlan[]>('pedagogic-recovery/reinforcement-plans', params)
}

export function createReinforcementPlan(data: {
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  planType: ReinforcementPlanType
  skills?: { curriculumSkillId: string; averageAtDetection?: number | null; notes?: string }[]
  objetivoGeneral?: string
  estrategias?: string
  responsables?: string
}) {
  return apiPost<ReinforcementPlan>('pedagogic-recovery/reinforcement-plans', data)
}

export function updateReinforcementPlan(
  id: string,
  data: Partial<{
    status: ReinforcementPlanStatus
    objetivoGeneral: string
    estrategias: string
    responsables: string
    fechaInicio: string | null
    fechaSeguimiento: string | null
    observacionesFinales: string
  }>,
) {
  return apiPut<ReinforcementPlan>(`pedagogic-recovery/reinforcement-plans/${id}`, data)
}

export async function openReinforcementPlanPdf(id: string) {
  const blob = await apiClient.get(`pedagogic-recovery/reinforcement-plans/${id}/pdf`).blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
