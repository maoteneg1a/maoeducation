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
  type GeneratedCompetencyPedagogyPayload,
  type GeneratedResourceLink,
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
    // (ficha, organizador, guía, rúbrica) — describe su contenido en documentSpec, el
    // sistema genera el PDF y te devuelve su link real.
    kind: { type: 'string', enum: ['web_search', 'generate_document'] },
    searchQuery: { type: 'string' },
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

const ACTIVITY_SCHEMA = {
  type: 'object' as const,
  properties: {
    text: { type: 'string' },
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
    resources: { type: 'array', items: { type: 'string' } },
    resourceLink: RESOURCE_LINK_SCHEMA,
    assessment: {
      type: 'object',
      properties: {
        evidence: { type: 'string' },
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
 * Si el link pedido es "web_search", ya trae la URL real que Claude encontró
 * con la herramienta de búsqueda — solo se empaqueta. Si es "generate_document",
 * genera el PDF del documentSpec (reusa el mismo motor que las fichas de
 * recurso), lo sube al storage, y devuelve su URL pública. Nunca lanza: un
 * fallo aquí (storage caído, etc.) simplemente omite el link.
 */
async function resolveLink(
  link: (GeneratedResourceLink & { documentSpec?: DocumentSpec; resolvedTitle?: string }) | undefined,
  fallbackTitle: string,
): Promise<{ title: string; url: string } | undefined> {
  if (!link) return undefined
  try {
    if (link.kind === 'web_search') {
      if (!link.resolvedUrl) return undefined
      return { title: link.resolvedTitle ?? fallbackTitle, url: link.resolvedUrl }
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
    resolveLink(raw.resourceLink, 'Recurso'),
    resolveLink(raw.assessment.instrumentLink, 'Instrumento'),
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

  // Se genera para la primera competencia seleccionada (una semana puede tener varias,
  // pero el borrador de metodología/evaluación se ancla a la principal para mantener
  // el prompt e identidad simples — el docente ajusta manualmente si combina varias).
  const primary = competencies[0]
  const primaryIndicator = primary.indicators[0]
  const identityCode = primaryIndicator ? primaryIndicator.code : primary.code
  const indicadoresEvaluacion = formatIndicatorsWithCode(competencies) || primary.code
  const criterio = indicatorCodes(competencies) || primary.code

  // Distribución de saberes entre semanas del bloque — calcado del motor de
  // TIGA (competency_capacity + reparto rotatorio por posición): asignar TODOS
  // los saberes de la competencia a cada semana es imposible de cubrir (ej. 17
  // saberes en 1 semana), así que cada semana recibe solo el subconjunto que
  // le corresponde según su posición en el bloque.
  const totalWeeksInBlock = Math.max(situation.weeks.length, 1)
  const currentWeekNumber = dto.weekNumber ?? 1
  const primarySabersForWeek = selectSabersForWeek(primary.sabers, currentWeekNumber, totalWeeksInBlock)

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
  const phaseCounts = weeklyPhaseCounts(workload.weeklyPeriods)

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
    await assertBudgetAvailable(institutionId, aiConfig.monthlyTokenCap)
  } catch {
    return fallbackResult(['MONTHLY_TOKEN_CAP_REACHED'])
  }

  const competenciesBlock = competencies
    .map((c) => {
      const indicators = c.indicators.map((i) => `    - [${i.code}] ${i.text}`).join('\n') || '    (sin indicadores)'
      const sabersForWeek = selectSabersForWeek(c.sabers, currentWeekNumber, totalWeeksInBlock)
      const sabers = sabersForWeek.length
        ? sabersForWeek.map((s) => `      - [${s.id}] (${s.type}) ${s.code}: ${s.description}`).join('\n')
        : '      (sin saberes — propone nuevos)'
      return `- ${c.code}: ${c.text}\n  Indicadores:\n${indicators}\n  Saberes de ESTA semana (reusa por id — es un subconjunto ya repartido entre las ${totalWeeksInBlock} semanas del bloque, no todos los que tiene la competencia):\n${sabers}`
    })
    .join('\n\n')

  const duaCatalogText = duaCheckpoints
    .map((cp) => `  [${cp.operationalCode}] ${cp.principleName} — ${cp.guidelineName}`)
    .join('\n')
  const techniquesText = assessmentTechniques
    .map((t) => `  ${t.code} (${t.label}) -> instrumentos válidos: ${t.compatibleInstrumentCodes.join(', ')}`)
    .join('\n')

  const densityLine = workload.weeklyPeriods
    ? `Carga horaria: ${workload.weeklyPeriods} períodos/semana. Número de actividades numeradas que DEBES generar por fase: Inicio ${phaseCounts.anticipation}, Desarrollo ${phaseCounts.construction}, Cierre ${phaseCounts.consolidation}. Respeta este número exacto — ni más ni menos. NUNCA menos de 2 actividades en ninguna fase, sin excepción.`
    : 'Carga horaria no configurada para este grado+materia — genera exactamente 2 actividades en Inicio, 2 en Desarrollo y 2 en Cierre (densidad estándar). NUNCA menos de 2 actividades en ninguna fase, sin excepción.'

  const systemPrompt = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a redactar la planificación microcurricular semanal (PUD) por COMPETENCIAS, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Asignatura: ${situation.plan.courseAssignment.subject.name}
Grado/Curso: ${situation.plan.courseAssignment.parallel.level.name}
Trimestre: ${situation.academicPeriod.name}
${densityLine}

Competencias seleccionadas por el docente:

${competenciesBlock}

Identidad inmutable de esta generación (repítela EXACTA en identityCode, no la alteres): "${identityCode}"

Catálogo DUA disponible — cada actividad debe llevar EXACTAMENTE UN código de este catálogo, no inventes otros:
${duaCatalogText}

Catálogo de evaluación — technique debe ser uno de estos códigos EXACTOS, e instrument debe ser uno de sus instrumentos compatibles listados:
${techniquesText}

IMPORTANTE — terminología del documento final: las 3 fases se llaman "Inicio", "Desarrollo" y "Cierre" (nunca "Anticipación"/"Construcción"/"Consolidación" — esos son solo los nombres técnicos internos de las claves ANTICIPATION/CONSTRUCTION/CONSOLIDATION que usas en el JSON, el docente nunca los ve).

Genera:
1. Saberes: pon en reusedSaberIds ÚNICAMENTE los ids listados arriba en "Saberes de ESTA semana" de cada competencia — NUNCA agregues otros saberes de la competencia que no estén en esa lista, aunque los conozcas por el código; esa lista ya es el subconjunto correcto para esta semana específica del bloque, no toda la competencia. Si una competencia no tiene ningún saber listado, propone 1-2 nuevos de cada tipo en newSabers con code "<código_competencia>.d.1"/".p.1"/".a.1".
2. methodology: para ANTICIPATION (Inicio), CONSTRUCTION (Desarrollo) y CONSOLIDATION (Cierre) — cada fase es una lista de "activities", con EXACTAMENTE el número de actividades indicado arriba en "Número de actividades...". Cada actividad tiene:
   - text: una actividad CONCRETA y ESPECÍFICA de al menos 8 palabras, nunca genérica tipo "trabajar en grupos".
   - duaCode: EXACTAMENTE un código del catálogo DUA dado arriba, coherente con esa fase y esa actividad específica (no repitas el mismo código en todas las actividades salvo que realmente aplique).
3. resources: lista de 3-6 recursos CONCRETOS para TODA la semana (no por fase) — cada uno una palabra o frase CORTA de 1-3 palabras, SIN paréntesis ni descripciones — que aparezca mencionado (mismas palabras) en al menos una de las actividades de methodology. NO repitas la misma redacción de las actividades: el recurso es solo el NOMBRE del material, la actividad ya explica el uso.
4. resourceLink (OPCIONAL): si uno de los recursos de la semana es un material DIGITAL que debería tener un enlace real:
   - kind="web_search" + searchQuery: cuando el recurso ya existe publicado en internet (video, imagen, artículo). Usa la herramienta de búsqueda web ANTES de llamar a submit_competency_week_draft, y solo si encuentras un resultado real completa resolvedUrl (URL exacta, sin modificar) y resolvedTitle. Si no encuentras nada útil, NO incluyas resourceLink.
   - kind="generate_document" + documentSpec: cuando el recurso es un material que NO existe en internet pero es simple de producir (ficha, organizador gráfico, guía de trabajo) — documentSpec describe título/instrucciones/bloques (paragraph, numbered_lines, table con headers+rows, o blank_space con label).
   - Si el recurso es solo un material físico genérico (pizarra, cuaderno), NO agregues resourceLink.
5. assessment: evaluación de TODA la semana (una sola, no por fase):
   - evidence: el producto o desempeño observable que demuestra el aprendizaje de la semana — DEBE ser distinto en palabras de cualquiera de las actividades de methodology (no repitas la misma redacción, aporta información nueva: qué se entrega/observa, no qué se hizo).
   - technique: código del catálogo de evaluación.
   - instrument: instrumento compatible con esa técnica (del catálogo).
   - instrumentLink (OPCIONAL): si el instrumento (ej. una rúbrica o lista de cotejo) conviene entregarse como documento descargable, usa kind="generate_document" con documentSpec describiendo una tabla de rúbrica/lista de cotejo con los criterios de evaluación como filas — reusa el mismo formato de documentSpec que resourceLink.

No redactes "criterio" ni "indicadoresEvaluacion" — el sistema los deriva automáticamente de los códigos de indicador ya seleccionados por el docente.

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

    for (let resumes = 0; resumes <= MAX_PAUSE_RESUMES; resumes++) {
      try {
        response = await client.messages.create({
          model: aiConfig.model,
          max_tokens: 4096,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages,
          tools: [...tools, ...serverTools],
          tool_choice: { type: 'auto' },
        })
      } catch (error) {
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
    if (!raw.methodology || !raw.assessment || !raw.resources) {
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
    const validation = validateGeneratedCompetencyPedagogy(toValidationPayload(raw), ctx)

    if (validation.status === 'VERIFIED') {
      const { createdSabers, reusedIds } = await persistSabers(raw.newSabers, competencies)
      return {
        indicadoresEvaluacion,
        newSabers: createdSabers,
        reusedSaberIds: [...raw.reusedSaberIds, ...reusedIds],
        momentos: await momentosFromPayload(raw, criterio, instrumentLabelByCode),
        generationMode: 'AI_ENHANCED',
        validationErrors: [],
      }
    }
    lastErrors = validation.errors
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
