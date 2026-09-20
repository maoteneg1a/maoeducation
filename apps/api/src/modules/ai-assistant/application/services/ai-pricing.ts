/**
 * Tabla de precios de Anthropic centralizada — antes cada análisis de costo
 * (SQL manual, revisiones puntuales) recalculaba el precio a mano, con
 * riesgo de desactualizarse en un solo lugar y no en otro. Única fuente de
 * verdad para estimar el costo de una llamada real.
 *
 * Precios oficiales por millón de tokens (USD), a la fecha de este archivo —
 * revisar contra la Pricing page de Anthropic si se agrega un modelo nuevo.
 */
export interface ModelPricing {
  inputPerMillion: number
  outputPerMillion: number
  cacheReadPerMillion: number
  /** Cache write de 5 minutos (el único TTL usado hoy en el módulo). */
  cacheWritePerMillion: number
  /** USD por 1000 búsquedas web ejecutadas por el server tool web_search. */
  webSearchPerThousand: number
}

const MODEL_PRICING: Record<string, ModelPricing> = {
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 0.3,
    cacheWritePerMillion: 3.75,
    webSearchPerThousand: 10.0,
  },
  'claude-sonnet-5': {
    inputPerMillion: 2.0,
    outputPerMillion: 10.0,
    cacheReadPerMillion: 0.2,
    cacheWritePerMillion: 2.5,
    webSearchPerThousand: 10.0,
  },
  'claude-haiku-4-5': {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheReadPerMillion: 0.1,
    cacheWritePerMillion: 1.25,
    webSearchPerThousand: 10.0,
  },
}

/** Sonnet 4.6 como piso conservador cuando el modelo configurado no está en la tabla — evita subestimar el costo real. */
const FALLBACK_PRICING = MODEL_PRICING['claude-sonnet-4-6']

export function getModelPricing(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING
}

export interface UsageForCost {
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
  webSearches?: number
}

/** Costo estimado en USD de una llamada — input normal + output + cache read/write + búsquedas, todo junto. */
export function estimateCostUsd(usage: UsageForCost): number {
  const pricing = getModelPricing(usage.model)
  const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPerMillion
  const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPerMillion
  const cacheReadCost = ((usage.cacheReadTokens ?? 0) / 1_000_000) * pricing.cacheReadPerMillion
  const cacheWriteCost = ((usage.cacheCreationTokens ?? 0) / 1_000_000) * pricing.cacheWritePerMillion
  const webSearchCost = ((usage.webSearches ?? 0) / 1_000) * pricing.webSearchPerThousand
  return inputCost + outputCost + cacheReadCost + cacheWriteCost + webSearchCost
}
