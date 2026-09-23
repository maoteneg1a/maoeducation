import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { generateSituationNarrativeSafe } from './situation-narrative-generator.service'
import { draftCompetencyWeek } from './competency-pedagogical-generator.service'
import { assertBudgetAvailable } from './ai-budget.service'
import type { DraftCompetencyWeekResult } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const MAX_ATTEMPTS = 2
const MIN_WORDS = 6

const EXPERIENCE_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' },
    context: { type: 'string' },
    commonPurpose: { type: 'string' },
  },
  required: ['title', 'context', 'commonPurpose'],
  additionalProperties: false,
}

export interface DraftMultigradeWeekDto {
  groupId: string
  /** Filtra los miembros del grupo a solo esta materia — la experiencia común se genera
   * POR MATERIA (ver comentario en schema.prisma MultigradeSharedExperience.subjectId),
   * nunca mezclando materias distintas de un mismo bloque. */
  subjectId: string
  academicPeriodId: string
  /** Número relativo de semana dentro del bloque multigrado (1..N) — igual para todos los grados participantes esa semana. */
  weekNumber: number
  /**
   * Competencia + saberes YA REVISADOS por el docente (paso de sugerencia previo,
   * ver suggestMultigradeWeek) — uno por grado participante. Sin esto, cada grado
   * usaría siempre la competencia "ancla" automática (comportamiento anterior).
   */
  grades?: { courseAssignmentId: string; competencyId: string; saberIds: string[] }[]
}

export interface SuggestMultigradeWeekDto {
  groupId: string
  subjectId: string
  academicPeriodId: string
  weekNumber: number
}

export interface SuggestedMultigradeGrade {
  courseAssignmentId: string
  gradeCode: string
  gradeLabel: string
  competencyId: string
  competencyCode: string
  competencyText: string
  sabers: { id: string; type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  saberIds: string[]
}

export interface DraftedMultigradeGrade {
  gradeCode: string
  courseAssignmentId: string
  situationId: string
  planningWeekId: string
  generationMode: DraftCompetencyWeekResult['generationMode']
  validationErrors: string[]
}

export interface DraftMultigradeWeekResult {
  experienceId: string
  title: string
  context: string
  commonPurpose: string
  grades: DraftedMultigradeGrade[]
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Competencia "ancla" de una situación multigrado recién creada — la primera
 * (por sortOrder/code, orden estable) del área+subnivel de la materia. El
 * docente NUNCA la elige a mano: "cero configuración manual" pedido
 * explícitamente por el usuario para el wizard/generador multigrado. No
 * pretende cubrir el período completo (eso lo decide el docente después
 * agregando más semanas/competencias desde la Planificación normal si quiere)
 * — es el mínimo suficiente para que la primera semana se pueda generar sin
 * ninguna pantalla intermedia.
 */
async function anchorCompetency(competencyAreaId: string, subnivel: string) {
  const competency = await prisma.competency.findFirst({
    where: { areaId: competencyAreaId, subnivel, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  if (!competency) {
    throw new BadRequestError(
      `No hay competencias cargadas para el subnivel "${subnivel}" — contacta soporte antes de generar multigrado`,
    )
  }
  return competency
}

/** Saberes de una competencia filtrados por grado — mismo criterio que availableCompetenciesForDistribution/listSaberesForCompetency (granularidad TIGA: CompetencySaber.gradeCodes vacío = aplica a todo el subnivel). */
async function saberesForCompetencyAndGrade(competencyId: string, gradeCode: string) {
  const sabers = await prisma.competencySaber.findMany({
    where: { competencyId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  })
  return sabers.filter((s) => s.gradeCodes.length === 0 || s.gradeCodes.includes(gradeCode))
}

/**
 * Paso de revisión (pedido explícito del usuario, mismo patrón que
 * DistributionWizard/suggestDistribution del flujo individual): antes de
 * generar contenido con IA, resuelve — SIN escribir nada todavía — qué
 * competencia+saberes se usarían para cada grado de este bloque de materia,
 * para que el docente los revise/ajuste (o reemplace la competencia por otra
 * del banco, vía /competency-curriculum ya existente) antes de confirmar.
 */
export async function suggestMultigradeWeek(
  institutionId: string,
  dto: SuggestMultigradeWeekDto,
): Promise<SuggestedMultigradeGrade[]> {
  const group = await prisma.multigradeGroup.findFirst({
    where: { id: dto.groupId, institutionId },
    include: {
      members: {
        where: { subjectId: dto.subjectId },
        include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } },
      },
    },
  })
  if (!group) throw new NotFoundError('Aula multigrado no encontrada')
  if (group.members.length < 2) {
    throw new BadRequestError('Esta materia necesita al menos 2 grados en el aula multigrado para generar una experiencia común')
  }

  const period = await prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } })
  if (!period) throw new NotFoundError('Periodo académico no encontrado')

  const suggestions: SuggestedMultigradeGrade[] = []
  for (const member of group.members) {
    const assignment = member.courseAssignment
    if (!assignment.subject.competencyAreaId) {
      throw new BadRequestError(`La materia "${assignment.subject.name}" no tiene área de competencias vinculada`)
    }
    const subnivel = assignment.parallel.level.subnivel
    if (!subnivel) throw new BadRequestError(`El grado "${member.gradeCode}" no tiene subnivel configurado`)

    // Ya existe una situación/semana para este período+grado (ej. el docente
    // vuelve a revisar) — se sugiere su competencia actual, no una nueva ancla.
    const existingSituation = await prisma.learningSituation.findFirst({
      where: { plan: { courseAssignmentId: assignment.id }, academicPeriodId: dto.academicPeriodId },
    })
    const existingWeek = existingSituation
      ? await prisma.planningWeek.findUnique({
          where: { situationId_weekNumber: { situationId: existingSituation.id, weekNumber: dto.weekNumber } },
        })
      : null

    const competency =
      existingWeek?.competencyIds[0]
        ? await prisma.competency.findUnique({ where: { id: existingWeek.competencyIds[0] } })
        : await anchorCompetency(assignment.subject.competencyAreaId, subnivel)
    if (!competency) throw new NotFoundError('Competencia no encontrada')

    const sabers = await saberesForCompetencyAndGrade(competency.id, member.gradeCode)
    const preselectedSaberIds = existingWeek?.competencySaberIds.length ? existingWeek.competencySaberIds : sabers.map((s) => s.id)

    suggestions.push({
      courseAssignmentId: assignment.id,
      gradeCode: member.gradeCode,
      gradeLabel: assignment.parallel.level.name,
      competencyId: competency.id,
      competencyCode: competency.code,
      competencyText: competency.text,
      sabers: sabers.map((s) => ({ id: s.id, type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description })),
      saberIds: preselectedSaberIds,
    })
  }
  return suggestions
}

/** Reusa el PCA existente de la asignación o lo crea con la plantilla por defecto — el docente nunca pasa por Planificación > PCA a mano. */
async function ensurePlan(institutionId: string, actorId: string, courseAssignmentId: string) {
  const existing = await prisma.curriculumPlan.findUnique({ where: { courseAssignmentId } })
  if (existing) return existing
  const template = await prisma.planningTemplate.findFirst({
    where: { institutionId, type: 'pca', isActive: true },
    orderBy: { isDefault: 'desc' },
  })
  if (!template) throw new NotFoundError('No hay plantilla de PCA configurada para esta institución')
  return prisma.curriculumPlan.create({
    data: { institutionId, courseAssignmentId, templateId: template.id, createdBy: actorId },
  })
}

/**
 * Reusa la situación existente del período o la crea. Si el docente ya revisó
 * la sugerencia (suggestMultigradeWeek) y confirmó una competencia específica
 * (`chosenCompetencyId`), se usa esa — sin ella, cae al comportamiento
 * anterior (competencia ancla automática, cero configuración manual).
 */
async function ensureSituation(
  institutionId: string,
  actorId: string,
  planId: string,
  academicPeriodId: string,
  competencyAreaId: string,
  subnivel: string,
  subjectName: string,
  gradeName: string,
  chosenCompetencyId?: string,
) {
  const existing = await prisma.learningSituation.findFirst({ where: { planId, academicPeriodId } })
  if (existing) return existing
  const period = await prisma.academicPeriod.findUnique({ where: { id: academicPeriodId } })
  if (!period) throw new NotFoundError('Periodo académico no encontrado')
  const competency = chosenCompetencyId
    ? await prisma.competency.findUniqueOrThrow({ where: { id: chosenCompetencyId } })
    : await anchorCompetency(competencyAreaId, subnivel)
  // Título+descripción redactados por IA (con fallback mecánico si no está
  // disponible) — mismo generador reusado de confirmDistribution, con el
  // contexto más angosto que hay aquí (solo la competencia ancla, sin
  // saberes de bloque completo).
  const narrative = await generateSituationNarrativeSafe(institutionId, actorId, `${planId}:${academicPeriodId}`, competency.code, competency.text, {
    subjectName,
    gradeName,
    periodName: period.name,
    competencyTexts: [competency.text],
    saberDescriptions: [],
  })
  return prisma.learningSituation.create({
    data: {
      institutionId,
      planId,
      academicPeriodId,
      title: narrative.title,
      description: narrative.description,
      startDate: period.startDate,
      endDate: period.endDate,
      interdisciplinaryAreaIds: [],
      interdisciplinarySubjectIds: [],
      competencyIds: [competency.id],
      createdBy: actorId,
    },
  })
}

/** Reusa el slot de semana si ya existe (reintento) o lo crea vacío (o con los saberes ya revisados por el docente) — mismo patrón idempotente de draft-situation-block.service.ts. */
async function ensureWeekSlot(
  institutionId: string,
  situationId: string,
  weekNumber: number,
  competencyIds: string[],
  saberIds?: string[],
) {
  const existing = await prisma.planningWeek.findUnique({
    where: { situationId_weekNumber: { situationId, weekNumber } },
  })
  if (existing) return existing
  return prisma.planningWeek.create({
    data: { institutionId, situationId, weekNumber, competencyIds, competencySaberIds: saberIds ?? [] },
  })
}

/**
 * Genera (o reusa, si ya existe — idempotente ante reintentos) UNA "experiencia
 * común" multigrado con IA: título/contexto/propósito compartido que se
 * plantea IGUAL para todos los grados participantes de esa semana — NUNCA un
 * currículo común, solo la situación disparadora. Reintenta con `messages`
 * persistente entre intentos (mismo patrón corregido en
 * competency-pedagogical-generator.service.ts — nunca reconstruir desde cero).
 */
async function ensureSharedExperience(
  institutionId: string,
  actorId: string,
  aiModel: string,
  group: { id: string },
  subjectId: string,
  academicPeriodId: string,
  weekNumber: number,
  participants: { gradeLabel: string; subjectName: string }[],
) {
  const existing = await prisma.multigradeSharedExperience.findUnique({
    where: { groupId_subjectId_academicPeriodId_weekNumber: { groupId: group.id, subjectId, academicPeriodId, weekNumber } },
  })
  if (existing) return existing

  const participantsBlock = participants.map((p) => `- ${p.gradeLabel} — ${p.subjectName}`).join('\n')
  // Bloque fijo, separado del bloque variable (grados/materias de ESTE grupo)
  // por la misma razón que en los demás generadores: un solo bloque ephemeral
  // con datos variables nunca logra cache hit entre grupos multigrado distintos.
  const staticInstructions = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos UNIDOCENTES/PLURIDOCENTES (multigrado) a plantear la EXPERIENCIA COMÚN de una semana de clase compartida entre varios grados a la vez, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Genera con la herramienta:
1. title: título corto y concreto de la situación/experiencia común de esta semana (no repitas ningún nombre de materia literal).
2. context: 2-3 líneas describiendo la situación disparadora que se plantea IGUAL para toda el aula multigrado a la vez (un contexto real y compartido — ej. una feria escolar, el huerto, una visita, una campaña) — nunca un currículo específico de un solo grado.
3. commonPurpose: qué logran en conjunto todos los grados con esta experiencia — texto DISTINTO en palabras de "context" (no repitas frases).

Reglas estrictas: no menciones competencias/indicadores específicos de ningún grado (eso lo maneja cada grado por separado más adelante); no repitas frases entre title/context/commonPurpose; la experiencia debe tener sentido genuino para TODOS los grados listados a la vez, sin favorecer solo uno.`

  const participantsContext = `Grados y materias que comparten esta semana en la misma aula:\n${participantsBlock}`

  const client = getAnthropicClient()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Genera la experiencia común de esta semana multigrado.' },
  ]
  let verified: { title: string; context: string; commonPurpose: string } | null = null
  let lastErrors: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response: Anthropic.Message | undefined
    try {
      response = await client.messages.create({
        model: aiModel,
        max_tokens: 1024,
        system: [
          { type: 'text', text: staticInstructions, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: participantsContext },
        ],
        messages,
        tools: [
          { name: 'submit_shared_experience', description: 'Envía la experiencia común multigrado', input_schema: EXPERIENCE_SCHEMA },
        ],
        // Ver nota equivalente en competency-pedagogical-generator.service.ts —
        // extracción estructurada, no razonamiento abierto.
        thinking: { type: 'disabled' },
        tool_choice: { type: 'auto' },
      })
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined
      lastErrors = [`API_ERROR_${status ?? 'UNKNOWN'}`]
      if (status === 401 || status === 403 || status === 429) break
      continue
    }

    const recordAttempt = (errors: string[]) =>
      prisma.auditLog.create({
        data: {
          institutionId,
          userId: actorId,
          action: 'ai.draft_multigrade_shared_experience',
          resourceType: 'multigrade_group',
          resourceId: group.id,
          newValue: {
            model: aiModel,
            attempt,
            inputTokens: response!.usage.input_tokens,
            outputTokens: response!.usage.output_tokens,
            cacheReadTokens: response!.usage.cache_read_input_tokens ?? 0,
            errors,
          },
        },
      })

    const toolUse = response.content.find((b) => b.type === 'tool_use')
    if (!toolUse || toolUse.type !== 'tool_use') {
      lastErrors = ['NO_TOOL_USE_RETURNED']
      await recordAttempt(lastErrors)
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: 'Debes llamar a submit_shared_experience con la experiencia completa — no respondas con texto libre.',
      })
      continue
    }

    const raw = toolUse.input as { title?: string; context?: string; commonPurpose?: string }
    const errors: string[] = []
    const fields: [string, string | undefined][] = [
      ['title', raw.title],
      ['context', raw.context],
      ['commonPurpose', raw.commonPurpose],
    ]
    for (const [name, value] of fields) {
      if (!value || typeof value !== 'string' || wordCount(value) < (name === 'title' ? 2 : MIN_WORDS)) {
        errors.push(`${name.toUpperCase()}_TOO_SHORT_OR_MISSING`)
      }
    }
    const texts = [raw.context, raw.commonPurpose].filter((t): t is string => typeof t === 'string' && t.length > 0)
    if (new Set(texts.map((t) => t.trim().toLowerCase())).size < texts.length) errors.push('FIELDS_REPEATED')

    await recordAttempt(errors)
    if (errors.length === 0) {
      verified = { title: raw.title!.trim().slice(0, 200), context: raw.context!.trim(), commonPurpose: raw.commonPurpose!.trim() }
      break
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
          content: `Corrige ÚNICAMENTE estos errores y vuelve a llamar la herramienta con la experiencia completa corregida: ${errors.join(', ')}.`,
        },
      ],
    })
  }

  if (!verified) {
    throw new BadRequestError(
      `No se pudo generar la experiencia común multigrado tras ${MAX_ATTEMPTS} intentos (${lastErrors.join(', ')}). Intenta de nuevo.`,
    )
  }

  return prisma.multigradeSharedExperience.create({
    data: {
      institutionId,
      groupId: group.id,
      subjectId,
      academicPeriodId,
      weekNumber,
      title: verified.title,
      context: verified.context,
      commonPurpose: verified.commonPurpose,
      participantGradeCodes: [],
      createdBy: actorId,
    },
  })
}

/**
 * Genera la semana multigrado completa de una sola pasada: UNA experiencia
 * común (IA, ver ensureSharedExperience) MÁS, por cada grado del grupo, su
 * propia semana completa en el formato ya calcado de TIGA (Inicio/Desarrollo/
 * Cierre) — reusando EXACTAMENTE el motor en dos capas de
 * draftCompetencyWeek (una sola materia), solo que N veces, con la primera
 * actividad de Inicio de cada grado conectada a la experiencia común.
 *
 * Cero configuración manual (pedido explícito del usuario): si algún grado
 * todavía no tiene PCA/Situación/competencia elegida, se crean automáticamente
 * aquí (ensurePlan/ensureSituation con competencia ancla) — el docente nunca
 * necesita pasar por otra pantalla antes de generar.
 *
 * Cada grado conserva SU PROPIO PlanningWeek — nunca se mezcla contenido
 * curricular entre grados (calcado de la regla autoritativa de TIGA
 * Multigrado v1.0: "cada grado conserva su propio currículo/competencia/
 * indicador/saberes independientes").
 */
export async function draftMultigradeWeek(
  institutionId: string,
  actorId: string,
  dto: DraftMultigradeWeekDto,
): Promise<DraftMultigradeWeekResult> {
  if (!isAnthropicConfigured()) throw new ForbiddenError('El asistente IA no está configurado en el servidor')
  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) throw new ForbiddenError('El asistente IA no está habilitado para esta institución')
  await assertBudgetAvailable(institutionId, aiConfig)
  const operationStartedAt = new Date()

  const group = await prisma.multigradeGroup.findFirst({
    where: { id: dto.groupId, institutionId },
    include: {
      members: {
        where: { subjectId: dto.subjectId },
        include: {
          courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } },
        },
      },
    },
  })
  if (!group) throw new NotFoundError('Aula multigrado no encontrada')
  if (group.members.length < 2) {
    throw new BadRequestError('Esta materia necesita al menos 2 grados en el aula multigrado para generar una experiencia común')
  }

  const chosenByAssignment = new Map((dto.grades ?? []).map((g) => [g.courseAssignmentId, g]))

  const period = await prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } })
  if (!period) throw new NotFoundError('Periodo académico no encontrado')

  const prepared: {
    gradeCode: string
    courseAssignmentId: string
    situationId: string
    weekId: string
    competencyIds: string[]
    selectedSaberIds?: string[]
    subjectName: string
    gradeLabel: string
  }[] = []

  for (const member of group.members) {
    const assignment = member.courseAssignment
    if (!assignment.subject.competencyAreaId) {
      throw new BadRequestError(
        `La materia "${assignment.subject.name}" no tiene área de competencias vinculada — no se puede generar multigrado`,
      )
    }
    const subnivel = assignment.parallel.level.subnivel
    if (!subnivel) {
      throw new BadRequestError(`El grado "${member.gradeCode}" no tiene subnivel configurado — contacta soporte`)
    }

    const chosen = chosenByAssignment.get(assignment.id)
    const plan = await ensurePlan(institutionId, actorId, assignment.id)
    const situation = await ensureSituation(
      institutionId,
      actorId,
      plan.id,
      dto.academicPeriodId,
      assignment.subject.competencyAreaId,
      subnivel,
      assignment.subject.name,
      assignment.parallel.level.name,
      chosen?.competencyId,
    )
    const week = await ensureWeekSlot(institutionId, situation.id, dto.weekNumber, situation.competencyIds, chosen?.saberIds)

    prepared.push({
      gradeCode: member.gradeCode,
      courseAssignmentId: assignment.id,
      situationId: situation.id,
      weekId: week.id,
      competencyIds: situation.competencyIds,
      selectedSaberIds: chosen?.saberIds,
      subjectName: assignment.subject.name,
      gradeLabel: assignment.parallel.level.name,
    })
  }

  const experience = await ensureSharedExperience(
    institutionId,
    actorId,
    aiConfig.model,
    group,
    dto.subjectId,
    dto.academicPeriodId,
    dto.weekNumber,
    prepared.map((p) => ({ gradeLabel: p.gradeLabel, subjectName: p.subjectName })),
  )
  // El grupo real de participantes de ESTA semana puede diferir de una llamada
  // a otra reintentada (ej. el docente agregó un grado nuevo después) — se
  // mantiene actualizado sin regenerar el texto ya verificado.
  const participantGradeCodes = [...new Set([...experience.participantGradeCodes, ...prepared.map((p) => p.gradeCode)])]
  if (participantGradeCodes.length !== experience.participantGradeCodes.length) {
    await prisma.multigradeSharedExperience.update({
      where: { id: experience.id },
      data: { participantGradeCodes },
    })
  }

  const grades: DraftedMultigradeGrade[] = []
  for (const p of prepared) {
    const result = await draftCompetencyWeek(institutionId, actorId, {
      situationId: p.situationId,
      competencyIds: p.competencyIds,
      weekNumber: dto.weekNumber,
      selectedSaberIds: p.selectedSaberIds,
      multigradeSharedExperience: {
        title: experience.title,
        context: experience.context,
        commonPurpose: experience.commonPurpose,
        gradeLabel: p.gradeLabel,
      },
    })

    await prisma.planningWeek.update({
      where: { id: p.weekId },
      data: {
        indicadoresEvaluacion: result.indicadoresEvaluacion,
        momentos: result.momentos as unknown as Prisma.InputJsonValue,
        competencySaberIds: [...result.reusedSaberIds, ...result.newSabers.map((s) => s.id)],
        multigradeExperienceId: experience.id,
      },
    })

    grades.push({
      gradeCode: p.gradeCode,
      courseAssignmentId: p.courseAssignmentId,
      situationId: p.situationId,
      planningWeekId: p.weekId,
      generationMode: result.generationMode,
      validationErrors: result.validationErrors,
    })
  }

  // Resumen agregado de TODA la operación multigrado (Prioridad 14 del plan
  // de optimización de costos) — antes solo se veía el costo grado por grado
  // en audit_logs, sin poder saber de un vistazo cuánto costó la operación
  // multigrado COMPLETA (experiencia común + N grados). Lee de vuelta los
  // logs que ya escribieron draftCompetencyWeek/resolveWebResource por cada
  // grado, en vez de acumular en memoria durante el loop, porque
  // draftCompetencyWeek no devuelve sus propios contadores de tokens.
  const perGradeLogs = await prisma.auditLog.findMany({
    where: {
      institutionId,
      action: { in: ['ai.draft_competency_week', 'ai.resolve_web_resource'] },
      resourceId: { in: prepared.map((p) => p.situationId) },
      createdAt: { gte: operationStartedAt },
    },
    select: { newValue: true },
  })
  const totals = perGradeLogs.reduce(
    (acc, log) => {
      const v = (log.newValue ?? {}) as { inputTokens?: number; outputTokens?: number; estimatedCostUsd?: number }
      acc.requests++
      acc.totalInputTokens += v.inputTokens ?? 0
      acc.totalOutputTokens += v.outputTokens ?? 0
      acc.totalCostUsd += v.estimatedCostUsd ?? 0
      return acc
    },
    { requests: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCostUsd: 0 },
  )
  await prisma.auditLog.create({
    data: {
      institutionId,
      userId: actorId,
      action: 'ai.draft_multigrade_week_summary',
      resourceType: 'multigrade_shared_experience',
      resourceId: experience.id,
      newValue: {
        multigradeGroupId: dto.groupId,
        gradeCount: prepared.length,
        requestsGenerated: totals.requests,
        totalInputTokens: totals.totalInputTokens,
        totalOutputTokens: totals.totalOutputTokens,
        totalCostUsd: totals.totalCostUsd,
      },
    },
  })

  return {
    experienceId: experience.id,
    title: experience.title,
    context: experience.context,
    commonPurpose: experience.commonPurpose,
    grades,
  }
}
