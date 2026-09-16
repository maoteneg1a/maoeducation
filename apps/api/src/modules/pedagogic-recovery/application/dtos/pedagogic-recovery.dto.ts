export interface PedagogicRecoveryQuery {
  parallelId: string
  periodId: string
  yearId: string
}

export interface SavePedagogicRecoveryDto {
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  score: number | null // null = borrar el registro
  notes?: string
}

export interface PedagogicRecoveryStudentRow {
  studentId: string
  studentName: string
  periodTotal: number | null      // nota original del período
  recoveryScore: number | null    // nota de recuperación (null = sin registrar)
  effectiveTotal: number | null   // nota efectiva tras aplicar el modo
  recovered: boolean              // true si la recuperación mejoró la nota
}

export interface PedagogicRecoverySubjectResult {
  assignmentId: string
  subjectName: string
  students: PedagogicRecoveryStudentRow[]
}

export interface PedagogicRecoveryPageDto {
  parallel: { id: string; name: string; level: { name: string } }
  period: { id: string; name: string; isClosed: boolean }
  recoveryMode: 'replace_if_higher' | 'average'
  passingGrade: number
  subjects: PedagogicRecoverySubjectResult[]
}

// ─── Candidatos de refuerzo detectados automáticamente por destreza ────────
// Se agrupan las notas (Grade) por Activity.curriculumSkillId y se comparan
// contra el umbral de aprobación configurado — el docente nunca lo escribe
// a mano, solo revisa y decide si crea la recuperación.

export interface SkillReinforcementQuery {
  courseAssignmentId: string
  academicPeriodId: string
}

export interface SkillReinforcementStudent {
  studentId: string
  studentName: string
  average: number
}

export interface SkillReinforcementCandidate {
  curriculumSkillId?: string
  competencyId?: string
  skillCode: string
  skillDescription: string
  passingGrade: number
  students: SkillReinforcementStudent[]
}

// ─── Plan de Refuerzo Académico Individualizado ────────────────────────────
// Documento formal por estudiante que agrupa las destrezas donde necesita
// refuerzo (detectadas por notas bajas, o por adaptación curricular NEE).

export type ReinforcementPlanType = 'academico' | 'nee'
export type ReinforcementPlanStatus = 'borrador' | 'activo' | 'cerrado'

export interface CreateReinforcementPlanDto {
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  planType: ReinforcementPlanType
  skills?: { curriculumSkillId?: string; competencyId?: string; averageAtDetection?: number | null; notes?: string }[]
  objetivoGeneral?: string
  estrategias?: string
  responsables?: string
  fechaInicio?: string
  fechaSeguimiento?: string
}

export interface UpdateReinforcementPlanDto {
  status?: ReinforcementPlanStatus
  objetivoGeneral?: string
  estrategias?: string
  responsables?: string
  fechaInicio?: string | null
  fechaSeguimiento?: string | null
  observacionesFinales?: string
  skills?: { curriculumSkillId?: string; competencyId?: string; averageAtDetection?: number | null; notes?: string }[]
}

export interface ListReinforcementPlansQuery {
  courseAssignmentId: string
  academicPeriodId: string
}

// ─── Flujo completo de refuerzo pedagógico (motor TIGA) ────────────────────
// Máquina de estados DETECTED→PLANNED→IN_REINFORCEMENT→EVALUATED→
// {CLOSED|CONTINUES_REINFORCEMENT} sobre el mismo ReinforcementPlan (planType
// "academico"). Ver apps/api/src/shared/domain/reinforcement-domain.ts y
// reinforcement-planning-engine.ts.

export interface CreateReinforcementCaseDto {
  studentIds: string[]
  courseAssignmentId: string
  academicPeriodId: string
  // Snapshot neutral del aprendizaje a reforzar — normalmente viene del candidato
  // detectado automáticamente (destreza/competencia + promedio bajo umbral).
  learningTarget: {
    title: string
    description: string
    activities?: string[]
    evidence?: string
  }
  curriculumSkillId?: string
  competencyId?: string
  evaluationInstrument?: string
  evaluationObservedResult?: string
  detectionSourceCode: string
  detectionObservation: string
  detectionEvidenceValue?: string
  detectionPeriod?: string
  detectionInitialResult?: string
  detectionEvidenceOrigin?: string
  psychopedagogicalReportExists?: boolean
  psychopedagogicalAuthorityReference?: string
  needCodes: string[]
  needObservation?: string
  mode?: 'INDIVIDUAL' | 'GROUP'
  teacherConfirmsGroup?: boolean
  reinforcementDurationWeeks: number
  reinforcementFrequency?: string
}

export interface EditReinforcementProposalDto {
  learningToReinforce?: string
  objective?: string
  activeStrategy?: string
  concreteActivity?: string
  resource?: string
  evidence?: string
  evaluation?: string
  durationFrequency?: string
  expectedResult?: string
}

export interface AddReinforcementCommunicationDto {
  mediumCode: string
  recipient?: string
  text?: string
  date?: string
}

export interface AddReinforcementCommitmentDto {
  commitmentCode: string
  responsible?: string
  targetDate?: string
  note?: string
}

export interface AddReinforcementFollowUpDto {
  strategyApplied: string
  evidence: string
  observation: string
  date?: string
  activityApplied?: string
  supportOrAdjustment?: string
  observedProgress?: string
  persistentDifficulty?: string
  nextAction?: string
}

export interface ReinforcementOutcomeDto {
  studentId: string
  result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED'
  assessmentValue?: string
  observation?: string
}

export interface ReevaluateReinforcementCaseDto {
  evaluation: string
  outcomes: ReinforcementOutcomeDto[]
  persistentDifficulty?: boolean
  date?: string
  initialResult?: string
  subsequentResult?: string
  observedProgress?: string
  evidence?: string
  pedagogicalDecision?: string
}

export interface ConfirmReinforcementOutcomeDto {
  close: boolean
}

export interface CreateNextReinforcementCycleDto {
  detectionPeriod?: string
  initialResult?: string
}
