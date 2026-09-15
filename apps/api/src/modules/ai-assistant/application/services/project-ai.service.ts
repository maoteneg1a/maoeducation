import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import type { DraftProjectDto, DraftProjectResult, DraftedProjectContribution } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const SABER_SCHEMA = {
  type: 'object',
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
    situacionReto: { type: 'string' },
    contexto: { type: 'string' },
    propositoComun: { type: 'string' },
    productoFinal: { type: 'string' },
    contributions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          contributionId: { type: 'string' },
          contribucion: { type: 'string' },
          responsabilidad: { type: 'string' },
          skillIds: { type: 'array', items: { type: 'string' } },
          competencyIds: { type: 'array', items: { type: 'string' } },
          newSabers: { type: 'array', items: SABER_SCHEMA },
          reusedSaberIds: { type: 'array', items: { type: 'string' } },
          weeks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                weekNumber: { type: 'number' },
                weekProposito: { type: 'string' },
                faseInicio: { type: 'string' },
                faseDesarrollo: { type: 'string' },
                faseCierre: { type: 'string' },
                propositoPedagogico: { type: 'string' },
                evidencias: { type: 'string' },
              },
              required: ['weekNumber', 'weekProposito', 'faseInicio', 'faseDesarrollo', 'faseCierre', 'propositoPedagogico', 'evidencias'],
              additionalProperties: false,
            },
          },
        },
        required: ['contributionId', 'contribucion', 'responsabilidad', 'skillIds', 'competencyIds', 'newSabers', 'reusedSaberIds', 'weeks'],
        additionalProperties: false,
      },
    },
  },
  required: ['situacionReto', 'contexto', 'propositoComun', 'productoFinal', 'contributions'],
  additionalProperties: false,
}

async function assertBudgetAvailable(institutionId: string, monthlyTokenCap: number) {
  if (monthlyTokenCap <= 0) return
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const logs = await prisma.auditLog.findMany({
    where: { institutionId, action: { in: ['ai.draft_week', 'ai.draft_project'] }, createdAt: { gte: startOfMonth } },
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
 * Genera y GUARDA de una sola vez todo el proyecto interdisciplinario (reto,
 * contexto, propósito, producto final, y por cada asignatura ya unida: su
 * aporte, destrezas si no tenía ninguna, saberes, y las N semanas con las 3
 * fases). El docente solo escribió el título (y opcionalmente una idea breve)
 * y ya unió ≥2 asignaturas — de ahí en adelante todo lo llena la IA.
 */
export async function draftProject(institutionId: string, actorId: string, dto: DraftProjectDto): Promise<DraftProjectResult> {
  if (!isAnthropicConfigured()) {
    throw new ForbiddenError('El asistente IA no está configurado en el servidor')
  }
  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) {
    throw new ForbiddenError('El asistente IA no está habilitado para esta institución')
  }
  await assertBudgetAvailable(institutionId, aiConfig.monthlyTokenCap)

  const project = await prisma.interdisciplinaryProject.findFirst({
    where: { id: dto.projectId, institutionId },
    include: {
      parallel: { include: { level: true } },
      academicPeriod: true,
      contributions: {
        include: {
          courseAssignment: { include: { subject: true } },
        },
      },
    },
  })
  if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
  if (project.contributions.length < 2) {
    throw new ForbiddenError('Se necesitan al menos 2 asignaturas participantes antes de generar con IA')
  }

  const subnivel = project.parallel.level.subnivel
  if (!subnivel) throw new ForbiddenError('El paralelo no tiene subnivel configurado')

  const planningModel = await institutionRepo.getPlanningModel(institutionId)
  const isCompetencyModel = planningModel === 'competencias'

  // Para cada contribución: si ya tiene destrezas/competencias elegidas, se las pasamos a la
  // IA con sus saberes. Si no tiene ninguna, le damos un catálogo disponible de esa área para
  // que elija. El campo relevante (skillIds o competencyIds) depende del modelo activo.
  const contributionBlocks: string[] = []
  for (const c of project.contributions) {
    if (isCompetencyModel) {
      const areaId = c.courseAssignment.subject.competencyAreaId
      if (c.competencyIds.length > 0) {
        const competencies = await prisma.competency.findMany({
          where: { id: { in: c.competencyIds } },
          include: { sabers: { where: { isActive: true } } },
        })
        const competenciesText = competencies
          .map((comp) => {
            const sabers = comp.sabers.length
              ? comp.sabers.map((sb) => `      - [${sb.id}] (${sb.type}) ${sb.code}: ${sb.description}`).join('\n')
              : '      (sin saberes — propone nuevos)'
            return `    - ${comp.code}: ${comp.text}\n${sabers}`
          })
          .join('\n')
        contributionBlocks.push(
          `- contributionId "${c.id}" — ${c.courseAssignment.subject.name}\n  Competencias ya elegidas (usa estos ids en competencyIds, no elijas otras; deja skillIds vacío):\n${competenciesText}`,
        )
      } else if (areaId) {
        const availableCompetencies = await prisma.competency.findMany({
          where: { areaId, subnivel, isActive: true },
          take: 40,
        })
        const catalog = availableCompetencies.map((comp) => `      [${comp.id}] ${comp.code}: ${comp.text}`).join('\n')
        contributionBlocks.push(
          `- contributionId "${c.id}" — ${c.courseAssignment.subject.name} (SIN competencias elegidas — elige 1-2 relevantes al reto del catálogo, usa sus ids reales en competencyIds, deja skillIds vacío):\n${catalog}`,
        )
      } else {
        contributionBlocks.push(
          `- contributionId "${c.id}" — ${c.courseAssignment.subject.name} (sin área de competencias vinculada — deja competencyIds vacío, skillIds vacío, newSabers vacío, reusedSaberIds vacío, pero SÍ genera contribucion/responsabilidad/weeks)`,
        )
      }
      continue
    }

    const areaId = c.courseAssignment.subject.curriculumAreaId
    if (c.skillIds.length > 0) {
      const skills = await prisma.curriculumSkill.findMany({
        where: { id: { in: c.skillIds } },
        include: { sabers: { where: { isActive: true } } },
      })
      const skillsText = skills
        .map((s) => {
          const sabers = s.sabers.length
            ? s.sabers.map((sb) => `      - [${sb.id}] (${sb.type}) ${sb.code}: ${sb.description}`).join('\n')
            : '      (sin saberes — propone nuevos)'
          return `    - ${s.code}: ${s.description}\n${sabers}`
        })
        .join('\n')
      contributionBlocks.push(
        `- contributionId "${c.id}" — ${c.courseAssignment.subject.name}\n  Destrezas ya elegidas (usa estos ids en skillIds, no elijas otras; deja competencyIds vacío):\n${skillsText}`,
      )
    } else if (areaId) {
      const availableSkills = await prisma.curriculumSkill.findMany({
        where: { criterion: { areaId, subnivel }, isActive: true },
        take: 40,
      })
      const catalog = availableSkills.map((s) => `      [${s.id}] ${s.code}: ${s.description}`).join('\n')
      contributionBlocks.push(
        `- contributionId "${c.id}" — ${c.courseAssignment.subject.name} (SIN destrezas elegidas — elige 1-2 relevantes al reto del catálogo, usa sus ids reales en skillIds, deja competencyIds vacío):\n${catalog}`,
      )
    } else {
      contributionBlocks.push(
        `- contributionId "${c.id}" — ${c.courseAssignment.subject.name} (sin área curricular vinculada — deja skillIds vacío, competencyIds vacío, newSabers vacío, reusedSaberIds vacío, pero SÍ genera contribucion/responsabilidad/weeks)`,
      )
    }
  }

  const promptIdea = dto.prompt?.trim() || project.title

  const systemPrompt = `Eres un asistente pedagógico que ayuda a equipos docentes ecuatorianos a diseñar un PROYECTO INTERDISCIPLINARIO completo, siguiendo el Currículo Priorizado con Énfasis en Competencias del MINEDUC.

Grado/Paralelo: ${project.parallel.level.name} "${project.parallel.name}"
Periodo: ${project.academicPeriod.name}
Número de semanas del proyecto: ${project.weeksCount}
Idea/título del proyecto: ${promptIdea}

Asignaturas participantes:

${contributionBlocks.join('\n\n')}

Genera el proyecto completo:
1. situacionReto: una pregunta retadora concreta (formato "¿Qué solución sustentada podemos construir al...?") que conecte de forma genuina TODAS las asignaturas participantes.
2. contexto: 2-3 líneas describiendo cómo se desarrollará el proyecto a lo largo de las ${project.weeksCount} semanas.
3. propositoComun: qué articula el proyecto entre todas las asignaturas.
4. productoFinal: un entregable concreto que las y los estudiantes producirán al final.
5. Para CADA contributionId listado arriba:
   - contribucion: cómo esa asignatura específica aporta al reto compartido.
   - responsabilidad: qué debe documentar/evidenciar ese docente.
   - ${isCompetencyModel ? 'competencyIds' : 'skillIds'}: si ya tenía ${isCompetencyModel ? 'competencias' : 'destrezas'} elegidas, cópialas tal cual; si no tenía, elige 1-2 del catálogo dado (usa los ids reales entre corchetes, nunca inventes ids). Deja el otro campo (${isCompetencyModel ? 'skillIds' : 'competencyIds'}) vacío.
   - Saberes: para cada destreza SIN saberes ya cargados, propone 1-2 nuevos de cada tipo (declarativo/procedimental/actitudinal) en newSabers con code "<código_destreza>.d.1"/".p.1"/".a.1"; para destrezas que YA tenían saberes, pon sus ids en reusedSaberIds.
   - weeks: genera las ${project.weeksCount} semanas (weekNumber 1 a ${project.weeksCount}), cada una con weekProposito (el mismo texto para todas las asignaturas en la misma semana — deben coincidir), faseInicio/faseDesarrollo/faseCierre (actividad concreta de esa fase para esa asignatura), propositoPedagogico, y evidencias.

Sé concreto y breve en cada campo (2-3 líneas máximo por campo). No inventes ids de destrezas o saberes fuera de los dados.`

  const client = getAnthropicClient()
  const response = await client.messages.create({
    model: aiConfig.model,
    max_tokens: 8000,
    system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'Genera el proyecto interdisciplinario completo.' }],
    tools: [
      {
        name: 'submit_project_draft',
        description: 'Envía el proyecto interdisciplinario completo generado',
        input_schema: RESPONSE_SCHEMA,
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_project_draft' },
  })

  const toolUse = response.content.find((b) => b.type === 'tool_use')
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('El asistente IA no devolvió un proyecto válido')
  }
  const raw = toolUse.input as DraftProjectResult

  await prisma.auditLog.create({
    data: {
      institutionId,
      userId: actorId,
      action: 'ai.draft_project',
      resourceType: 'interdisciplinary_project',
      resourceId: dto.projectId,
      newValue: {
        model: aiConfig.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    },
  })

  // Guarda todo: datos generales del proyecto + cada contribución + sus semanas.
  await prisma.interdisciplinaryProject.update({
    where: { id: project.id },
    data: {
      situacionReto: raw.situacionReto,
      contexto: raw.contexto,
      propositoComun: raw.propositoComun,
      productoFinal: raw.productoFinal,
    },
  })

  const resultContributions: DraftedProjectContribution[] = []
  for (const c of raw.contributions) {
    const contribution = project.contributions.find((pc) => pc.id === c.contributionId)
    if (!contribution) continue

    const validSkillIds = c.skillIds.filter((id) => id) // la IA solo debe usar ids reales pasados en el prompt
    const validCompetencyIds = (c.competencyIds ?? []).filter((id) => id)

    const createdSabers: DraftedProjectContribution['newSabers'] = []
    const extraReusedIds: string[] = []

    if (isCompetencyModel) {
      const contributionCompetencies = validCompetencyIds.length
        ? await prisma.competency.findMany({ where: { id: { in: validCompetencyIds } } })
        : []
      for (const saber of c.newSabers) {
        const owning = contributionCompetencies.find((comp) => saber.code.startsWith(comp.code.replace('CE.', '')))
        if (!owning) continue
        const existing = await prisma.competencySaber.findUnique({
          where: { competencyId_code: { competencyId: owning.id, code: saber.code } },
        })
        if (existing) {
          extraReusedIds.push(existing.id)
          continue
        }
        const created = await prisma.competencySaber.create({
          data: { competencyId: owning.id, type: saber.type, code: saber.code, description: saber.description },
        })
        createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
      }
    } else {
      const contributionSkills = validSkillIds.length
        ? await prisma.curriculumSkill.findMany({ where: { id: { in: validSkillIds } } })
        : []
      for (const saber of c.newSabers) {
        const owning = contributionSkills.find((s) => saber.code.startsWith(s.code))
        if (!owning) continue
        const existing = await prisma.curriculumSaber.findUnique({
          where: { skillId_code: { skillId: owning.id, code: saber.code } },
        })
        if (existing) {
          extraReusedIds.push(existing.id)
          continue
        }
        const created = await prisma.curriculumSaber.create({
          data: { skillId: owning.id, type: saber.type, code: saber.code, description: saber.description },
        })
        createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
      }
    }

    const allSaberIds = [...c.reusedSaberIds, ...extraReusedIds, ...createdSabers.map((s) => s.id)]

    await prisma.interdisciplinaryContribution.update({
      where: { id: contribution.id },
      data: isCompetencyModel
        ? {
            contribucion: c.contribucion,
            responsabilidad: c.responsabilidad,
            competencyIds: validCompetencyIds,
            competencySaberIds: allSaberIds,
          }
        : {
            contribucion: c.contribucion,
            responsabilidad: c.responsabilidad,
            skillIds: validSkillIds,
            saberIds: allSaberIds,
          },
    })

    for (const week of c.weeks) {
      await prisma.interdisciplinaryWeekEntry.upsert({
        where: { contributionId_weekNumber: { contributionId: contribution.id, weekNumber: week.weekNumber } },
        update: {
          weekProposito: week.weekProposito,
          faseInicio: week.faseInicio,
          faseDesarrollo: week.faseDesarrollo,
          faseCierre: week.faseCierre,
          propositoPedagogico: week.propositoPedagogico,
          evidencias: week.evidencias,
        },
        create: {
          contributionId: contribution.id,
          weekNumber: week.weekNumber,
          weekProposito: week.weekProposito,
          faseInicio: week.faseInicio,
          faseDesarrollo: week.faseDesarrollo,
          faseCierre: week.faseCierre,
          propositoPedagogico: week.propositoPedagogico,
          evidencias: week.evidencias,
        },
      })
    }

    resultContributions.push({
      contributionId: contribution.id,
      contribucion: c.contribucion,
      responsabilidad: c.responsabilidad,
      skillIds: validSkillIds,
      competencyIds: validCompetencyIds,
      newSabers: createdSabers,
      reusedSaberIds: [...c.reusedSaberIds, ...extraReusedIds],
      weeks: c.weeks,
    })
  }

  return {
    situacionReto: raw.situacionReto,
    contexto: raw.contexto,
    propositoComun: raw.propositoComun,
    productoFinal: raw.productoFinal,
    contributions: resultContributions,
  }
}
