import { apiGet, apiPut } from '@/shared/lib/api-client'

// automatic | repeat_direct | junta: solo con el Acuerdo 2026-00082-A activo
export type SubjectStatus = 'approved' | 'supletorio' | 'remedial' | 'pending' | 'automatic' | 'repeat_direct' | 'junta'
export type EffectiveStatus = 'passed' | 'failed' | 'recovery_pending' | 'pending' | 'junta_review'
export type PromotionStatus = 'promoted' | 'not_promoted' | 'pending'
export type RecoveryType = 'supletorio' | 'remedial' | 'gracia'

export interface PromotionSubject {
  assignmentId: string
  subjectName: string
  annualAvg: number | null
  /** Promedio final tras supletorio (con tope). Igual a annualAvg si no hubo. */
  finalAvg: number | null
  status: SubjectStatus
  recovery: { type: RecoveryType; score: number } | null
  effectiveStatus: EffectiveStatus
}

export interface PromotionStudent {
  studentId: string
  studentName: string
  subjects: PromotionSubject[]
  failedCount: number
  suggestedStatus: PromotionStatus
  decision: { status: PromotionStatus; notes: string | null } | null
}

export interface ParallelPromotion {
  parallel: { id: string; name: string; level: { name: string } }
  year: { id: string; name: string }
  config: {
    minToPass: number
    supletorioMin: number
    supletorioMax: number
    passWithExam: number
    maxFailedSubjects: number
  }
  subjects: Array<{ assignmentId: string; subjectName: string }>
  students: PromotionStudent[]
  periodsTotal: number
  periodsClosed: number
  recoveryEnabled: boolean
  /** Reglas del Acuerdo 2026-00082-A activas para el año (null = marco anterior). */
  agreement: PromotionAgreement | null
}

export interface PromotionAgreement {
  framework: 'MINEDEC-2026-00082-A'
  subnivel: string | null
  supletorioCap: number
  directRepeatMax: number
  decimals: { places: number; method: 'truncate' | 'round' }
}

export interface SaveRecoveryInput {
  studentId: string
  courseAssignmentId: string
  academicYearId: string
  type: RecoveryType
  score: number | null
}

export interface SaveDecisionInput {
  studentId: string
  academicYearId: string
  status: PromotionStatus
  notes?: string | null
}

export const promotionApi = {
  getByParallel: (parallelId: string, yearId: string) =>
    apiGet<ParallelPromotion>(`parallels/${parallelId}/promotion`, { yearId }),

  saveRecovery: (data: SaveRecoveryInput) => apiPut('promotion/recovery', data),

  saveDecision: (data: SaveDecisionInput) => apiPut('promotion/decision', data),
}
