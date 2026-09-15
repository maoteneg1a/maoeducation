import { apiClient, apiGet, apiPost } from '@/shared/lib/api-client'

export interface AiConfig {
  enabled: boolean
  model: string
  monthlyTokenCap: number
}

export interface DraftedSaber {
  id: string
  type: 'declarativo' | 'procedimental' | 'actitudinal'
  code: string
  description: string
}

export interface DraftWeekResult {
  competenciasEspecificas: string
  indicadoresEvaluacion: string
  newSabers: DraftedSaber[]
  reusedSaberIds: string[]
  momentos: {
    anticipacion: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
    construccionConocimiento: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
    consolidacion: { estrategiasDua: string; recursos: string; tecnica: string; instrumento: string }
  }
}

export interface DraftedProjectContribution {
  contributionId: string
  contribucion: string
  responsabilidad: string
  skillIds: string[]
  newSabers: DraftedSaber[]
  reusedSaberIds: string[]
  weeks: {
    weekNumber: number
    weekProposito: string
    faseInicio: string
    faseDesarrollo: string
    faseCierre: string
    propositoPedagogico: string
    evidencias: string
  }[]
}

export interface DraftProjectResult {
  situacionReto: string
  contexto: string
  propositoComun: string
  productoFinal: string
  contributions: DraftedProjectContribution[]
}

export const aiAssistantApi = {
  getAiConfig: () => apiGet<AiConfig>('institution/ai-config'),

  draftWeek: (data: { situationId: string; skillIds: string[]; weekName?: string }) =>
    apiPost<DraftWeekResult>('ai-assistant/draft-week', data),

  /** Genera y guarda TODO el proyecto interdisciplinario a partir de un prompt/idea breve. */
  draftProject: (data: { projectId: string; prompt?: string }) =>
    apiClient.post('ai-assistant/draft-project', { json: data, timeout: 120000 }).json<DraftProjectResult>(),
}
