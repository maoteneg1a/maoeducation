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
import type { DraftCompetencyWeekDto, DraftCompetencyWeekResult, DraftedSaber } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const MAX_ATTEMPTS = 2

const PHASE_SCHEMA = {
  type: 'object' as const,
  properties: {
    activity: { type: 'string' },
    duaCodes: { type: 'array', items: { type: 'string' } },
    resources: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'string' },
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

interface RawGenerationPayload {
  identityCode: string
  indicadoresEvaluacion: string
  newSabers: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  reusedSaberIds: string[]
  methodology: Record<'ANTICIPATION' | 'CONSTRUCTION' | 'CONSOLIDATION', { activity: string; duaCodes: string[]; resources: string[]; evidence: string }>
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

function momentosFromPayload(raw: RawGenerationPayload): DraftCompetencyWeekResult['momentos'] {
  const format = (phase: 'ANTICIPATION' | 'CONSTRUCTION' | 'CONSOLIDATION') => {
    const m = raw.methodology[phase]
    return {
      estrategiasDua: `${m.activity} (DUA: ${m.duaCodes.join(', ') || 'ninguno'})`,
      recursos: m.resources.join(', '),
      tecnica: phase === 'CONSOLIDATION' ? raw.assessment.technique : '',
      instrumento: phase === 'CONSOLIDATION' ? raw.assessment.instrument : '',
    }
  }
  return {
    anticipacion: format('ANTICIPATION'),
    construccionConocimiento: format('CONSTRUCTION'),
    consolidacion: format('CONSOLIDATION'),
  }
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
3. methodology: para ANTICIPATION, CONSTRUCTION y CONSOLIDATION — cada fase necesita: activity (una actividad CONCRETA y ESPECÍFICA de al menos 8 palabras, nunca genérica tipo "trabajar en grupos"), duaCodes (1-2 códigos del catálogo dado, coherentes con esa fase), resources (recursos que DEBEN mencionarse literalmente dentro del texto de activity), evidence (evidencia observable, distinta del texto de la actividad).
4. assessment: activity, technique (código del catálogo), instrument (compatible con esa técnica), evidence (observable, distinta de activity), criteria (lista de 2-3 criterios que retomen literalmente palabras clave del indicador de evaluación).

Sé concreto. No inventes códigos de competencia, indicador, DUA, técnica o instrumento fuera de los dados.`

  const client = getAnthropicClient()
  let lastErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const correction = attempt > 1 ? `\n\nCorrige ÚNICAMENTE estos errores de tu respuesta anterior: ${lastErrors.join(', ')}.` : ''
    const response = await client.messages.create({
      model: aiConfig.model,
      max_tokens: 2200,
      system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Genera el borrador de esta semana.${correction}` }],
      tools: [{ name: 'submit_competency_week_draft', description: 'Envía el borrador estructurado', input_schema: RESPONSE_SCHEMA }],
      tool_choice: { type: 'tool', name: 'submit_competency_week_draft' },
    })

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

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastErrors = ['NO_TOOL_USE_RETURNED']
      continue
    }
    const raw = toolUse.input as RawGenerationPayload

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
        momentos: momentosFromPayload(raw),
        generationMode: 'AI_ENHANCED',
        validationErrors: [],
      }
    }
    lastErrors = validation.errors
  }

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
