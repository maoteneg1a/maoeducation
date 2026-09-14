export interface InstitutionBranding {
  logoUrl?: string | null
  primaryColor?: string | null // HSL string, ej. "221 83% 53%"
  sidebarColor?: string | null // HSL string
}

export interface InstitutionSettingsDto {
  id: string
  name: string
  code: string
  branding: InstitutionBranding
}

export interface UpdateInstitutionSettingsDto {
  name?: string
  branding?: InstitutionBranding
}

// ---- Configuración de calificación (MINEDUC, parametrizable) ----

export interface QualitativeLevel {
  min: number
  max: number
  code: string
  label: string
}

export interface BehaviorLevel {
  code: string
  label: string
}

export interface PromotionConfig {
  minToPass: number // nota mínima para aprobar (ej. 7)
  supletorioMin: number // desde (inclusive) → va a supletorio
  supletorioMax: number // hasta (inclusive) → va a supletorio
  passWithExam: number // nota con la que aprueba tras el supletorio
  maxFailedSubjects: number // materias reprobadas permitidas antes de repetir
}

export interface PedagogicRecoveryConfig {
  /** Cómo se aplica la nota de recuperación al total del período:
   *  - replace_if_higher: reemplaza si es mayor (MINEDUC estándar)
   *  - average: promedia nota original + recuperación */
  mode: 'replace_if_higher' | 'average'
}

export interface GradingConfig {
  qualitativeScale: QualitativeLevel[]
  behaviorScale: BehaviorLevel[]
  promotion: PromotionConfig
  defaultExamWeight: number
  pedagogicRecovery: PedagogicRecoveryConfig
}

export interface UpdateGradingConfigDto {
  qualitativeScale?: QualitativeLevel[]
  behaviorScale?: BehaviorLevel[]
  promotion?: Partial<PromotionConfig>
  defaultExamWeight?: number
  pedagogicRecovery?: Partial<PedagogicRecoveryConfig>
}

// ---- Asistente IA de planificaciones (configurable por institución) ----

export interface AiConfig {
  /** El admin debe activarlo explícitamente — apagado por defecto. */
  enabled: boolean
  model: string
  /** Tope mensual de tokens (input+output) para esta institución. 0 = sin tope. */
  monthlyTokenCap: number
}

export interface UpdateAiConfigDto {
  enabled?: boolean
  model?: string
  monthlyTokenCap?: number
}
