import { apiGet, apiPost, apiPut } from '@/shared/lib/api-client'

// ── Tipos espejo de apps/api/src/shared/domain/agreement-rules.ts ──────────

export type Sostenimiento = 'fiscal' | 'particular' | 'fiscomisional' | 'municipal'
export type AcademicRegimeCode = 'SIERRA_AMAZONIA' | 'COSTA_GALAPAGOS'
export type NormativeFramework = 'MINEDEC-2026-00082-A' | 'LEGACY'
export type SubnivelCode = 'inicial' | 'preparatoria' | 'elemental' | 'media' | 'superior' | 'bgu'

export interface NormativeProfile {
  sostenimiento: Sostenimiento
  regime: AcademicRegimeCode
  framework: NormativeFramework
  frameworkByYear: Record<string, NormativeFramework>
}

export interface ImprovementRule {
  enabled: boolean
  min: number
  max: number
  cap: number
  perSubject: number
  perYear: number
}

export interface AgreementRules {
  decimals: { places: number; method: 'truncate' | 'round' }
  earlyAlert: {
    source: 'formative' | 'period_total'
    moment: 'live' | 'period_close'
    quantitativeMin: number
    quantitativeMax: number
    qualitativeCodes: string[]
    qualitativeSubniveles: SubnivelCode[]
    excludedSubniveles: SubnivelCode[]
  }
  formativeReinforcement: { method: 'average' | 'replace'; cap: number | null }
  summativeImprovement: { direct: ImprovementRule; withReinforcement: ImprovementRule }
  periodRecovery: { method: 'average' | 'replace_if_higher'; cap: number | null }
  lateAssessment: { unjustifiedScore: number; applyTo: 'summative' | 'all' }
  promotion: {
    automaticSubniveles: SubnivelCode[]
    minToPass: number
    supletorioMin: number
    supletorioMax: number
    supletorioCap: number
    directRepeatMax: number
    directRepeatSubniveles: SubnivelCode[]
    juntaDecisionSubniveles: SubnivelCode[]
  }
  weights: { formative: number; summative: number }
}

export interface ComplianceWarning {
  code: string
  message: string
  article: string
}

export interface NormativeProfileResponse {
  profile: NormativeProfile
  rules: AgreementRules
  preset: AgreementRules
  warnings: ComplianceWarning[]
  years: Array<{ id: string; name: string; isActive: boolean }>
  options: { sostenimientos: Sostenimiento[]; frameworks: NormativeFramework[]; subniveles: SubnivelCode[] }
}

// ── Tipos espejo de apps/api/src/shared/domain/reports-flow.ts ─────────────

export type InstanceResolver = 'tutor_of_parallel' | 'teachers_of_parallel' | 'role' | 'users' | 'guardians_of_student'
export type ReportScope = 'student' | 'parallel' | 'institution'
export type ReportFieldType = 'text' | 'textarea' | 'date'
export type ReportSnapshotSource = 'none' | 'grades' | 'reinforcement_case' | 'reinforcement_sessions'
export type DossierSource = 'formal_report' | 'parent_meetings' | 'reinforcement_case' | 'enrollment_adaptation'

export interface ReportInstance {
  key: string
  label: string
  resolver: InstanceResolver
  role?: string
  userIds?: string[]
}

export interface ReportField {
  key: string
  label: string
  type: ReportFieldType
  required: boolean
  placeholder?: string
}

export interface ReportTypeConfig {
  key: string
  label: string
  description?: string
  enabled: boolean
  scope: ReportScope
  authorRoles: string[]
  to: string
  triggeredByAlert: boolean
  requiresReinforcementCase: boolean
  snapshot: ReportSnapshotSource
  fields: ReportField[]
  ackDeadlineDays: number
  escalateTo?: string | null
  confidential: boolean
  canDeriveTo: string[]
  pdfTitle: string
  pdfFooter?: string
  signatures: string[]
}

export interface DossierItem {
  key: string
  label: string
  source: DossierSource
  reportType?: string
  minCount: number
  perSubject: boolean
  optional: boolean
}

export interface AttachmentCategory {
  key: string
  label: string
  visibleToRoles: string[]
}

export interface ReportsFlowConfig {
  folioPrefix: string
  instances: ReportInstance[]
  reportTypes: ReportTypeConfig[]
  dossier: { enabled: boolean; subniveles: string[]; items: DossierItem[] }
  attachments: { maxSizeMb: number; allowedMime: string[]; uploaderRoles: string[]; categories: AttachmentCategory[] }
}

export interface ReportsFlowResponse {
  config: ReportsFlowConfig
  defaults: ReportsFlowConfig
  roles: Array<{ name: string; label: string }>
}

export interface InstitutionUserOption {
  id: string
  fullName: string
  email: string
  roles: string[]
  isActive: boolean
}

// ── Etiquetas compartidas ─────────────────────────────────────────────────

export const SUBNIVEL_LABEL: Record<SubnivelCode, string> = {
  inicial: 'Inicial',
  preparatoria: 'Preparatoria',
  elemental: 'Elemental',
  media: 'Media',
  superior: 'Superior',
  bgu: 'Bachillerato',
}

export const FRAMEWORK_LABEL: Record<NormativeFramework, string> = {
  'MINEDEC-2026-00082-A': 'Acuerdo MINEDEC-2026-00082-A',
  LEGACY: 'Marco anterior (2024-00031-A)',
}

export const SOSTENIMIENTO_LABEL: Record<Sostenimiento, string> = {
  fiscal: 'Fiscal',
  particular: 'Particular',
  fiscomisional: 'Fiscomisional',
  municipal: 'Municipal',
}

export const REGIME_LABEL: Record<AcademicRegimeCode, string> = {
  SIERRA_AMAZONIA: 'Sierra – Amazonía',
  COSTA_GALAPAGOS: 'Costa – Galápagos',
}

export const RESOLVER_LABEL: Record<InstanceResolver, string> = {
  tutor_of_parallel: 'Tutor del paralelo del estudiante',
  teachers_of_parallel: 'Docentes del paralelo',
  role: 'Usuarios con un rol',
  users: 'Usuarios específicos',
  guardians_of_student: 'Representantes del estudiante',
}

export const SNAPSHOT_LABEL: Record<ReportSnapshotSource, string> = {
  none: 'Ninguno',
  grades: 'Notas del periodo (motor de notas)',
  reinforcement_case: 'Resumen del caso de refuerzo',
  reinforcement_sessions: 'Asistencia a sesiones de refuerzo',
}

export const SCOPE_LABEL: Record<ReportScope, string> = {
  student: 'Por estudiante',
  parallel: 'Por paralelo',
  institution: 'Institucional',
}

export const DOSSIER_SOURCE_LABEL: Record<DossierSource, string> = {
  formal_report: 'Informe formal',
  parent_meetings: 'Actas de reunión con el representante',
  reinforcement_case: 'Casos de refuerzo',
  enrollment_adaptation: 'Adaptación curricular de la matrícula',
}

// ── Cliente ───────────────────────────────────────────────────────────────

export const normativeApi = {
  getProfile: () => apiGet<NormativeProfileResponse>('institution/normative-profile'),
  updateProfile: (dto: { profile?: Partial<NormativeProfile>; rules?: AgreementRules }) =>
    apiPut<NormativeProfileResponse>('institution/normative-profile', dto),
  applyPreset: (dto: { includeWeights: boolean; includeScales: boolean }) =>
    apiPost<NormativeProfileResponse>('institution/normative-profile/apply-preset', dto),
  getReportsFlow: () => apiGet<ReportsFlowResponse>('institution/reports-flow'),
  updateReportsFlow: (config: ReportsFlowConfig) => apiPut<ReportsFlowResponse>('institution/reports-flow', config),
  resetReportsFlow: () => apiPost<ReportsFlowResponse>('institution/reports-flow/reset'),
  /** Personal de la institución (para instancias "Usuarios específicos"). */
  listUsers: () =>
    apiGet<{ data: InstitutionUserOption[]; total: number }>('users', { limit: 200 }).then((r) =>
      r.data.filter((u) => !u.roles.every((role) => role === 'guardian' || role === 'student')),
    ),
}
