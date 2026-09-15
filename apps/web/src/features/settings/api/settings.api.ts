import { apiGet, apiPut } from '@/shared/lib/api-client'
import { apiClient } from '@/shared/lib/api-client'
import type { InstitutionBranding } from '@/store/auth.store'

export interface InstitutionSettings {
  id: string
  name: string
  code: string
  branding: InstitutionBranding
}

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
  minToPass: number
  supletorioMin: number
  supletorioMax: number
  passWithExam: number
  maxFailedSubjects: number
}
export interface PedagogicRecoveryConfig {
  mode: 'replace_if_higher' | 'average'
}

export interface GradingConfig {
  gradingScaleMax: number
  qualitativeScale: QualitativeLevel[]
  behaviorScale: BehaviorLevel[]
  promotion: PromotionConfig
  defaultExamWeight: number
  pedagogicRecovery: PedagogicRecoveryConfig
}

export interface AiConfig {
  enabled: boolean
  model: string
  monthlyTokenCap: number
}

export type PlanningModel = 'destrezas' | 'competencias'

export type SaberType = 'declarativo' | 'procedimental' | 'actitudinal'
export type WeekLayout = 'table_per_week' | 'rows_in_single_table'

export interface PhaseLabels {
  anticipacion: string
  construccionConocimiento: string
  consolidacion: string
}

export interface MicrocurricularTemplateConfig {
  headerColor: string
  headerColor2: string
  watermarkEnabled: boolean
  phaseLabels: PhaseLabels
  saberesOrder: SaberType[]
  weekLayout: WeekLayout
  sectionOrder: string[]
  hiddenSections: string[]
}

export const settingsApi = {
  getSettings: () => apiGet<InstitutionSettings>('institution/settings'),

  updateSettings: (data: { name?: string; branding?: Partial<InstitutionBranding> }) =>
    apiPut<InstitutionSettings>('institution/settings', data),

  uploadLogo: async (file: File): Promise<{ logoUrl: string }> => {
    const form = new FormData()
    form.append('file', file)
    return apiClient.post('institution/logo', { body: form }).json<{ logoUrl: string }>()
  },

  getGradingConfig: () => apiGet<GradingConfig>('institution/grading-config'),
  updateGradingConfig: (data: GradingConfig) =>
    apiPut<GradingConfig>('institution/grading-config', data),

  getMicrocurricularTemplate: () =>
    apiGet<MicrocurricularTemplateConfig>('institution/document-templates/microcurricular'),
  updateMicrocurricularTemplate: (data: Partial<MicrocurricularTemplateConfig>) =>
    apiPut<MicrocurricularTemplateConfig>('institution/document-templates/microcurricular', data),

  getAiConfig: () => apiGet<AiConfig>('institution/ai-config'),
  updateAiConfig: (data: Partial<AiConfig>) => apiPut<AiConfig>('institution/ai-config', data),

  getPlanningModel: () => apiGet<{ planningModel: PlanningModel }>('institution/planning-model'),
  updatePlanningModel: (planningModel: PlanningModel) =>
    apiPut<{ planningModel: PlanningModel }>('institution/planning-model', { planningModel }),
}
