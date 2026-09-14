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
  curriculumSkillId: string
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
  skills?: { curriculumSkillId: string; averageAtDetection?: number | null; notes?: string }[]
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
  skills?: { curriculumSkillId: string; averageAtDetection?: number | null; notes?: string }[]
}

export interface ListReinforcementPlansQuery {
  courseAssignmentId: string
  academicPeriodId: string
}
