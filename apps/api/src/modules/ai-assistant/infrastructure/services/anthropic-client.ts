import Anthropic from '@anthropic-ai/sdk'
import { env } from '../../../../config/env'

let client: Anthropic | null = null

/** Cliente único server-side (una sola API key para toda la plataforma — nunca BYOK). */
export function getAnthropicClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY no configurada — el asistente IA no está disponible')
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  }
  return client
}

export function isAnthropicConfigured(): boolean {
  return !!env.ANTHROPIC_API_KEY
}
