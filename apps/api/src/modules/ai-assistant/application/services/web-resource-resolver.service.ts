import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '../../infrastructure/services/anthropic-client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { estimateCostUsd } from './ai-pricing'

export interface ResolvedWebResource {
  url: string
  title: string
}

const MAX_RESUMES = 1

/**
 * Resuelve UNA búsqueda web de forma aislada — sin el contexto pedagógico
 * completo de la generación de la semana. Antes, `web_search` vivía dentro de
 * la misma llamada que genera toda la planificación (draftCompetencyWeek):
 * cuando el modelo decidía buscar, Anthropic pausaba el turno (`pause_turn`) y
 * había que reenviar TODO el historial (system + catálogos + competencias)
 * para continuar — hasta 2 veces por intento, multiplicando el costo de la
 * llamada más cara del módulo solo para resolver un link de recurso. Aislar
 * la búsqueda aquí significa que, si pausa/resume, solo se reenvía este
 * mensaje chico — nunca el contexto pedagógico.
 *
 * Toma el primer resultado del bloque `web_search_tool_result` directamente
 * (ya viene rankeado por Anthropic) — no le pide al modelo que redacte una
 * respuesta final, así que no se paga output extra de texto libre.
 */
export interface WebResourceResolverContext {
  institutionId: string
  userId: string
  resourceId: string
}

export async function resolveWebResource(
  model: string,
  query: string,
  ctx: WebResourceResolverContext,
): Promise<ResolvedWebResource | null> {
  const client = getAnthropicClient()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `Busca: "${query}". No respondas texto, solo usa la herramienta de búsqueda.` },
  ]
  let requestCount = 0
  let inputTokens = 0
  let outputTokens = 0
  let webSearches = 0
  let found: ResolvedWebResource | null = null

  for (let resumes = 0; resumes <= MAX_RESUMES; resumes++) {
    let response: Anthropic.Message
    try {
      requestCount++
      response = await client.messages.create({
        model,
        max_tokens: 200,
        messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 1, allowed_callers: ['direct'] }],
        tool_choice: { type: 'auto' },
      })
    } catch (error) {
      console.warn('[resolveWebResource] error de API, se omite el link:', error)
      break
    }

    inputTokens += response.usage.input_tokens
    outputTokens += response.usage.output_tokens

    for (const block of response.content) {
      // block.content es un error de búsqueda (objeto) o un array de resultados —
      // hay que distinguir antes de indexar (no lanza excepción, solo cambia forma).
      if (block.type === 'web_search_tool_result') {
        webSearches++
        if (Array.isArray(block.content) && block.content.length > 0) {
          const first = block.content[0]
          found = { url: first.url, title: first.title || query }
        }
      }
    }
    if (found) break
    if (response.stop_reason !== 'pause_turn') break
    messages.push({ role: 'assistant', content: response.content })
  }

  // Log aparte de la generación pedagógica principal — antes esta búsqueda
  // vivía DENTRO de esa llamada y su costo quedaba invisible mezclado con el
  // resto; ahora se puede ver cuánto cuesta resolver recursos web por sí solo.
  await prisma.auditLog.create({
    data: {
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      action: 'ai.resolve_web_resource',
      resourceType: 'learning_situation',
      resourceId: ctx.resourceId,
      newValue: {
        model,
        requests: requestCount,
        webSearches,
        inputTokens,
        outputTokens,
        found: !!found,
        estimatedCostUsd: estimateCostUsd({ model, inputTokens, outputTokens, webSearches }),
      },
    },
  })

  return found
}
