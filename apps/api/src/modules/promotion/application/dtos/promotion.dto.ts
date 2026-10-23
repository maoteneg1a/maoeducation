// automatic | repeat_direct | junta: solo con el Acuerdo 2026-00082-A activo
export type SubjectStatus = 'approved' | 'supletorio' | 'remedial' | 'pending' | 'automatic' | 'repeat_direct' | 'junta'
// junta_review: no alcanzó 7 tras el supletorio en un subnivel donde decide la junta (arts. 23 y 27)
export type EffectiveStatus = 'passed' | 'failed' | 'recovery_pending' | 'pending' | 'junta_review'
export type PromotionStatus = 'promoted' | 'not_promoted' | 'pending'
export type RecoveryType = 'supletorio' | 'remedial' | 'gracia'

export interface PromotionSubjectDto {
  assignmentId: string
  subjectName: string
  annualAvg: number | null
  /** Promedio final tras supletorio (con el tope configurado). Igual a annualAvg si no hubo. */
  finalAvg: number | null
  status: SubjectStatus
  recovery: { type: RecoveryType; score: number } | null
  effectiveStatus: EffectiveStatus
}

export interface PromotionStudentDto {
  studentId: string
  studentName: string
  subjects: PromotionSubjectDto[]
  failedCount: number
  suggestedStatus: PromotionStatus
  decision: { status: PromotionStatus; notes: string | null } | null
}

export interface ParallelPromotionDto {
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
  students: PromotionStudentDto[]
  periodsTotal: number
  periodsClosed: number
  /** true ⇔ todos los periodos del año están cerrados; habilita la captura de recuperaciones. */
  recoveryEnabled: boolean
  /** Reglas del acuerdo activas para el año (null = marco anterior). */
  agreement: { framework: 'MINEDEC-2026-00082-A'; subnivel: string | null; supletorioCap: number; directRepeatMax: number; decimals: { places: number; method: 'truncate' | 'round' } } | null
}

export interface SaveRecoveryDto {
  studentId: string
  courseAssignmentId: string
  academicYearId: string
  type: RecoveryType
  score: number | null // null borra la recuperación
}

export interface SaveDecisionDto {
  studentId: string
  academicYearId: string
  status: PromotionStatus
  notes?: string | null
}
