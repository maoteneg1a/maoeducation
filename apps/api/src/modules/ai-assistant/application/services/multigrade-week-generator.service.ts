import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildSituationTitle } from '../../../planning/domain/situation-title'
import { draftCompetencyWeek } from './competency-pedagogical-generator.service'
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
  academicPeriodId: string
  /** Número relativo de semana dentro del bloque multigrado (1..N) — igual para todos los grados participantes esa semana. */
  weekNumber: number
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

/** Reusa la situación existente del período o la crea con la competencia ancla ya resuelta — el docente nunca elige competencia a mano en multigrado. */
async function ensureSituation(
  institutionId: string,
  actorId: string,
  planId: string,
  academicPeriodId: string,
  competencyAreaId: string,
  subnivel: string,
) {
  const existing = await prisma.learningSituation.findFirst({ where: { planId, academicPeriodId } })
  if (existing) return existing
  const period = await prisma.academicPeriod.findUnique({ where: { id: academicPeriodId } })
  if (!period) throw new NotFoundError('Periodo académico no encontrado')
  const competency = await anchorCompetency(competencyAreaId, subnivel)
  const title = buildSituationTitle(competency.code, competency.text)
  return prisma.learningSituation.create({
    data: {
      institutionId,
      planId,
      academicPeriodId,
      title,
      startDate: period.startDate,
      endDate: period.endDate,
      competencyIds: [competency.id],
      createdBy: actorId,
    },
  })
}

/** Reusa el slot de semana si ya existe (reintento) o lo crea vacío — mismo patrón idempotente de draft-situation-block.service.ts. */
async function ensureWeekSlot(institutionId: string, situationId: string, weekNumber: number, competencyIds: string[]) {
  const existing = await prisma.planningWeek.findUnique({
    where: { situationId_weekNumber: { situationId, weekNumber } },
  })
  if (existing) return existing
  return prisma.planningWeek.create({
    data: { institutionId, situationId, weekNumber, competencyIds },
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
  academicPeriodId: string,
  weekNumber: number,
  participants: { gradeLabel: string; subjectName: string }[],
) {
  const existing = await prisma.multigradeSharedExperience.findUnique({
    where: { groupId_academicPeriodId_weekNumber: { groupId: group.id, academicPeriodId, weekNumber } },
  })
  if (existing) return existing

  const participantsBlock = participants.map((p) => `- ${p.gradeLabel} — ${p.subjectName}`).join('\n')
  const systemPrompt = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos UNIDOCENTES/PLURIDOCENTES (multigrado) a plantear la EXPERIENCIA COMÚN de una semana de clase compartida entre varios grados a la vez, siguiendo el Currículo Nacional por Competencias (CNC) del MINEDUC.

Grados y materias que comparten esta semana en la misma aula:
${participantsBlock}

Genera con la herramienta:
1. title: título corto y concreto de la situación/experiencia común de esta semana (no repitas ningún nombre de materia literal).
2. context: 2-3 líneas describiendo la situación disparadora que se plantea IGUAL para toda el aula multigrado a la vez (un contexto real y compartido — ej. una feria escolar, el huerto, una visita, una campaña) — nunca un currículo específico de un solo grado.
3. commonPurpose: qué logran en conjunto todos los grados con esta experiencia — texto DISTINTO en palabras de "context" (no repitas frases).

Reglas estrictas: no menciones competencias/indicadores específicos de ningún grado (eso lo maneja cada grado por separado más adelante); no repitas frases entre title/context/commonPurpose; la experiencia debe tener sentido genuino para TODOS los grados listados a la vez, sin favorecer solo uno.`

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
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
        tools: [
          { name: 'submit_shared_experience', description: 'Envía la experiencia común multigrado', input_schema: EXPERIENCE_SCHEMA },
        ],
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
        action: 'ai.draft_multigrade_shared_experience',
        resourceType: 'multigrade_group',
        resourceId: group.id,
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

  const group = await prisma.multigradeGroup.findFirst({
    where: { id: dto.groupId, institutionId },
    include: {
      members: {
        include: {
          courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } },
        },
      },
    },
  })
  if (!group) throw new NotFoundError('Aula multigrado no encontrada')
  if (group.members.length < 2) {
    throw new BadRequestError('El aula multigrado necesita al menos 2 grados+materias para generar una experiencia común')
  }

  const period = await prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } })
  if (!period) throw new NotFoundError('Periodo académico no encontrado')

  const prepared: {
    gradeCode: string
    courseAssignmentId: string
    situationId: string
    weekId: string
    competencyIds: string[]
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

    const plan = await ensurePlan(institutionId, actorId, assignment.id)
    const situation = await ensureSituation(
      institutionId,
      actorId,
      plan.id,
      dto.academicPeriodId,
      assignment.subject.competencyAreaId,
      subnivel,
    )
    const week = await ensureWeekSlot(institutionId, situation.id, dto.weekNumber, situation.competencyIds)

    prepared.push({
      gradeCode: member.gradeCode,
      courseAssignmentId: assignment.id,
      situationId: situation.id,
      weekId: week.id,
      competencyIds: situation.competencyIds,
      subjectName: assignment.subject.name,
      gradeLabel: assignment.parallel.level.name,
    })
  }

  const experience = await ensureSharedExperience(
    institutionId,
    actorId,
    aiConfig.model,
    group,
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

  return {
    experienceId: experience.id,
    title: experience.title,
    context: experience.context,
    commonPurpose: experience.commonPurpose,
    grades,
  }
}
