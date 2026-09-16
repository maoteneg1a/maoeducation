import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildDeterministicMethodology, type DuaStrategyInput } from '../../../../shared/domain/pedagogical-methodology'
import {
  validateGeneratedPedagogy,
  type GeneratedPedagogyPayload,
  type PedagogicalValidationContext,
} from '../../../../shared/domain/pedagogical-validation'
import { resolveWorkload, weeklyPhaseCounts } from '../../../../shared/domain/workload-resolution'
import { buildResourceDocumentPdf, type DocumentSpec } from './resource-document-pdf.service'
import { storage } from '../../../../shared/infrastructure/services/storage.service'
import { env } from '../../../../config/env'
import { randomUUID } from 'crypto'
import type { DraftCompetencyWeekDto, DraftCompetencyWeekResult, DraftedSaber } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const MAX_ATTEMPTS = 2

const DOCUMENT_BLOCK_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string', enum: ['paragraph', 'numbered_lines', 'table', 'blank_space'] },
    text: { type: 'string' },
    count: { type: 'integer' },
    headers: { type: 'array', items: { type: 'string' } },
    rows: { type: 'integer' },
    label: { type: 'string' },
  },
  required: ['type'],
  additionalProperties: false,
}

const RESOURCE_LINK_SCHEMA = {
  type: 'object' as const,
  properties: {
    // web_search: usa la herramienta de búsqueda para encontrar un recurso digital
    // REAL ya publicado (video, artículo, imagen) — nunca inventes una URL sin buscarla.
    // generate_document: el recurso no existe en internet pero es simple de producir
    // (ficha, organizador, guía) — describe su contenido en documentSpec, el sistema
    // genera el PDF y te devuelve su link real.
    kind: { type: 'string', enum: ['web_search', 'generate_document'] },
    searchQuery: { type: 'string' },
    // Solo para kind="web_search": la URL REAL que encontraste con la herramienta de
    // búsqueda web (copia exacta del resultado — nunca la inventes ni la modifiques).
    // Si la búsqueda no encontró nada útil, omite resourceLink por completo en vez
    // de completar resolvedUrl con algo inventado.
    resolvedUrl: { type: 'string' },
    resolvedTitle: { type: 'string' },
    documentSpec: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        instructions: { type: 'string' },
        blocks: { type: 'array', items: DOCUMENT_BLOCK_SCHEMA },
      },
      required: ['title', 'instructions', 'blocks'],
      additionalProperties: false,
    },
  },
  required: ['kind'],
  additionalProperties: false,
}

const PHASE_SCHEMA = {
  type: 'object' as const,
  properties: {
    activity: { type: 'string' },
    duaCodes: { type: 'array', items: { type: 'string' } },
    resources: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
    resourceLink: RESOURCE_LINK_SCHEMA,
  },
  required: ['activity', 'duaCodes', 'resources', 'evidence'],
  additionalProperties: false,
}

const SABER_SCHEMA = {
  type: 'object' as const,
  properties: {
    type: { type: 'string', enum: ['declarativo', 'procedimental', 'actitudinal'] },
    code: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['type', 'code', 'description'],
  additionalProperties: false,
}

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    identityCode: { type: 'string' },
    indicadoresEvaluacion: { type: 'string' },
    newSabers: { type: 'array', items: SABER_SCHEMA },
    reusedSaberIds: { type: 'array', items: { type: 'string' } },
    methodology: {
      type: 'object',
      properties: {
        ANTICIPATION: PHASE_SCHEMA,
        CONSTRUCTION: PHASE_SCHEMA,
        CONSOLIDATION: PHASE_SCHEMA,
      },
      required: ['ANTICIPATION', 'CONSTRUCTION', 'CONSOLIDATION'],
      additionalProperties: false,
    },
    assessment: {
      type: 'object',
      properties: {
        activity: { type: 'string' },
        technique: { type: 'string' },
        instrument: { type: 'string' },
        evidence: { type: 'string' },
        criteria: { type: 'array', items: { type: 'string' } },
      },
      required: ['activity', 'technique', 'instrument', 'evidence', 'criteria'],
      additionalProperties: false,
    },
  },
  required: ['identityCode', 'indicadoresEvaluacion', 'newSabers', 'reusedSaberIds', 'methodology', 'assessment'],
  additionalProperties: false,
}

interface RawResourceLink {
  kind: 'web_search' | 'generate_document'
  searchQuery?: string
  resolvedUrl?: string
  resolvedTitle?: string
  documentSpec?: DocumentSpec
}

interface RawPhase {
  activity: string
  duaCodes: string[]
  resources: string[]
  evidence: string
  resourceLink?: RawResourceLink
}

interface RawGenerationPayload {
  identityCode: string
  indicadoresEvaluacion: string
  newSabers: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  reusedSaberIds: string[]
  methodology: Record<'ANTICIPATION' | 'CONSTRUCTION' | 'CONSOLIDATION', RawPhase>
  assessment: { activity: string; technique: string; instrument: string; evidence: string; criteria: string[] }
}

async function assertBudgetAvailable(institutionId: string, monthlyTokenCap: number) {
  if (monthlyTokenCap <= 0) return
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)
  const logs = await prisma.auditLog.findMany({
    where: { institutionId, action: 'ai.draft_competency_week', createdAt: { gte: startOfMonth } },
    select: { newValue: true },
  })
  const used = logs.reduce((sum, log) => {
    const v = (log.newValue ?? {}) as { inputTokens?: number; outputTokens?: number }
    return sum + (v.inputTokens ?? 0) + (v.outputTokens ?? 0)
  }, 0)
  if (used >= monthlyTokenCap) {
    throw new ForbiddenError('Se alcanzó el tope mensual de uso del asistente IA para esta institución')
  }
}

function toPayload(raw: RawGenerationPayload): GeneratedPedagogyPayload {
  return {
    identityCode: raw.identityCode,
    methodology: [
      { phase: 'ANTICIPATION', ...raw.methodology.ANTICIPATION },
      { phase: 'CONSTRUCTION', ...raw.methodology.CONSTRUCTION },
      { phase: 'CONSOLIDATION', ...raw.methodology.CONSOLIDATION },
    ],
    assessment: raw.assessment,
  }
}

/**
 * Si la fase pidió un resourceLink, produce el texto final del link a embeber en
 * "recursos" — o bien la URL real que Claude ya encontró con web_search, o bien
 * genera el PDF del documentSpec, lo sube al storage, y devuelve su URL pública.
 * Nunca lanza: un fallo aquí (storage caído, etc.) simplemente omite el link,
 * no debe tumbar la generación de la semana completa.
 */
async function resolveResourceLinkText(link: RawResourceLink | undefined): Promise<string | null> {
  if (!link) return null
  try {
    if (link.kind === 'web_search') {
      if (!link.resolvedUrl) return null
      return `${link.resolvedTitle ?? 'Recurso'}: ${link.resolvedUrl}`
    }
    if (link.kind === 'generate_document' && link.documentSpec) {
      const pdf = await buildResourceDocumentPdf(link.documentSpec)
      const key = `planning-resources/${randomUUID()}.pdf`
      await storage.save(key, pdf, 'application/pdf')
      return `${link.documentSpec.title}: ${env.API_PUBLIC_URL}/uploads/${key}`
    }
  } catch (error) {
    console.warn('[resolveResourceLinkText] no se pudo generar/resolver el link, se omite:', error)
  }
  return null
}

async function momentosFromPayload(raw: RawGenerationPayload): Promise<DraftCompetencyWeekResult['momentos']> {
  const format = async (phase: 'ANTICIPATION' | 'CONSTRUCTION' | 'CONSOLIDATION') => {
    const m = raw.methodology[phase]
    const linkText = await resolveResourceLinkText(m.resourceLink)
    const recursos = linkText ? `${m.resources.join(', ')} — ${linkText}` : m.resources.join(', ')
    return {
      estrategiasDua: `${m.activity} (DUA: ${m.duaCodes.join(', ') || 'ninguno'})`,
      recursos,
      tecnica: phase === 'CONSOLIDATION' ? raw.assessment.technique : '',
      instrumento: phase === 'CONSOLIDATION' ? raw.assessment.instrument : '',
    }
  }
  const [anticipacion, construccionConocimiento, consolidacion] = await Promise.all([
    format('ANTICIPATION'),
    format('CONSTRUCTION'),
    format('CONSOLIDATION'),
  ])
  return { anticipacion, construccionConocimiento, consolidacion }
}

/**
 * Genera el borrador de una semana de PUD por COMPETENCIAS con motor en dos
 * capas: (1) IA validada agresivamente contra los catálogos reales (DUA,
 * técnicas/instrumentos) con hasta 2 intentos — si la IA inventa códigos,
 * repite actividades genéricas, o menciona recursos que no usa, se rechaza y
 * se reintenta con los errores específicos; (2) si la IA no está disponible o
 * agota los intentos, cae a un motor determinista que compone metodología y
 * evaluación seleccionando directamente de los mismos catálogos — el docente
 * nunca se queda sin nada, aunque sea más genérico.
 */
export async function draftCompetencyWeek(
  institutionId: string,
  actorId: string,
  dto: DraftCompetencyWeekDto,
): Promise<DraftCompetencyWeekResult> {
  const situation = await prisma.learningSituation.findFirst({
    where: { id: dto.situationId, institutionId },
    include: {
      academicPeriod: true,
      plan: { include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } } },
    },
  })
  if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')

  const competencies = dto.competencyIds.length
    ? await prisma.competency.findMany({
        where: { id: { in: dto.competencyIds } },
        include: { indicators: true, sabers: { where: { isActive: true } } },
      })
    : []
  if (competencies.length === 0) throw new NotFoundError('Selecciona al menos una competencia antes de generar el borrador')

  const [duaCheckpoints, assessmentTechniques, assessmentInstruments] = await Promise.all([
    prisma.duaCheckpoint.findMany({ include: { strategies: true }, orderBy: { sortOrder: 'asc' } }),
    prisma.assessmentTechnique.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.assessmentInstrument.findMany({ orderBy: { sortOrder: 'asc' } }),
  ])

  const duaStrategies: DuaStrategyInput[] = duaCheckpoints.flatMap((cp) =>
    cp.strategies.map((s) => ({ id: s.id, text: s.text, compatiblePhases: s.compatiblePhases, checkpointOperationalCode: cp.operationalCode })),
  )
  const allowedDuaCodes = new Set(duaCheckpoints.map((cp) => cp.operationalCode))
  const techniqueInstrumentMap = new Map(assessmentTechniques.map((t) => [t.code, new Set(t.compatibleInstrumentCodes)]))
  const allowedTechniqueCodes = new Set(assessmentTechniques.map((t) => t.code))
  const allowedInstrumentCodes = new Set(assessmentInstruments.map((i) => i.code))

  // Se genera para la primera competencia seleccionada (una semana puede tener varias,
  // pero el borrador de metodología/evaluación se ancla a la principal para mantener
  // el prompt e identidad simples — el docente ajusta manualmente si combina varias).
  const primary = competencies[0]
  const primaryIndicator = primary.indicators[0]
  const identityCode = primaryIndicator ? primaryIndicator.code : primary.code

  const deterministic = buildDeterministicMethodology(
    duaStrategies,
    { techniques: assessmentTechniques, instruments: assessmentInstruments },
    dto.rotationSeed ?? 0,
  )
  const fallbackResult = (validationErrors: string[]): DraftCompetencyWeekResult => ({
    indicadoresEvaluacion: primaryIndicator?.text ?? '',
    newSabers: [],
    reusedSaberIds: primary.sabers.map((s) => s.id),
    momentos: deterministic.momentos,
    generationMode: 'AI_FALLBACK',
    validationErrors,
  })

  if (!isAnthropicConfigured()) return fallbackResult(['AI_NOT_CONFIGURED'])

  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) return fallbackResult(['AI_DISABLED'])

  try {
    await assertBudgetAvailable(institutionId, aiConfig.monthlyTokenCap)
  } catch {
    return fallbackResult(['MONTHLY_TOKEN_CAP_REACHED'])
  }

  const competenciesBlock = competencies
    .map((c) => {
      const indicators = c.indicators.map((i) => `    - [${i.code}] ${i.text}`).join('\n') || '    (sin indicadores)'
      const sabers = c.sabers.length
        ? c.sabers.map((s) => `      - [${s.id}] (${s.type}) ${s.code}: ${s.description}`).join('\n')
        : '      (sin saberes — propone nuevos)'
      return `- ${c.code}: ${c.text}\n  Indicadores:\n${indicators}\n  Saberes ya existentes (reusa por id si aplican):\n${sabers}`
    })
    .join('\n\n')

  const duaCatalogText = duaCheckpoints
    .map((cp) => `  [${cp.operationalCode}] ${cp.principleName} — ${cp.guidelineName}`)
    .join('\n')
  const techniquesText = assessmentTechniques
    .map((t) => `  ${t.code} (${t.label}) -> instrumentos válidos: ${t.compatibleInstrumentCodes.join(', ')}`)
    .join('\n')

  // Carga horaria oficial (períodos semanales) determina la densidad de la semana —
  // calcado de _weekly_phase_counts() en TIGA: más períodos, más actividades por fase.
  const assignment = situation.plan.courseAssignment
  const workloadEntries = await prisma.curricularWorkload.findMany()
  const workload = resolveWorkload(
    workloadEntries,
    assignment.parallel.level.code,
    assignment.subject.workloadCode,
    assignment.parallel.educationOffer,
    assignment.weeklyPeriodsOverride,
  )
  const phaseCounts = weeklyPhaseCounts(workload.weeklyPeriods)
  const densityLine = workload.weeklyPeriods
    ? `Carga horaria: ${workload.weeklyPeriods} períodos/semana. Densidad esperada de actividades por fase: Anticipación ${phaseCounts.anticipation}, Construcción ${phaseCounts.construction}, Consolidación ${phaseCounts.consolidation}. Ajusta la profundidad de la actividad de cada fase a esta densidad (no la ignores).`
    : 'Carga horaria no configurada para este grado+materia — usa una densidad estándar (una actividad concreta por fase).'

  const systemPrompt = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a redactar la planificación microcurricular semanal (PUD) por COMPETENCIAS, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Asignatura: ${situation.plan.courseAssignment.subject.name}
Grado/Curso: ${situation.plan.courseAssignment.parallel.level.name}
Trimestre: ${situation.academicPeriod.name}
${densityLine}

Competencias seleccionadas por el docente:

${competenciesBlock}

Identidad inmutable de esta generación (repítela EXACTA en identityCode, no la alteres): "${identityCode}"

Catálogo DUA disponible — SOLO puedes usar estos códigos en duaCodes, no inventes otros:
${duaCatalogText}

Catálogo de evaluación — technique debe ser uno de estos códigos EXACTOS, e instrument debe ser uno de sus instrumentos compatibles listados:
${techniquesText}

Genera:
1. indicadoresEvaluacion: indicador(es) de evaluación (usa los oficiales listados arriba).
2. Saberes: si la competencia YA tiene saberes, pon sus ids en reusedSaberIds; si no, propone 1-2 nuevos de cada tipo en newSabers con code "<código_competencia>.d.1"/".p.1"/".a.1".
3. methodology: para ANTICIPATION, CONSTRUCTION y CONSOLIDATION — cada fase necesita: activity (una actividad CONCRETA y ESPECÍFICA de al menos 8 palabras, nunca genérica tipo "trabajar en grupos"), duaCodes (1-2 códigos del catálogo dado, coherentes con esa fase), resources (cada recurso debe ser una palabra o frase CORTA de 1-3 palabras — SIN paréntesis, comas ni descripciones adicionales — copiada EXACTAMENTE igual, carácter por carácter, dentro del texto de activity; ejemplo correcto: resources=["bloques multibase","ábaco"] si activity dice "...usando bloques multibase y un ábaco para..."; ejemplo INCORRECTO: resources=["bloques multibase para representar decenas y unidades"] porque esa frase larga no aparece igual en activity), evidence (evidencia observable, distinta del texto de la actividad).
4. assessment: activity, technique (código del catálogo), instrument (compatible con esa técnica), evidence (observable, distinta de activity), criteria (lista de 2-3 criterios que retomen literalmente palabras clave del indicador de evaluación).
5. resourceLink (OPCIONAL, solo en la fase donde aplique): si uno de los recursos de esa fase es un material DIGITAL que debería tener un enlace real para el docente, agrega resourceLink:
   - kind="web_search" + searchQuery: cuando el recurso ya existe publicado en internet (un video, una imagen, un artículo) — ej. actividad menciona "video sobre el ciclo del agua" → searchQuery="video educativo ciclo del agua para niños". Usa la herramienta de búsqueda web ANTES de llamar a submit_competency_week_draft, y solo si encuentras un resultado real completa resolvedUrl (la URL exacta de ese resultado, sin modificarla) y resolvedTitle (su título). Si la búsqueda no encuentra nada útil, NO incluyas resourceLink para esa fase — nunca inventes una URL.
   - kind="generate_document" + documentSpec: cuando el recurso es un material que NO existe en internet pero es simple de producir (una ficha, un organizador gráfico, una guía de trabajo) — ej. actividad dice "lámina para clasificar animales en una tabla" → documentSpec describe título/instrucciones/bloques (paragraph, numbered_lines, table con headers+rows, o blank_space con label para que el estudiante pegue/dibuje algo).
   - Si el recurso es solo un material físico genérico (pizarra, cuaderno, fichas impresas sin contenido específico), NO agregues resourceLink — deja el campo fuera por completo.

Sé concreto. No inventes códigos de competencia, indicador, DUA, técnica o instrumento fuera de los dados. No inventes URLs — usa siempre la herramienta de búsqueda web para verificarlas.`

  const client = getAnthropicClient()
  let lastErrors: string[] = []

  const tools: Anthropic.Tool[] = [
    { name: 'submit_competency_week_draft', description: 'Envía el borrador estructurado', input_schema: RESPONSE_SCHEMA },
  ]
  // web_search es server-side (Anthropic lo ejecuta, no nosotros) — con tool_choice
  // forzado al tool de respuesta, Claude NUNCA podría buscar en el mismo turno, así
  // que se pasa a "auto" + se instruye en el prompt que siempre debe terminar
  // llamando submit_competency_week_draft.
  // allowed_callers: ["direct"] es obligatorio en modelos que no soportan
  // programmatic tool calling (ej. Haiku 4.5) — sin esto la API rechaza la
  // request con "does not support programmatic tool calling".
  const serverTools = [{ type: 'web_search_20260209' as const, name: 'web_search' as const, allowed_callers: ['direct' as const] }]
  const MAX_PAUSE_RESUMES = 5

  // `messages` persiste ENTRE intentos (no se reconstruye desde cero) — si se
  // resetea en cada intento, Claude pierde toda memoria de lo que generó antes
  // y el mensaje de corrección ("corrige el error X") no tiene con qué relacionarse,
  // así que el modelo responde con texto pidiendo aclaraciones en vez de corregir.
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: 'Genera el borrador de esta semana.' }]

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message | undefined
    let apiError: string | null = null
    let nonRetryableApiError = false

    // Un turno con web_search puede pausarse (stop_reason: "pause_turn") si el
    // servidor alcanza su límite interno de iteraciones de búsqueda — se reenvía
    // el turno tal cual (el server detecta el server_tool_use colgante y resume
    // solo) hasta MAX_PAUSE_RESUMES veces.
    for (let resumes = 0; resumes <= MAX_PAUSE_RESUMES; resumes++) {
      try {
        response = await client.messages.create({
          model: aiConfig.model,
          // Con resourceLink (documentSpec de fichas con tablas) el payload puede
          // crecer bastante más que la metodología simple — 2200 se truncaba a
          // mitad de la respuesta y dejaba "assessment" fuera del tool_use.input.
          max_tokens: 4096,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages,
          tools: [...tools, ...serverTools],
          tool_choice: { type: 'auto' },
        })
      } catch (error) {
        // Un fallo de la API (timeout, 401, rate-limit, 5xx) nunca debe tumbar la
        // generación completa — cae al motor determinista igual que un error de
        // validación de contenido.
        const status = error instanceof Anthropic.APIError ? error.status : undefined
        nonRetryableApiError = status === 401 || status === 403 || status === 429
        apiError = `API_ERROR_${status ?? 'UNKNOWN'}`
        response = undefined
        break
      }
      if (response.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: response.content })
    }

    if (!response) {
      lastErrors = [apiError ?? 'API_ERROR_UNKNOWN']
      if (nonRetryableApiError) break
      continue
    }

    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: actorId,
        action: 'ai.draft_competency_week',
        resourceType: 'learning_situation',
        resourceId: dto.situationId,
        newValue: {
          model: aiConfig.model,
          attempt,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
        },
      },
    })

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_competency_week_draft')
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastErrors = ['NO_TOOL_USE_RETURNED']
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content:
          'Debes llamar a la herramienta submit_competency_week_draft con el borrador completo — no respondas con texto libre ni preguntas de aclaración.',
      })
      continue
    }
    const raw = toolUse.input as RawGenerationPayload
    // Una respuesta truncada por max_tokens puede dejar el tool_use.input a medias
    // (ej. sin "assessment") — eso debe reintentar como error de validación, nunca
    // tumbar la petición con una excepción sin control dentro del validador.
    if (!raw.methodology || !raw.assessment) {
      lastErrors = ['INCOMPLETE_TOOL_INPUT']
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            is_error: true,
            content: 'Tu respuesta anterior quedó incompleta (faltan campos). Vuelve a llamar la herramienta con el borrador COMPLETO.',
          },
        ],
      })
      continue
    }

    const ctx: PedagogicalValidationContext = {
      expectedIdentityCode: identityCode,
      indicatorText: primaryIndicator?.text ?? primary.text,
      allowedDuaCodes,
      allowedTechniqueCodes,
      techniqueInstrumentMap,
      allowedInstrumentCodes,
    }
    const validation = validateGeneratedPedagogy(toPayload(raw), ctx)

    if (validation.status === 'VERIFIED') {
      const { createdSabers, reusedIds } = await persistSabers(raw.newSabers, competencies)
      return {
        indicadoresEvaluacion: raw.indicadoresEvaluacion,
        newSabers: createdSabers,
        reusedSaberIds: [...raw.reusedSaberIds, ...reusedIds],
        momentos: await momentosFromPayload(raw),
        generationMode: 'AI_ENHANCED',
        validationErrors: [],
      }
    }
    lastErrors = validation.errors
    // El "tool_result" con los errores concretos es lo que le permite a Claude
    // corregir en el siguiente intento — sin la respuesta anterior (tool_use) y
    // este resultado, el mensaje de corrección queda huérfano y el modelo termina
    // respondiendo con texto pidiendo aclaraciones en vez de corregir.
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Corrige ÚNICAMENTE estos errores y vuelve a llamar la herramienta con el borrador completo corregido: ${validation.errors.join(', ')}.`,
        },
      ],
    })
  }

  console.warn(`[draftCompetencyWeek] fallback determinista tras ${MAX_ATTEMPTS} intentos — errores: ${lastErrors.join(', ')}`)
  return fallbackResult(lastErrors)
}

async function persistSabers(
  newSabers: RawGenerationPayload['newSabers'],
  competencies: { id: string; code: string }[],
): Promise<{ createdSabers: DraftedSaber[]; reusedIds: string[] }> {
  const createdSabers: DraftedSaber[] = []
  const reusedIds: string[] = []
  for (const saber of newSabers) {
    const owning = competencies.find((c) => saber.code.startsWith(c.code.replace('CE.', '')))
    if (!owning) continue
    const existing = await prisma.competencySaber.findUnique({
      where: { competencyId_code: { competencyId: owning.id, code: saber.code } },
    })
    if (existing) {
      reusedIds.push(existing.id)
      continue
    }
    const created = await prisma.competencySaber.create({
      data: { competencyId: owning.id, type: saber.type, code: saber.code, description: saber.description },
    })
    createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
  }
  return { createdSabers, reusedIds }
}
