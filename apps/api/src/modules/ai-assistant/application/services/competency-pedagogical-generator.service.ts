import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import {
  buildDeterministicCompetencyMethodology,
  PHASES,
  type CompetencyWeekMomentos,
  type DuaStrategyInput,
  type PedagogicalPhase,
} from '../../../../shared/domain/pedagogical-methodology'
import {
  validateGeneratedCompetencyPedagogy,
  autoRepairCompetencyPayload,
  isResourceJustified,
  allActivitiesStems,
  type GeneratedCompetencyPedagogyPayload,
  type GeneratedResourceLink,
  type PedagogicalValidationContext,
} from '../../../../shared/domain/pedagogical-validation'
import { resolveWorkload, weeklyPhaseCounts, phaseCountsFromTotal } from '../../../../shared/domain/workload-resolution'
import { buildResourceDocumentPdf, type DocumentSpec } from './resource-document-pdf.service'
import { assertBudgetAvailable } from './ai-budget.service'
import { resolveWebResource, type WebResourceResolverContext } from './web-resource-resolver.service'
import { estimateCostUsd } from './ai-pricing'
import { withGenerationLock } from './ai-generation-lock'
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
    // web_search: el recurso ya existe publicado en internet (video, artículo,
    // imagen) — SOLO propone searchQuery, la búsqueda real se resuelve en un
    // paso APARTE después de validar el borrador (web-resource-resolver.service.ts),
    // nunca dentro de esta llamada (antes web_search vivía aquí mismo y cada
    // pause_turn reenviaba todo el contexto pedagógico completo — la llamada
    // más cara del módulo — solo para resolver un link puntual).
    // generate_document: el recurso no existe en internet pero es simple de producir
    // (ficha, organizador, guía, rúbrica) — describe su contenido en documentSpec, el
    // sistema genera el PDF y te devuelve su link real.
    kind: { type: 'string', enum: ['web_search', 'generate_document'] },
    searchQuery: { type: 'string' },
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

const ACTIVITY_SCHEMA = {
  type: 'object' as const,
  properties: {
    // maxLength es un techo de output, no de calidad: una actividad concreta
    // de 8-25 palabras cabe holgada en 220 caracteres — el output es el token
    // 5x más caro (input:output = 1:5 en Sonnet), y sin techo el modelo a
    // veces redacta párrafos largos donde una frase corta cumple igual la
    // instrucción pedagógica ("al menos 8 palabras" solo pone un mínimo).
    text: { type: 'string', maxLength: 440 },
    // Código de checkpoint DUA del catálogo — UNO por actividad (no un bloque
    // genérico de "estrategias DUA" para toda la fase, como pedía el formato
    // anterior — cada actividad individual justifica su propio código).
    duaCode: { type: 'string' },
  },
  required: ['text', 'duaCode'],
  additionalProperties: false,
}

const PHASE_SCHEMA = {
  type: 'object' as const,
  properties: {
    activities: { type: 'array', items: ACTIVITY_SCHEMA },
  },
  required: ['activities'],
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
    // Recursos y evaluación se piden UNA sola vez para toda la semana — NO por
    // fase — porque el formato final es una sola tabla de 3 columnas por semana,
    // no 3 tablas repetidas (pedido explícito: "NO SE DEBE REPETIR TODO ESO").
    resources: { type: 'array', items: { type: 'string', maxLength: 120 } },
    resourceLink: RESOURCE_LINK_SCHEMA,
    assessment: {
      type: 'object',
      properties: {
        evidence: { type: 'string', maxLength: 440 },
        technique: { type: 'string' },
        instrument: { type: 'string' },
        instrumentLink: RESOURCE_LINK_SCHEMA,
      },
      required: ['evidence', 'technique', 'instrument'],
      additionalProperties: false,
    },
  },
  required: ['identityCode', 'newSabers', 'reusedSaberIds', 'methodology', 'resources', 'assessment'],
  additionalProperties: false,
}

interface RawActivity {
  text: string
  duaCode: string
}

interface RawPhase {
  activities: RawActivity[]
}

interface RawAssessment {
  evidence: string
  technique: string
  instrument: string
  instrumentLink?: GeneratedResourceLink & { documentSpec?: DocumentSpec }
}

interface RawGenerationPayload {
  identityCode: string
  newSabers: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  reusedSaberIds: string[]
  methodology: Record<PedagogicalPhase, RawPhase>
  resources: string[]
  resourceLink?: GeneratedResourceLink & { documentSpec?: DocumentSpec }
  assessment: RawAssessment
}

/**
 * Cuántos saberes de una competencia son razonables para UNA semana — calcado
 * de `competency_capacity()` en cnc_curriculum_distribution_engine.py de TIGA:
 * una competencia amplia (con muchos saberes) requiere varias semanas para
 * cubrirse completa, así que asignar TODOS sus saberes a cada semana del
 * bloque es pedagógicamente imposible (17 saberes en 1 semana, por ejemplo).
 * Con más semanas en el bloque, cada una necesita menos saberes propios;
 * con pocas semanas, cada una necesita cubrir más. Nunca menos de 1.
 */
function weeklySaberCapacity(totalSabers: number, totalWeeksInBlock: number): number {
  if (totalWeeksInBlock <= 1) return totalSabers
  return Math.max(1, Math.ceil(totalSabers / totalWeeksInBlock))
}

/** Rota `weekNumber` posiciones dentro de `list` (slicing circular) — sin recortar tamaño. */
function rotateForWeek<T>(list: T[], count: number, weekNumber: number): T[] {
  if (list.length === 0 || count >= list.length) return list
  const offset = ((weekNumber - 1) * count) % list.length
  const selected: T[] = []
  for (let i = 0; i < count; i++) selected.push(list[(offset + i) % list.length])
  return selected
}

/**
 * Selecciona qué subconjunto de saberes (ya existentes en la competencia)
 * corresponde a ESTA semana del bloque — rota por weekNumber para que
 * semanas consecutivas cubran saberes distintos en vez de repetir siempre
 * los primeros N, calcado del reparto por posición de TIGA (`week_indicators`/
 * `week_knowledge` en `_weekly_units`, que usa slicing rotatorio `[position::stride]`).
 *
 * Reparte por TIPO (declarativo/procedimental/actitudinal), no sobre la lista
 * plana: Prisma devuelve los saberes agrupados por tipo (sin orderBy explícito),
 * así que un slice rotatorio ingenuo sobre la lista completa podía caer entero
 * dentro de un solo tipo y dejar fuera procedimentales/actitudinales en esa
 * semana — cada semana debe relacionarse con los 3 tipos presentes en la
 * competencia (no necesariamente en igual cantidad, pero ninguno ausente).
 */
function selectSabersForWeek<T extends { type: string }>(allSabers: T[], weekNumber: number, totalWeeksInBlock: number): T[] {
  const capacity = weeklySaberCapacity(allSabers.length, totalWeeksInBlock)
  if (capacity >= allSabers.length) return allSabers

  const byType = new Map<string, T[]>()
  for (const saber of allSabers) {
    const group = byType.get(saber.type)
    if (group) group.push(saber)
    else byType.set(saber.type, [saber])
  }
  const types = [...byType.keys()]

  // Reparto en 2 pasadas: (1) garantiza 1 por cada tipo presente mientras
  // quede capacidad — así ningún tipo queda en cero aunque la iteración por
  // orden de tipos agotaría la capacidad antes de llegar al último; (2) el
  // resto se distribuye proporcionalmente al tamaño de cada tipo.
  const quotas = new Map<string, number>(types.map((t) => [t, 0]))
  let remaining = capacity
  for (const type of types) {
    if (remaining <= 0) break
    quotas.set(type, 1)
    remaining--
  }
  while (remaining > 0) {
    const target = types
      .filter((t) => quotas.get(t)! < byType.get(t)!.length)
      .sort((a, b) => byType.get(b)!.length - byType.get(a)!.length)[0]
    if (!target) break
    quotas.set(target, quotas.get(target)! + 1)
    remaining--
  }

  const selected: T[] = []
  for (const type of types) {
    const quota = quotas.get(type) ?? 0
    if (quota > 0) selected.push(...rotateForWeek(byType.get(type)!, quota, weekNumber))
  }
  return selected
}

function toValidationPayload(raw: RawGenerationPayload): GeneratedCompetencyPedagogyPayload {
  return {
    identityCode: raw.identityCode,
    methodology: raw.methodology,
    resources: raw.resources,
    resourceLink: raw.resourceLink,
    assessment: {
      evidence: raw.assessment.evidence,
      technique: raw.assessment.technique,
      instrument: raw.assessment.instrument,
      instrumentLink: raw.assessment.instrumentLink,
    },
  }
}

/**
 * Construye el mensaje de corrección del reintento con el detalle exacto de
 * qué está mal — antes decía solo "Corrige DUA_CODE_NOT_ALLOWED" sin indicar
 * QUÉ actividad ni QUÉ código inventó, y sin repetir el catálogo válido (el
 * modelo tenía que "recordarlo" de cientos de líneas atrás en el system
 * prompt). Confirmado en producción: con el mensaje genérico, la tasa de
 * fallo en el reintento era ~100% (26/26 llamadas de una sesión real,
 * fallando con el MISMO error en ambos intentos) — el modelo no tenía
 * suficiente información para corregir algo concreto.
 */
function buildCorrectionMessage(
  errors: string[],
  payload: GeneratedCompetencyPedagogyPayload,
  ctx: PedagogicalValidationContext,
): string {
  const lines = [`Corrige ÚNICAMENTE estos errores y vuelve a llamar la herramienta con el borrador completo corregido: ${errors.join(', ')}.`]

  if (errors.includes('DUA_CODE_NOT_ALLOWED')) {
    const offending: string[] = []
    for (const phase of PHASES) {
      const block = payload.methodology[phase]
      if (!block?.activities) continue
      block.activities.forEach((activity, i) => {
        if (!activity.duaCode || !ctx.allowedDuaCodes.has(activity.duaCode)) {
          offending.push(`${phase} actividad ${i + 1}: escribiste "${activity.duaCode ?? '(vacío)'}", que NO existe en el catálogo.`)
        }
      })
    }
    lines.push(
      `\nDUA_CODE_NOT_ALLOWED — actividades con código inválido:\n${offending.join('\n')}\nCatálogo de códigos DUA VÁLIDOS (usa EXACTAMENTE uno de estos, copiado tal cual, sin inventar ni combinar): ${[...ctx.allowedDuaCodes].join(', ')}.`,
    )
  }
  if (errors.includes('TECHNIQUE_NOT_ALLOWED')) {
    lines.push(
      `\nTECHNIQUE_NOT_ALLOWED — escribiste "${payload.assessment.technique}", que no existe. Técnicas VÁLIDAS: ${[...ctx.allowedTechniqueCodes].join(', ')}.`,
    )
  }
  if (errors.includes('INSTRUMENT_NOT_ALLOWED')) {
    lines.push(
      `\nINSTRUMENT_NOT_ALLOWED — escribiste "${payload.assessment.instrument}", que no existe o no es compatible con la técnica elegida. Instrumentos VÁLIDOS: ${[...ctx.allowedInstrumentCodes].join(', ')}.`,
    )
  }
  if (errors.includes('RESOURCE_NOT_JUSTIFIED')) {
    // Un recurso está "justificado" si al menos una palabra significativa
    // suya aparece en el texto de alguna actividad — mismo problema que
    // DUA_CODE_NOT_ALLOWED: el mensaje genérico no decía CUÁL recurso ni
    // CON QUÉ actividad no encontraba relación, así el modelo no tenía nada
    // concreto para corregir en el reintento.
    const activityStemsText = [...allActivitiesStems(payload.methodology)].join(' ')
    const offendingResources = payload.resources.filter((r) => !isResourceJustified(r, activityStemsText))
    lines.push(
      `\nRESOURCE_NOT_JUSTIFIED — estos recursos no se mencionan (ni con palabras relacionadas) en ninguna actividad de la semana: ${offendingResources.map((r) => `"${r}"`).join(', ')}. Para cada recurso, o bien menciónalo explícitamente dentro del texto de alguna actividad, o cámbialo por uno que ya esté mencionado.`,
    )
  }
  if (errors.includes('ASSESSMENT_NOT_ALIGNED_WITH_INDICATOR')) {
    // Igual patrón que los anteriores: se exige que al menos una palabra
    // larga del indicador aparezca literalmente en la evidencia — sin decir
    // CUÁL palabra faltaba, el modelo reformulaba la evidencia sin acertar
    // a incluirla, repitiendo el error en el reintento.
    lines.push(
      `\nASSESSMENT_NOT_ALIGNED_WITH_INDICATOR — tu evidence ("${payload.assessment.evidence}") no menciona ninguna palabra clave del indicador que estás evaluando: "${ctx.indicatorText}". Reescribe evidence para que incluya EXPLÍCITAMENTE al menos una palabra o frase clave de ese indicador (no hace falta copiarlo completo, pero sí una idea central del mismo).`,
    )
  }
  const missingPhases = PHASES.filter((p) => errors.includes(`${p}_MISSING`))
  if (missingPhases.length > 0) {
    // Confirmado en producción: el modelo a veces devuelve el tool_use con
    // methodology vacío o sin "activities" en alguna fase — un fallo
    // estructural distinto a un valor puntual mal puesto, así que el mensaje
    // insiste explícitamente en incluir las 3 fases completas, no solo
    // "corrige el error" (que el modelo repetía sin agregar contenido).
    lines.push(
      `\nFASE(S) VACÍA(S) — tu respuesta anterior NO incluyó actividades en ${missingPhases.length > 1 ? 'estas fases' : 'esta fase'}: ${missingPhases.join(', ')}. Debes volver a llamar la herramienta con las 3 fases (ANTICIPATION, CONSTRUCTION, CONSOLIDATION) completas — cada una con su lista "activities" llena (mínimo 2 actividades reales, con texto y duaCode), nunca vacía ni omitida.`,
    )
  }
  return lines.join('\n')
}

/**
 * Si el link pedido es "web_search", resuelve la búsqueda AHORA, en una
 * llamada aislada (web-resource-resolver.service.ts) — antes el modelo ya
 * traía la URL resuelta porque web_search vivía en la misma llamada que
 * generaba toda la planificación; separarlo evita que cada pause_turn de la
 * búsqueda reenvíe el contexto pedagógico completo. Si es "generate_document",
 * genera el PDF del documentSpec (reusa el mismo motor que las fichas de
 * recurso), lo sube al storage, y devuelve su URL pública. Nunca lanza: un
 * fallo aquí (storage caído, búsqueda sin resultados, etc.) simplemente omite
 * el link — NUNCA debe hacer fallar ni reintentar la generación pedagógica ya
 * validada.
 */
async function resolveLink(
  link: (GeneratedResourceLink & { documentSpec?: DocumentSpec; searchQuery?: string }) | undefined,
  fallbackTitle: string,
  model: string,
  webResourceCtx: WebResourceResolverContext,
): Promise<{ title: string; url: string } | undefined> {
  if (!link) return undefined
  try {
    if (link.kind === 'web_search') {
      if (!link.searchQuery) return undefined
      const resolved = await resolveWebResource(model, link.searchQuery, webResourceCtx)
      if (!resolved) return undefined
      return { title: resolved.title || fallbackTitle, url: resolved.url }
    }
    if (link.kind === 'generate_document' && link.documentSpec) {
      const pdf = await buildResourceDocumentPdf(link.documentSpec)
      const key = `planning-resources/${randomUUID()}.pdf`
      await storage.save(key, pdf, 'application/pdf')
      return { title: link.documentSpec.title, url: `${env.API_PUBLIC_URL}/uploads/${key}` }
    }
  } catch (error) {
    console.warn('[resolveLink] no se pudo generar/resolver el link, se omite:', error)
  }
  return undefined
}

async function momentosFromPayload(
  raw: RawGenerationPayload,
  criterio: string,
  instrumentLabelByCode: Map<string, string>,
  model: string,
  webResourceCtx: WebResourceResolverContext,
): Promise<CompetencyWeekMomentos> {
  const fases = {} as CompetencyWeekMomentos['fases']
  const PHASE_TO_KEY: Record<PedagogicalPhase, 'inicio' | 'desarrollo' | 'cierre'> = {
    ANTICIPATION: 'inicio',
    CONSTRUCTION: 'desarrollo',
    CONSOLIDATION: 'cierre',
  }
  for (const phase of PHASES) {
    fases[PHASE_TO_KEY[phase]] = { activities: raw.methodology[phase].activities.map((a) => ({ text: a.text, duaCode: a.duaCode })) }
  }

  const [recursoLink, instrumentoLink] = await Promise.all([
    resolveLink(raw.resourceLink, 'Recurso', model, webResourceCtx),
    resolveLink(raw.assessment.instrumentLink, 'Instrumento', model, webResourceCtx),
  ])

  return {
    fases,
    recursos: raw.resources,
    recursoLink,
    evaluacion: {
      evidencia: raw.assessment.evidence,
      criterio,
      // El catálogo devuelve códigos técnicos (ANALYTIC_RUBRIC, CHECKLIST...) — el
      // docente debe ver siempre el label en español ("Rúbrica analítica"), nunca
      // el código crudo en inglés.
      instrumento: instrumentLabelByCode.get(raw.assessment.instrument) ?? raw.assessment.instrument,
      instrumentoLink: instrumentoLink,
    },
  }
}

/** "[CODE] texto" por cada indicador de las competencias seleccionadas — el código SIEMPRE se muestra junto a su texto (nunca solo texto libre). */
function formatIndicatorsWithCode(competencies: { indicators: { code: string; text: string }[] }[]): string {
  const all = competencies.flatMap((c) => c.indicators)
  if (all.length === 0) return ''
  return all.map((i) => `[${i.code}] ${i.text}`).join('; ')
}

/** Solo los códigos de indicador, para la columna "Criterio" de Evaluación (formato CNC: código, no reformulación en prosa). */
function indicatorCodes(competencies: { indicators: { code: string; text: string }[] }[]): string {
  return competencies
    .flatMap((c) => c.indicators)
    .map((i) => i.code)
    .join(', ')
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
 *
 * Formato de salida calcado de TIGA (referencia con acuerdo de reutilización):
 * fases "Inicio/Desarrollo/Cierre" con N actividades numeradas (según densidad
 * por carga horaria) y su propio código DUA cada una, más recursos y
 * evaluación consolidados UNA sola vez para toda la semana — nunca repetidos
 * por fase.
 */
export async function draftCompetencyWeek(
  institutionId: string,
  actorId: string,
  dto: DraftCompetencyWeekDto,
): Promise<DraftCompetencyWeekResult> {
  // Idempotencia: un doble clic o un retry del frontend en la MISMA semana no
  // dispara una segunda generación completa (facturada de nuevo) mientras la
  // primera sigue en curso — ver ai-generation-lock.ts para el alcance/límites.
  const lockKey = `draft-competency-week:${institutionId}:${dto.situationId}:${dto.weekNumber ?? 1}`
  return withGenerationLock(lockKey, () => draftCompetencyWeekInner(institutionId, actorId, dto))
}

async function draftCompetencyWeekInner(
  institutionId: string,
  actorId: string,
  dto: DraftCompetencyWeekDto,
): Promise<DraftCompetencyWeekResult> {
  const situation = await prisma.learningSituation.findFirst({
    where: { id: dto.situationId, institutionId },
    include: {
      academicPeriod: true,
      plan: { include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } } },
      weeks: { select: { weekNumber: true } },
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
  const instrumentLabelByCode = new Map(assessmentInstruments.map((i) => [i.code, i.label]))
  const techniqueInstrumentMap = new Map(assessmentTechniques.map((t) => [t.code, new Set(t.compatibleInstrumentCodes)]))
  const allowedTechniqueCodes = new Set(assessmentTechniques.map((t) => t.code))
  const allowedInstrumentCodes = new Set(assessmentInstruments.map((i) => i.code))

  // EXCEPCIÓN igual que selectedSaberIds: si el docente eligió explícitamente
  // qué indicadores aplican a esta semana (en vez de "todos los indicadores
  // de la competencia", comportamiento automático de siempre), esa selección
  // manda — se filtran los indicadores de CADA competencia a ese subconjunto
  // antes de construir el prompt/indicadoresEvaluacion/criterio.
  const selectedIndicatorIdSet = dto.selectedIndicatorIds?.length ? new Set(dto.selectedIndicatorIds) : null
  const competenciesForPrompt = selectedIndicatorIdSet
    ? competencies.map((c) => ({ ...c, indicators: c.indicators.filter((i) => selectedIndicatorIdSet.has(i.id)) }))
    : competencies

  // Se genera para la primera competencia seleccionada (una semana puede tener varias,
  // pero el borrador de metodología/evaluación se ancla a la principal para mantener
  // el prompt e identidad simples — el docente ajusta manualmente si combina varias).
  const primary = competenciesForPrompt[0]
  const primaryIndicator = primary.indicators[0] ?? competencies[0].indicators[0]
  const identityCode = primaryIndicator ? primaryIndicator.code : primary.code
  const indicadoresEvaluacion = formatIndicatorsWithCode(competenciesForPrompt) || primary.code
  const criterio = indicatorCodes(competenciesForPrompt) || primary.code

  // Distribución de saberes entre semanas del bloque — calcado del motor de
  // TIGA (competency_capacity + reparto rotatorio por posición): asignar TODOS
  // los saberes de la competencia a cada semana es imposible de cubrir (ej. 17
  // saberes en 1 semana), así que cada semana recibe solo el subconjunto que
  // le corresponde según su posición en el bloque.
  //
  // EXCEPCIÓN: si el docente ya seleccionó manualmente qué saberes quiere para
  // esta semana (dto.selectedSaberIds — ej. la IA propuso 5 y el docente dejó
  // solo 2), esa selección manda sobre el reparto automático. "Regenerar solo
  // actividades" debe respetar exactamente lo que el docente ya filtró, no
  // volver a decidir por su cuenta.
  const totalWeeksInBlock = Math.max(situation.weeks.length, 1)
  const currentWeekNumber = dto.weekNumber ?? 1
  const selectedSaberIdSet = dto.selectedSaberIds?.length ? new Set(dto.selectedSaberIds) : null
  const primarySabersForWeek = selectedSaberIdSet
    ? primary.sabers.filter((s) => selectedSaberIdSet.has(s.id))
    : selectSabersForWeek(primary.sabers, currentWeekNumber, totalWeeksInBlock)

  // Carga horaria oficial (períodos semanales) determina cuántas actividades
  // numeradas trae cada fase — calcado de _weekly_phase_counts() en TIGA.
  const assignment = situation.plan.courseAssignment
  const workloadEntries = await prisma.curricularWorkload.findMany()
  const workload = resolveWorkload(
    workloadEntries,
    assignment.parallel.level.code,
    assignment.subject.workloadCode,
    assignment.parallel.educationOffer,
    assignment.weeklyPeriodsOverride,
  )
  // El docente puede pedir explícitamente "una actividad por saber" en vez
  // del cálculo por carga horaria — cuenta los saberes reales que van a
  // aparecer en el prompt de ESTA semana (todas las competencias, no solo la
  // principal), repartidos entre las 3 fases. fixedActivitiesTotal permite un
  // número manual distinto sin depender de ninguno de los dos cálculos.
  const totalSabersForWeek = competenciesForPrompt.reduce((sum, c) => {
    const sabers = selectedSaberIdSet ? c.sabers.filter((s) => selectedSaberIdSet.has(s.id)) : selectSabersForWeek(c.sabers, currentWeekNumber, totalWeeksInBlock)
    return sum + sabers.length
  }, 0)
  const phaseCounts =
    dto.activitiesMode === 'per_saber'
      ? phaseCountsFromTotal(totalSabersForWeek)
      : dto.activitiesMode === 'fixed' && dto.fixedActivitiesTotal
        ? phaseCountsFromTotal(dto.fixedActivitiesTotal)
        : weeklyPhaseCounts(workload.weeklyPeriods)

  const deterministic = buildDeterministicCompetencyMethodology(
    duaStrategies,
    { techniques: assessmentTechniques, instruments: assessmentInstruments },
    phaseCounts,
    dto.rotationSeed ?? 0,
  )
  deterministic.evaluacion.criterio = criterio
  const fallbackResult = (validationErrors: string[]): DraftCompetencyWeekResult => ({
    indicadoresEvaluacion,
    newSabers: [],
    reusedSaberIds: primarySabersForWeek.map((s) => s.id),
    momentos: deterministic,
    generationMode: 'AI_FALLBACK',
    validationErrors,
  })

  if (!isAnthropicConfigured()) return fallbackResult(['AI_NOT_CONFIGURED'])

  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) return fallbackResult(['AI_DISABLED'])

  try {
    await assertBudgetAvailable(institutionId, aiConfig)
  } catch {
    return fallbackResult(['MONTHLY_TOKEN_CAP_REACHED'])
  }

  const competenciesBlock = competenciesForPrompt
    .map((c) => {
      const indicators = c.indicators.map((i) => `    - [${i.code}] ${i.text}`).join('\n') || '    (sin indicadores)'
      const sabersForWeek = selectedSaberIdSet
        ? c.sabers.filter((s) => selectedSaberIdSet.has(s.id))
        : selectSabersForWeek(c.sabers, currentWeekNumber, totalWeeksInBlock)
      const sabers = sabersForWeek.length
        ? sabersForWeek.map((s) => `      - [${s.id}] (${s.type}) ${s.code}: ${s.description}`).join('\n')
        : '      (sin saberes — propone nuevos)'
      const sabersNote = selectedSaberIdSet
        ? 'Saberes seleccionados manualmente por el docente (usa EXACTAMENTE estos, no agregues otros de la competencia)'
        : `Saberes de ESTA semana (reusa por id — es un subconjunto ya repartido entre las ${totalWeeksInBlock} semanas del bloque, no todos los que tiene la competencia)`
      return `- ${c.code}: ${c.text}\n  Indicadores:\n${indicators}\n  ${sabersNote}:\n${sabers}`
    })
    .join('\n\n')

  const duaCatalogText = duaCheckpoints
    .map((cp) => `  [${cp.operationalCode}] ${cp.principleName} — ${cp.guidelineName}`)
    .join('\n')
  const techniquesText = assessmentTechniques
    .map((t) => `  ${t.code} (${t.label}) -> instrumentos válidos: ${t.compatibleInstrumentCodes.join(', ')}`)
    .join('\n')

  const activityCountReason =
    dto.activitiesMode === 'per_saber'
      ? `Modo elegido por el docente: UNA actividad por cada saber movilizado esta semana (${totalSabersForWeek} saberes).`
      : dto.activitiesMode === 'fixed' && dto.fixedActivitiesTotal
        ? `Modo elegido por el docente: número fijo de ${dto.fixedActivitiesTotal} actividades para la semana.`
        : workload.weeklyPeriods
          ? `Carga horaria: ${workload.weeklyPeriods} períodos/semana.`
          : 'Carga horaria no configurada para este grado+materia — densidad estándar.'
  const densityLine = `${activityCountReason} Número de actividades numeradas que DEBES generar por fase: Inicio ${phaseCounts.anticipation}, Desarrollo ${phaseCounts.construction}, Cierre ${phaseCounts.consolidation}. Respeta este número exacto — ni más ni menos. NUNCA menos de 2 actividades en ninguna fase, sin excepción.`

  // Multigrado (ver multigrade-week-generator.service.ts): la experiencia común ya
  // fue generada UNA vez para toda el aula — aquí solo se le pide a la IA conectar
  // la PRIMERA actividad de Inicio con ella, sin alterar el currículo propio de este
  // grado (misma competencia/indicador/saberes de siempre, nunca se inventa nada
  // común). Ausente en el flujo normal de una sola materia (dto sin este campo).
  const sharedExperienceLine = dto.multigradeSharedExperience
    ? `\nCONTEXTO MULTIGRADO — este grado comparte salón con otros grados a la vez. Ya existe una EXPERIENCIA COMÚN planteada para toda el aula:\nTítulo: "${dto.multigradeSharedExperience.title}"\nContexto: ${dto.multigradeSharedExperience.context}\nPropósito común: ${dto.multigradeSharedExperience.commonPurpose}\nLa PRIMERA actividad de Inicio (ANTICIPATION[0]) DEBE partir explícitamente de esta situación común (menciónala con palabras propias, adaptada al nivel de "${dto.multigradeSharedExperience.gradeLabel}"), y el resto de actividades de Inicio/Desarrollo/Cierre siguen el currículo propio de este grado (nunca inventes contenido común nuevo fuera de la experiencia dada).\n`
    : ''

  // Bloque ESTÁTICO — idéntico para CUALQUIER institución/docente/materia (rol,
  // instrucciones de generación, y los catálogos DUA/evaluación, que son
  // globales, no por institución). Va en su propio bloque `system` con
  // cache_control separado del bloque variable de abajo: así Anthropic puede
  // servirlo desde caché entre llamadas de DISTINTOS docentes/instituciones
  // (dentro de la ventana de 5 min), no solo dentro de los reintentos de una
  // misma conversación — reduce significativamente el costo real, confirmado
  // con datos de producción que cada trimestre de 8 semanas dispara docenas
  // de llamadas reales, cada una reenviando este mismo catálogo ~2500
  // caracteres de otro modo.
  const staticInstructions = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a redactar la planificación microcurricular semanal (PUD) por COMPETENCIAS, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Catálogo DUA disponible — cada actividad debe llevar EXACTAMENTE UN código de este catálogo, no inventes otros:
${duaCatalogText}

Catálogo de evaluación — technique debe ser uno de estos códigos EXACTOS, e instrument debe ser uno de sus instrumentos compatibles listados:
${techniquesText}

IMPORTANTE — terminología del documento final: las 3 fases se llaman "Inicio", "Desarrollo" y "Cierre" (nunca "Anticipación"/"Construcción"/"Consolidación" — esos son solo los nombres técnicos internos de las claves ANTICIPATION/CONSTRUCTION/CONSOLIDATION que usas en el JSON, el docente nunca los ve).

Genera:
1. Saberes: pon en reusedSaberIds ÚNICAMENTE los ids listados en "Saberes de ESTA semana" de cada competencia (dados en el mensaje siguiente) — NUNCA agregues otros saberes de la competencia que no estén en esa lista, aunque los conozcas por el código; esa lista ya es el subconjunto correcto para esta semana específica del bloque, no toda la competencia. Si una competencia no tiene ningún saber listado, propone 1-2 nuevos de cada tipo en newSabers con code "<código_competencia>.d.1"/".p.1"/".a.1".
2. methodology: para ANTICIPATION (Inicio), CONSTRUCTION (Desarrollo) y CONSOLIDATION (Cierre) — cada fase es una lista de "activities", con EXACTAMENTE el número de actividades indicado en el mensaje siguiente. Cada actividad tiene:
   - text: una actividad CONCRETA y ESPECÍFICA de 16 a 50 palabras (máximo 440 caracteres) — nunca genérica tipo "trabajar en grupos", pero tampoco un párrafo largo: una frase concreta y accionable alcanza.
   - duaCode: EXACTAMENTE un código del catálogo DUA dado arriba, coherente con esa fase y esa actividad específica (no repitas el mismo código en todas las actividades salvo que realmente aplique).
3. resources: lista de 3-6 recursos CONCRETOS para TODA la semana (no por fase) — cada uno una palabra o frase CORTA de 1-3 palabras, SIN paréntesis ni descripciones — que aparezca mencionado (mismas palabras) en al menos una de las actividades de methodology. NO repitas la misma redacción de las actividades: el recurso es solo el NOMBRE del material, la actividad ya explica el uso.
4. resourceLink (OPCIONAL): si uno de los recursos de la semana es un material DIGITAL que debería tener un enlace real:
   - kind="web_search" + searchQuery: cuando el recurso ya existe publicado en internet (video, imagen, artículo). NO busques nada tú mismo — solo propone el texto de búsqueda más específico posible (searchQuery), otro proceso resuelve la URL real después.
   - kind="generate_document" + documentSpec: cuando el recurso es un material que NO existe en internet pero es simple de producir (ficha, organizador gráfico, guía de trabajo) — documentSpec describe título/instrucciones/bloques (paragraph, numbered_lines, table con headers+rows, o blank_space con label).
   - Si el recurso es solo un material físico genérico (pizarra, cuaderno), NO agregues resourceLink.
5. assessment: evaluación de TODA la semana (una sola, no por fase):
   - evidence: el producto o desempeño observable que demuestra el aprendizaje de la semana — DEBE ser distinto en palabras de cualquiera de las actividades de methodology (no repitas la misma redacción, aporta información nueva: qué se entrega/observa, no qué se hizo). Una frase concreta (máximo 440 caracteres), no un párrafo.
   - technique: código del catálogo de evaluación.
   - instrument: instrumento compatible con esa técnica (del catálogo).
   - instrumentLink (OPCIONAL): si el instrumento (ej. una rúbrica o lista de cotejo) conviene entregarse como documento descargable, usa kind="generate_document" con documentSpec describiendo una tabla de rúbrica/lista de cotejo con los criterios de evaluación como filas — reusa el mismo formato de documentSpec que resourceLink.

No redactes "criterio" ni "indicadoresEvaluacion" — el sistema los deriva automáticamente de los códigos de indicador ya seleccionados por el docente.

Sé concreto. No inventes códigos de competencia, indicador, DUA, técnica o instrumento fuera de los dados. No inventes URLs — para kind="web_search" solo propone searchQuery, nunca una URL.`

  // Bloque VARIABLE — específico de esta materia/grado/competencia(s)/semana.
  const contextPrompt = `Asignatura: ${situation.plan.courseAssignment.subject.name}
Grado/Curso: ${situation.plan.courseAssignment.parallel.level.name}
Trimestre: ${situation.academicPeriod.name}
${densityLine}
${sharedExperienceLine}

Competencias seleccionadas por el docente:

${competenciesBlock}

Identidad inmutable de esta generación (repítela EXACTA en identityCode, no la alteres): "${identityCode}"`

  const client = getAnthropicClient()
  let lastErrors: string[] = []

  const tools: Anthropic.Tool[] = [
    { name: 'submit_competency_week_draft', description: 'Envía el borrador estructurado', input_schema: RESPONSE_SCHEMA },
  ]
  // web_search YA NO vive en esta llamada (antes era server-side aquí mismo,
  // con tool_choice:'auto' porque el modelo necesitaba poder elegir buscar
  // en el mismo turno). Ahora el modelo solo declara searchQuery en
  // resourceLink/instrumentLink — la búsqueda real se resuelve DESPUÉS de
  // validar, en una llamada aislada (web-resource-resolver.service.ts). Eso
  // elimina pause_turn de este flujo por completo: sin web_search no hay
  // razón para que Anthropic pause el turno, así que se puede forzar
  // tool_choice al tool de respuesta — reduce el motivo de reintento más
  // común (NO_TOOL_USE_RETURNED, el modelo respondiendo con texto libre) y
  // baja el peor caso de esta llamada de hasta 6 requests (2 intentos × 3
  // resumes) a exactamente 1 por intento.
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: `${contextPrompt}\n\nGenera el borrador de esta semana.` },
  ]
  // Dos bloques `system` con cache_control PROPIO cada uno: el estático
  // (instrucciones+catálogos, idéntico entre docentes/instituciones) cachea
  // ancho — puede servirse desde caché entre llamadas de OTROS docentes
  // dentro de la ventana de 5 min, no solo dentro de esta misma conversación.
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
  ]

  // Instrumentación por request (Prioridad 5/6/11 del plan de optimización):
  // antes solo se veía el agregado de tokens por operación, sin poder
  // distinguir cuánto pesa el contexto (competencias/indicadores/saberes de
  // ESTA llamada puntual) del resto — necesario para diagnosticar picos como
  // el de ~1M input tokens en pocas horas sin adivinar la causa.
  const competencyCount = competenciesForPrompt.length
  const indicatorCount = competenciesForPrompt.reduce((sum, c) => sum + c.indicators.length, 0)
  const saberCount = competenciesForPrompt.reduce((sum, c) => sum + c.sabers.length, 0)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message | undefined
    let apiError: string | null = null
    let nonRetryableApiError = false
    const requestStartedAt = Date.now()

    try {
      response = await client.messages.create({
        model: aiConfig.model,
        max_tokens: 4096,
        system: systemBlocks,
        messages,
        tools,
        tool_choice: { type: 'tool', name: 'submit_competency_week_draft' },
        // Explícito para no depender del default del modelo: en Sonnet 4.6
        // omitir thinking corría sin pensar, pero en Sonnet 5+ omitirlo activa
        // adaptive thinking en silencio (gasta tokens de salida extra sin que
        // el caller lo pidiera) — esta llamada es extracción estructurada
        // forzada por tool_choice, no razonamiento abierto, así que thinking
        // no aporta aquí y solo sumaría costo.
        thinking: { type: 'disabled' },
      })
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined
      nonRetryableApiError = status === 401 || status === 403 || status === 429
      apiError = `API_ERROR_${status ?? 'UNKNOWN'}`
      response = undefined
    }

    if (!response) {
      lastErrors = [apiError ?? 'API_ERROR_UNKNOWN']
      if (nonRetryableApiError) break
      continue
    }

    // El log de auditoría se escribe UNA vez por intento, después de conocer
    // el desenlace (errors: [] si quedó VERIFIED) — antes se escribía apenas
    // llegaba la respuesta, sin el motivo del reintento, así que no se podía
    // distinguir un intento que falló por código DUA inventado de uno que
    // falló por tool_use ausente: ambos quedaban indistinguibles en
    // audit_logs y no había forma de atacar la causa real del ~20% de
    // reintentos observado en producción.
    const recordAttempt = (errors: string[]) =>
      prisma.auditLog.create({
        data: {
          institutionId,
          userId: actorId,
          action: 'ai.draft_competency_week',
          resourceType: 'learning_situation',
          resourceId: dto.situationId,
          newValue: {
            model: aiConfig.model,
            attempt,
            subjectId: assignment.subjectId,
            gradeId: assignment.parallelId,
            weekNumber: currentWeekNumber,
            competencyCount,
            indicatorCount,
            saberCount,
            inputTokens: response!.usage.input_tokens,
            outputTokens: response!.usage.output_tokens,
            cacheReadTokens: response!.usage.cache_read_input_tokens ?? 0,
            cacheCreationTokens: response!.usage.cache_creation_input_tokens ?? 0,
            stopReason: response!.stop_reason,
            durationMs: Date.now() - requestStartedAt,
            estimatedCostUsd: estimateCostUsd({
              model: aiConfig.model,
              inputTokens: response!.usage.input_tokens,
              outputTokens: response!.usage.output_tokens,
              cacheReadTokens: response!.usage.cache_read_input_tokens ?? 0,
              cacheCreationTokens: response!.usage.cache_creation_input_tokens ?? 0,
            }),
            errors,
          },
        },
      })

    const toolUse = response.content.find((b) => b.type === 'tool_use' && b.name === 'submit_competency_week_draft')
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastErrors = ['NO_TOOL_USE_RETURNED']
      await recordAttempt(lastErrors)
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content:
          'Debes llamar a la herramienta submit_competency_week_draft con el borrador completo — no respondas con texto libre ni preguntas de aclaración.',
      })
      continue
    }
    const raw = toolUse.input as RawGenerationPayload
    if (!raw.methodology || !raw.assessment || !raw.resources) {
      lastErrors = ['INCOMPLETE_TOOL_INPUT']
      await recordAttempt(lastErrors)
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
    // Repara en TypeScript lo puramente mecánico (identityCode alterado, link
    // opcional incompleto) ANTES de validar — así un defecto trivial no
    // dispara un reintento completo (facturado de nuevo) por algo que el
    // código ya sabía corregir. Los campos reparados se reinyectan en `raw`
    // para que el resto del flujo (persistencia, momentosFromPayload) use la
    // versión ya corregida, no la original con el defecto.
    const repaired = autoRepairCompetencyPayload(toValidationPayload(raw), ctx)
    raw.identityCode = repaired.identityCode
    if (!repaired.resourceLink) raw.resourceLink = undefined
    if (!repaired.assessment.instrumentLink) raw.assessment.instrumentLink = undefined
    const validation = validateGeneratedCompetencyPedagogy(repaired, ctx)

    if (validation.status === 'VERIFIED') {
      await recordAttempt([])
      const { createdSabers, reusedIds } = await persistSabers(raw.newSabers, competencies)
      return {
        indicadoresEvaluacion,
        newSabers: createdSabers,
        reusedSaberIds: [...raw.reusedSaberIds, ...reusedIds],
        momentos: await momentosFromPayload(raw, criterio, instrumentLabelByCode, aiConfig.model, {
          institutionId,
          userId: actorId,
          resourceId: dto.situationId,
        }),
        generationMode: 'AI_ENHANCED',
        validationErrors: [],
      }
    }
    lastErrors = validation.errors
    await recordAttempt(lastErrors)
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: buildCorrectionMessage(validation.errors, repaired, ctx),
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
