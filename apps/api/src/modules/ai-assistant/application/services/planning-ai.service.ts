import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import type { DraftWeekDto, DraftWeekResult } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    competenciasEspecificas: { type: 'string' },
    indicadoresEvaluacion: { type: 'string' },
    newSabers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['declarativo', 'procedimental', 'actitudinal'] },
          code: { type: 'string' },
          description: { type: 'string' },
        },
        required: ['type', 'code', 'description'],
        additionalProperties: false,
      },
    },
    reusedSaberIds: { type: 'array', items: { type: 'string' } },
    momentos: {
      type: 'object',
      properties: {
        anticipacion: { $ref: '#/$defs/momento' },
        construccionConocimiento: { $ref: '#/$defs/momento' },
        consolidacion: { $ref: '#/$defs/momento' },
      },
      required: ['anticipacion', 'construccionConocimiento', 'consolidacion'],
      additionalProperties: false,
    },
  },
  required: ['competenciasEspecificas', 'indicadoresEvaluacion', 'newSabers', 'reusedSaberIds', 'momentos'],
  additionalProperties: false,
  $defs: {
    momento: {
      type: 'object',
      properties: {
        estrategiasDua: { type: 'string' },
        recursos: { type: 'string' },
        tecnica: { type: 'string' },
        instrumento: { type: 'string' },
      },
      required: ['estrategiasDua', 'recursos', 'tecnica', 'instrumento'],
      additionalProperties: false,
    },
  },
}

async function assertBudgetAvailable(institutionId: string, monthlyTokenCap: number) {
  if (monthlyTokenCap <= 0) return
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const logs = await prisma.auditLog.findMany({
    where: { institutionId, action: 'ai.draft_week', createdAt: { gte: startOfMonth } },
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
 * Genera un borrador completo de una semana de Planificación Microcurricular
 * (competencias, indicadores, saberes y los 3 momentos DUA) a partir de las
 * destrezas que el docente ya seleccionó. Nunca guarda nada — el docente
 * revisa y confirma desde el formulario.
 */
export async function draftWeek(institutionId: string, actorId: string, dto: DraftWeekDto): Promise<DraftWeekResult> {
  if (!isAnthropicConfigured()) {
    throw new ForbiddenError('El asistente IA no está configurado en el servidor')
  }
  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) {
    throw new ForbiddenError('El asistente IA no está habilitado para esta institución')
  }
  await assertBudgetAvailable(institutionId, aiConfig.monthlyTokenCap)

  const situation = await prisma.learningSituation.findFirst({
    where: { id: dto.situationId, institutionId },
    include: {
      academicPeriod: true,
      plan: { include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } } },
    },
  })
  if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')

  const skills = dto.skillIds.length
    ? await prisma.curriculumSkill.findMany({
        where: { id: { in: dto.skillIds } },
        include: { criterion: true, sabers: { where: { isActive: true } } },
      })
    : []
  if (skills.length === 0) throw new NotFoundError('Selecciona al menos una destreza antes de generar el borrador')

  const skillsBlock = skills
    .map((skill) => {
      const existingSabers = skill.sabers.length
        ? skill.sabers.map((s) => `    - [${s.id}] (${s.type}) ${s.code}: ${s.description}`).join('\n')
        : '    (sin saberes cargados aún — propone 1-2 por cada tipo declarativo/procedimental/actitudinal)'
      return `- ${skill.code}: ${skill.description}${skill.indicatorText ? `\n  Indicador oficial: ${skill.indicatorText}` : ''}\n  Saberes ya existentes en el banco (reusa por id si aplican):\n${existingSabers}`
    })
    .join('\n\n')

  const systemPrompt = `Eres un asistente pedagógico que ayuda a docentes ecuatorianos a redactar la planificación microcurricular semanal (PUD), siguiendo el Currículo Priorizado con Énfasis en Competencias del MINEDUC.

Asignatura: ${situation.plan.courseAssignment.subject.name}
Grado/Curso: ${situation.plan.courseAssignment.parallel.level.name}
Trimestre: ${situation.academicPeriod.name}

Destrezas seleccionadas por el docente para esta semana:

${skillsBlock}

Genera un borrador de la semana con:
1. competenciasEspecificas: una redacción breve y concreta de la(s) competencia(s) específica(s) que cubre la semana, basada en las destrezas.
2. indicadoresEvaluacion: los indicadores de evaluación (usa los oficiales si existen, o formúlalos brevemente).
3. Saberes: para cada destreza, si YA tiene saberes en el banco, reusa sus ids en reusedSaberIds (no los reescribas). Si NO tiene, propón 1-2 saberes nuevos de CADA tipo (declarativo/procedimental/actitudinal) en newSabers, con code siguiendo el patrón "<código_destreza>.d.1", ".p.1", ".a.1" y una descripción breve y concreta, coherente con la destreza.
4. momentos: para Anticipación, Construcción del Conocimiento y Consolidación — sugiere estrategiasDua (una estrategia concreta y variada por momento, cubriendo entre los 3 momentos los 3 principios DUA: representación, acción/expresión, motivación), recursos (materiales concretos disponibles en un aula ecuatoriana típica), tecnica e instrumento de evaluación apropiados para esa actividad puntual.

Sé concreto y breve en cada campo (2-3 líneas máximo). No inventes destrezas fuera de las listadas.`

  const userPrompt = dto.weekName
    ? `Nombre de la semana: ${dto.weekName}. Genera el borrador.`
    : 'Genera el borrador de esta semana.'

  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: aiConfig.model,
    max_tokens: 2000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [
      {
        name: 'submit_week_draft',
        description: 'Envía el borrador estructurado de la semana de planificación',
        input_schema: RESPONSE_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_week_draft' },
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('El asistente IA no devolvió un borrador válido')
  }
  const raw = toolUse.input as {
    competenciasEspecificas: string
    indicadoresEvaluacion: string
    newSabers: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
    reusedSaberIds: string[]
    momentos: DraftWeekResult['momentos']
  }

  await prisma.auditLog.create({
    data: {
      institutionId,
      userId: actorId,
      action: 'ai.draft_week',
      resourceType: 'learning_situation',
      resourceId: dto.situationId,
      newValue: {
        model: aiConfig.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    },
  })

  // Crea los saberes nuevos propuestos (uno por destreza que corresponda por prefijo de código).
  // Si ya existía (carrera con otro docente), se trata como reusado en vez de duplicarlo.
  const createdSabers: DraftWeekResult['newSabers'] = []
  const extraReusedIds: string[] = []
  for (const saber of raw.newSabers) {
    const owningSkill = skills.find((s) => saber.code.startsWith(s.code))
    if (!owningSkill) continue
    const existing = await prisma.curriculumSaber.findUnique({
      where: { skillId_code: { skillId: owningSkill.id, code: saber.code } },
    })
    if (existing) {
      extraReusedIds.push(existing.id)
      continue
    }
    const created = await prisma.curriculumSaber.create({
      data: { skillId: owningSkill.id, type: saber.type, code: saber.code, description: saber.description },
    })
    createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
  }

  return {
    competenciasEspecificas: raw.competenciasEspecificas,
    indicadoresEvaluacion: raw.indicadoresEvaluacion,
    newSabers: createdSabers,
    reusedSaberIds: [...raw.reusedSaberIds, ...extraReusedIds],
    momentos: raw.momentos,
  }
}
