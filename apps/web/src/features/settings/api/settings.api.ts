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
}
