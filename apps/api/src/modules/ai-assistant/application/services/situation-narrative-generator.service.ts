import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildSituationTitle } from '../../../planning/domain/situation-title'

/**
 * Título+descripción de una situación de aprendizaje redactados por IA, en
 * vez de la concatenación mecánica "CÓDIGO — texto de competencia truncado"
 * (situation-title.ts::buildSituationTitle, que sigue siendo el fallback si
 * la IA no está disponible o falla — ver generateSituationNarrativeSafe).
 *
 * Se confirmó contra TIGA (multigrade_context_generator equivalente) que no
 * existe un prompt de referencia que copiar — TIGA resuelve esto con un
 * motor de reglas/plantillas fijas por perfil de verbo (cero IA, cero
 * costo). Esta función es una mejora deliberada de producto sobre TIGA, no
 * una migración. Mismo patrón (schema minimalista, reintentos, validación
 * por palabras/no-repetición) ya usado y probado en
 * multigrade-week-generator.service.ts::ensureSharedExperience.
 */

const institutionRepo = new PrismaInstitutionRepository()

const MAX_ATTEMPTS = 2
const MIN_WORDS = 6

const NARRATIVE_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['title', 'description'],
  additionalProperties: false,
}

export interface SituationNarrativeContext {
  subjectName: string
  gradeName: string
  periodName: string
  competencyTexts: string[]
  saberDescriptions: string[]
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

async function generateSituationNarrative(
  institutionId: string,
  actorId: string,
  aiModel: string,
  resourceId: string,
  context: SituationNarrativeContext,
): Promise<{ title: string; description: string } | null> {
  const competenciesBlock = context.competencyTexts.map((t, i) => `${i + 1}. ${t}`).join('\n')
  const saberesBlock = context.saberDescriptions.slice(0, 20).map((s) => `- ${s}`).join('\n')

  const systemPrompt = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a titular y describir una SITUACIÓN DE APRENDIZAJE del Currículo Nacional por Competencias (CNC) del MINEDUC.

Asignatura: ${context.subjectName}
Grado/Curso: ${context.gradeName}
Trimestre: ${context.periodName}

Competencia(s) que cubre esta situación de aprendizaje:
${competenciesBlock}

Saberes reales asociados (muestra):
${saberesBlock || '(sin saberes específicos todavía)'}

Genera con la herramienta:
1. title: título corto (estilo situación/reto de aprendizaje, no una simple etiqueta) — NUNCA copies literalmente el texto de la competencia, redacta con tus propias palabras manteniendo el sentido pedagógico real.
2. description: 2-4 líneas describiendo la situación de aprendizaje que vivirán los estudiantes — qué explorarán, harán o resolverán, conectado a la competencia y los saberes dados. Texto DISTINTO en palabras de "title" (no repitas frases).

Reglas estrictas: no inventes contenido curricular fuera de lo dado; no repitas frases entre title/description.`

  const client = getAnthropicClient()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Genera el título y la descripción de esta situación de aprendizaje.' },
  ]
  let lastErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message | undefined
    try {
      response = await client.messages.create({
        model: aiModel,
        max_tokens: 1024,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
        tools: [{ name: 'submit_situation_narrative', description: 'Envía el título y descripción', input_schema: NARRATIVE_SCHEMA }],
        tool_choice: { type: 'auto' },
      })
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined
      lastErrors = [`API_ERROR_${status ?? 'UNKNOWN'}`]
      if (status === 401 || status === 403 || status === 429) break
      continue
    }

    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: actorId,
        action: 'ai.draft_situation_narrative',
        resourceType: 'learning_situation',
        resourceId,
        newValue: {
          model: aiModel,
          attempt,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastErrors = ['NO_TOOL_USE_RETURNED']
      messages.push({ role: 'assistant', content: response.content })
      messages.push({ role: 'user', content: 'Debes llamar a submit_situation_narrative — no respondas con texto libre.' })
      continue
    }

    const raw = toolUse.input as { title?: string; description?: string }
    const errors: string[] = []
    if (!raw.title || typeof raw.title !== 'string' || wordCount(raw.title) < 2) errors.push('TITLE_TOO_SHORT_OR_MISSING')
    if (!raw.description || typeof raw.description !== 'string' || wordCount(raw.description) < MIN_WORDS) {
      errors.push('DESCRIPTION_TOO_SHORT_OR_MISSING')
    }
    if (raw.title && raw.description && raw.title.trim().toLowerCase() === raw.description.trim().toLowerCase()) {
      errors.push('FIELDS_REPEATED')
    }

    if (errors.length === 0) {
      return { title: raw.title!.trim(), description: raw.description!.trim() }
    }
    lastErrors = errors
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Corrige ÚNICAMENTE estos errores y vuelve a llamar la herramienta con el resultado completo corregido: ${errors.join(', ')}.`,
        },
      ],
    })
  }

  console.warn(`[generateSituationNarrative] sin resultado tras ${MAX_ATTEMPTS} intentos — errores: ${lastErrors.join(', ')}`)
  return null
}

/**
 * Igual que generateSituationNarrative pero NUNCA lanza ni bloquea: si la IA
 * no está configurada/habilitada o falla tras los reintentos, cae al título
 * mecánico de siempre (buildSituationTitle) con description null — a
 * diferencia de la experiencia común multigrado (crítica para ese flujo),
 * aquí es una mejora cosmética, nunca debe impedir crear la situación.
 */
export async function generateSituationNarrativeSafe(
  institutionId: string,
  actorId: string,
  resourceId: string,
  anchorCode: string,
  anchorText: string,
  context: SituationNarrativeContext,
): Promise<{ title: string; description: string | null }> {
  const fallback = { title: buildSituationTitle(anchorCode, anchorText), description: null }
  if (!isAnthropicConfigured()) return fallback

  try {
    const aiConfig = await institutionRepo.getAiConfig(institutionId)
    if (!aiConfig.enabled) return fallback
    const generated = await generateSituationNarrative(institutionId, actorId, aiConfig.model, resourceId, context)
    if (!generated) return fallback
    return { title: generated.title.slice(0, 200), description: generated.description }
  } catch (error) {
    console.warn('[generateSituationNarrativeSafe] fallback por error inesperado:', error)
    return fallback
  }
}
