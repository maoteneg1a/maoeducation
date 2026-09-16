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

/** Una actividad numerada dentro de una fase — cada una con su propio código DUA (formato CNC/TIGA). */
export interface CompetencyActivity {
  text: string
  duaCode: string
}
export interface CompetencyPhase {
  activities: CompetencyActivity[]
}
/** Fases "Inicio/Desarrollo/Cierre" (nombres finales, sin necesidad de mapeo de labels como en destrezas) — recursos y evaluación consolidados UNA vez por semana, no repetidos por fase. */
export interface CompetencyWeekMomentos {
  fases: {
    inicio?: CompetencyPhase
    desarrollo?: CompetencyPhase
    cierre?: CompetencyPhase
  }
  recursos: string[]
  recursoLink?: { title: string; url: string }
  evaluacion: {
    evidencia: string
    criterio: string
    instrumento: string
    instrumentoLink?: { title: string; url: string }
  }
}

export interface DraftCompetencyWeekResult {
  indicadoresEvaluacion: string
  newSabers: DraftedSaber[]
  reusedSaberIds: string[]
  momentos: CompetencyWeekMomentos
  generationMode: 'AI_ENHANCED' | 'AI_FALLBACK'
  validationErrors: string[]
}

export interface DraftedBlockWeek {
  weekId: string
  weekNumber: number
  result: DraftWeekResult | DraftCompetencyWeekResult
}

export interface DraftSituationBlockResult {
  weeks: DraftedBlockWeek[]
}

export interface DraftedProjectContribution {
  contributionId: string
  contribucion: string
  responsabilidad: string
  skillIds: string[]
  competencyIds: string[]
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

  /** Igual que draftWeek pero para el modelo por competencias (motor en dos capas: IA validada + fallback determinista). */
  // 120s: la generación con IA puede reintentar hasta 2 veces contra Anthropic
  // (validación + corrección) — el timeout default de 30s del cliente corta la
  // conexión antes de que el backend termine, aunque este sí complete bien.
  draftCompetencyWeek: (data: { situationId: string; competencyIds: string[]; weekName?: string; weekNumber?: number }) =>
    apiPost<DraftCompetencyWeekResult>('ai-assistant/draft-competency-week', data, { timeout: 120000 }),

  /** Estilo TIGA: genera y guarda de una vez las N semanas de un bloque completo (una llamada de IA por semana, en el servidor). */
  draftSituationBlock: (data: { situationId: string; weeksCount: number; skillIds?: string[]; competencyIds?: string[] }) =>
    apiClient.post('ai-assistant/draft-situation-block', { json: data, timeout: 180000 }).json<DraftSituationBlockResult>(),

  /** Genera y guarda TODO el proyecto interdisciplinario a partir de un prompt/idea breve. */
  draftProject: (data: { projectId: string; prompt?: string }) =>
    apiClient.post('ai-assistant/draft-project', { json: data, timeout: 120000 }).json<DraftProjectResult>(),
}
