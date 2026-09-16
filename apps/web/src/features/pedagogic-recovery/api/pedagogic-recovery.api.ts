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
  curriculumSkillId?: string
  competencyId?: string
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
  curriculumSkill: { id: string; code: string; description: string } | null
  competency: { id: string; code: string; text: string } | null
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
  skills?: { curriculumSkillId?: string; competencyId?: string; averageAtDetection?: number | null; notes?: string }[]
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
    skills: { curriculumSkillId?: string; competencyId?: string; averageAtDetection?: number | null; notes?: string }[]
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

// ─── Flujo completo de refuerzo pedagógico (motor TIGA) ────────────────────
// Máquina de estados DETECTED→PLANNED→IN_REINFORCEMENT→EVALUATED→
// {CLOSED|CONTINUES_REINFORCEMENT} sobre el mismo tipo de plan (planType="academico").

export type ReinforcementCaseStatus =
  | 'DETECTED'
  | 'PLANNED'
  | 'IN_REINFORCEMENT'
  | 'EVALUATED'
  | 'CLOSED'
  | 'CONTINUES_REINFORCEMENT'

export const DETECTION_SOURCES: Record<string, string> = {
  DIAGNOSTIC_ASSESSMENT: 'Evaluación diagnóstica',
  FORMATIVE_ASSESSMENT: 'Evaluación formativa',
  SUMMATIVE_ASSESSMENT: 'Evaluación sumativa',
  TEACHER_OBSERVATION: 'Observación docente',
  EVIDENCE_PRODUCT: 'Evidencia o producto',
  NOT_CONSOLIDATED: 'Aprendizaje no consolidado',
  OTHER: 'Otro',
}

export const PEDAGOGICAL_NEEDS: Record<string, string> = {
  UNDERSTANDING: 'Comprensión del aprendizaje trabajado',
  APPLICATION_PROCEDURE: 'Aplicación o procedimiento',
  REASONING_PROBLEM_SOLVING: 'Razonamiento y resolución de problemas',
  PRODUCTION_COMMUNICATION: 'Producción o comunicación',
  AUTONOMY: 'Autonomía',
  LEARNING_PACE: 'Ritmo de aprendizaje',
  PARTICIPATION: 'Participación',
  ACTIVITY_COMPLETION: 'Desarrollo/cumplimiento de actividades',
  OTHER: 'Otra necesidad pedagógica',
}

export const COMMUNICATION_MEDIA: Record<string, string> = {
  MEETING: 'Reunión',
  CALL: 'Llamada',
  INSTITUTIONAL_MESSAGE: 'Mensaje institucional',
  WRITTEN_COMMUNICATION: 'Comunicación escrita',
  OTHER: 'Otro',
}

export const COMMITMENT_TYPES: Record<string, string> = {
  ACTIVITY_SUPPORT: 'Acompañamiento en actividades',
  ATTENDANCE: 'Asistencia',
  HOME_PRACTICE: 'Práctica/refuerzo en casa',
  ACTIVITY_REVIEW: 'Revisión de actividades/tareas',
  OTHER: 'Otro',
}

export interface ReinforcementUnit {
  id: string
  temporalIndex: number
  phase: string
  learningFocus: string
  specificObjective: string
  strategy: string
  concreteActivity: string
  requiredResource: string
  observableEvidence: string
  evaluationMechanism: string
  frequency: string | null
  advancementCriterion: string
  nextStep: string
}

export interface ReinforcementCommunicationItem {
  id: string
  date: string
  mediumCode: string
  mediumLabel: string
  recipient: string
  institutionalText: string
}

export interface ReinforcementCommitmentItem {
  id: string
  commitmentCode: string
  commitmentLabel: string
  responsible: string
  targetDate: string | null
  note: string | null
}

export interface ReinforcementFollowUpItem {
  id: string
  date: string
  strategyApplied: string
  evidence: string
  observation: string
  activityApplied: string | null
  supportOrAdjustment: string | null
  observedProgress: string | null
  persistentDifficulty: string | null
  nextAction: string | null
}

export interface ReinforcementOutcomeItem {
  id: string
  studentId: string
  result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED'
  assessmentValue: string | null
  observation: string | null
  student: { id: string; profile: { firstName: string; lastName: string } | null }
}

export interface ReinforcementReevaluationItem {
  id: string
  date: string
  evaluation: string
  persistentDifficulty: boolean
  institutionalSupportSuggestion: string | null
  pedagogicalDecision: string | null
  outcomes: ReinforcementOutcomeItem[]
}

export interface ReinforcementCase {
  id: string
  studentId: string
  courseAssignmentId: string
  academicPeriodId: string
  caseStatus: ReinforcementCaseStatus
  mode: 'INDIVIDUAL' | 'GROUP'
  cycleNumber: number
  rootCaseId: string | null
  previousCaseId: string | null
  reinforcementDurationWeeks: number | null
  reinforcementFrequency: string | null
  detectionSourceCode: string | null
  detectionObservation: string | null
  detectionInitialResult: string | null
  needCodes: string[]
  needObservation: string | null
  learningTargetTitle: string | null
  learningTargetDescription: string | null
  proposalLearningToReinforce: string | null
  proposalObjective: string | null
  proposalActiveStrategy: string | null
  proposalConcreteActivity: string | null
  proposalResource: string | null
  proposalEvidence: string | null
  proposalEvaluation: string | null
  proposalDurationFrequency: string | null
  proposalExpectedResult: string | null
  proposalTeacherConfirmed: boolean
  student: { id: string; profile: { firstName: string; lastName: string } | null }
  participants: { id: string; studentId: string; student: { id: string; profile: { firstName: string; lastName: string } | null } }[]
  units: ReinforcementUnit[]
  communications: ReinforcementCommunicationItem[]
  commitments: ReinforcementCommitmentItem[]
  followUps: ReinforcementFollowUpItem[]
  reevaluations: ReinforcementReevaluationItem[]
  skills: ReinforcementPlanSkillItem[]
}

export function listReinforcementCases(params: { courseAssignmentId: string; academicPeriodId: string }) {
  return apiGet<ReinforcementCase[]>('pedagogic-recovery/reinforcement-cases', params)
}

export function getReinforcementCase(id: string) {
  return apiGet<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}`)
}

export function createReinforcementCase(data: {
  studentIds: string[]
  courseAssignmentId: string
  academicPeriodId: string
  learningTarget: { title: string; description: string; activities?: string[]; evidence?: string }
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
}) {
  return apiPost<ReinforcementCase>('pedagogic-recovery/reinforcement-cases', data)
}

export function editReinforcementProposal(
  id: string,
  data: Partial<{
    learningToReinforce: string
    objective: string
    activeStrategy: string
    concreteActivity: string
    resource: string
    evidence: string
    evaluation: string
    durationFrequency: string
    expectedResult: string
  }>,
) {
  return apiPut<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/proposal`, data)
}

export function confirmReinforcementPlan(id: string) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/confirm-plan`)
}

export function startReinforcement(id: string) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/start`)
}

export function addReinforcementCommunication(
  id: string,
  data: { mediumCode: string; recipient?: string; text?: string; date?: string },
) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/communications`, data)
}

export function addReinforcementCommitment(
  id: string,
  data: { commitmentCode: string; responsible?: string; targetDate?: string; note?: string },
) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/commitments`, data)
}

export function addReinforcementFollowUp(
  id: string,
  data: {
    strategyApplied: string
    evidence: string
    observation: string
    date?: string
    activityApplied?: string
    supportOrAdjustment?: string
    observedProgress?: string
    persistentDifficulty?: string
    nextAction?: string
  },
) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/follow-ups`, data)
}

export function reevaluateReinforcementCase(
  id: string,
  data: {
    evaluation: string
    outcomes: { studentId: string; result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED'; assessmentValue?: string; observation?: string }[]
    persistentDifficulty?: boolean
    date?: string
    initialResult?: string
    subsequentResult?: string
    observedProgress?: string
    evidence?: string
    pedagogicalDecision?: string
  },
) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/reevaluate`, data)
}

export function confirmReinforcementOutcome(id: string, close: boolean) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/confirm-outcome`, { close })
}

export function createNextReinforcementCycle(id: string, data?: { detectionPeriod?: string; initialResult?: string }) {
  return apiPost<ReinforcementCase>(`pedagogic-recovery/reinforcement-cases/${id}/next-cycle`, data ?? {})
}

export async function openReinforcementCasePdf(id: string) {
  const blob = await apiClient.get(`pedagogic-recovery/reinforcement-cases/${id}/pdf`).blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
