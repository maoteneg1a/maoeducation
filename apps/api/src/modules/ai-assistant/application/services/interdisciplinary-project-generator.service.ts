import Anthropic from '@anthropic-ai/sdk'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { getAnthropicClient, isAnthropicConfigured } from '../../infrastructure/services/anthropic-client'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { resolveWorkload, weeklyPhaseCounts } from '../../../../shared/domain/workload-resolution'
import type { DraftedSaber } from '../dtos/ai-assistant.dto'

const institutionRepo = new PrismaInstitutionRepository()

const MAX_ATTEMPTS = 2
const MIN_TEXT_WORDS = 6

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

const WEEK_SCHEMA = {
  type: 'object' as const,
  properties: {
    weekNumber: { type: 'number' },
    weekProposito: { type: 'string' },
    faseInicio: { type: 'string' },
    faseDesarrollo: { type: 'string' },
    faseCierre: { type: 'string' },
  },
  required: ['weekNumber', 'weekProposito', 'faseInicio', 'faseDesarrollo', 'faseCierre'],
  additionalProperties: false,
}

const CONTRIBUTION_SCHEMA = {
  type: 'object' as const,
  properties: {
    courseAssignmentId: { type: 'string' },
    contribucion: { type: 'string' },
    responsabilidad: { type: 'string' },
    skillIds: { type: 'array', items: { type: 'string' } },
    competencyIds: { type: 'array', items: { type: 'string' } },
    newSabers: { type: 'array', items: SABER_SCHEMA },
    reusedSaberIds: { type: 'array', items: { type: 'string' } },
    weeks: { type: 'array', items: WEEK_SCHEMA },
  },
  required: ['courseAssignmentId', 'contribucion', 'responsabilidad', 'skillIds', 'competencyIds', 'newSabers', 'reusedSaberIds', 'weeks'],
  additionalProperties: false,
}

const RESPONSE_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: { type: 'string' },
    situacionReto: { type: 'string' },
    contexto: { type: 'string' },
    propositoComun: { type: 'string' },
    productoFinal: { type: 'string' },
    contributions: { type: 'array', items: CONTRIBUTION_SCHEMA },
  },
  required: ['title', 'situacionReto', 'contexto', 'propositoComun', 'productoFinal', 'contributions'],
  additionalProperties: false,
}

interface RawWeek {
  weekNumber: number
  weekProposito: string
  faseInicio: string
  faseDesarrollo: string
  faseCierre: string
}

interface RawContribution {
  courseAssignmentId: string
  contribucion: string
  responsabilidad: string
  skillIds: string[]
  competencyIds: string[]
  newSabers: { type: 'declarativo' | 'procedimental' | 'actitudinal'; code: string; description: string }[]
  reusedSaberIds: string[]
  weeks: RawWeek[]
}

interface RawProjectPayload {
  title: string
  situacionReto: string
  contexto: string
  propositoComun: string
  productoFinal: string
  contributions: RawContribution[]
}

export interface DraftInterdisciplinaryProjectResult {
  projectId: string
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/**
 * Etiqueta/propósito determinista de la fase del PROYECTO (no confundir con
 * las fases Inicio/Desarrollo/Cierre de CADA semana) según su posición en la
 * duración total — calcado de `_milestone_label()` en TIGA
 * (interdisciplinary_project_orchestrator.py). Sin IA, sin persistencia: se
 * deriva en el momento a partir de weekNumber/totalWeeks (siempre disponibles
 * como columnas ya existentes), así que no requiere migración ni un campo
 * nuevo en InterdisciplinaryWeekEntry — es la opción más simple que cumple el
 * requisito de dar contexto de fase a la IA (y, si se necesita, a la UI).
 */
export function projectPhaseLabel(weekNumber: number, totalWeeks: number): { title: string; purpose: string } {
  if (weekNumber === 1) return { title: 'Inicio del proyecto', purpose: 'Comprender el reto y organizar la participación.' }
  if (weekNumber === totalWeeks) return { title: 'Presentación y cierre', purpose: 'Integrar y comunicar el producto final.' }
  if (weekNumber * 3 <= totalWeeks * 2) return { title: 'Investigación y desarrollo', purpose: 'Desarrollar los aportes disciplinares previstos.' }
  return { title: 'Producción e integración', purpose: 'Articular los aportes sin alterar su secuencia curricular.' }
}

/**
 * Evidencia común de una semana del proyecto — determinista, NO generada por
 * IA, calcada de `_milestone_evidence()` en TIGA (interdisciplinary_project_
 * orchestrator.py): agrega el "foco" de cada asignatura que participa esa
 * semana (su `contribucion`, ya redactada por la IA a nivel de contribución
 * completa, no por semana) en una sola frase de evidencia integrada. Se
 * calcula ANTES de persistir, usando el payload en memoria — evita depender
 * de una segunda pasada de lectura a BD tras crear las contribuciones.
 */
function buildCommonEvidence(
  weekNumber: number,
  totalWeeks: number,
  contributionsThisWeek: { subjectName: string; focus: string }[],
): string {
  const { title } = projectPhaseLabel(weekNumber, totalWeeks)
  const subjectNames = contributionsThisWeek.map((c) => c.subjectName)
  const focuses = [...new Set(contributionsThisWeek.map((c) => c.focus).filter(Boolean))].slice(0, 3)
  const summary = focuses.join('; ')
  return `Semana ${weekNumber}, ${title.toLowerCase()}: evidencia integrada de ${subjectNames.join(', ')}${summary ? ` sobre ${summary}` : ''}.`
}

/**
 * Valida agresivamente el payload generado — nunca confía en la IA por defecto.
 * Rechaza campos vacíos/genéricos, texto repetido entre secciones distintas del
 * mismo proyecto, semanas faltantes o fuera de rango, y courseAssignmentId que
 * no pertenezcan a las asignaciones esperadas.
 */
function validatePayload(
  raw: unknown,
  expectedAssignmentIds: Set<string>,
  weeksCount: number,
): { status: 'VERIFIED'; payload: RawProjectPayload } | { status: 'REJECTED'; errors: string[] } {
  const errors: string[] = []
  if (!raw || typeof raw !== 'object') return { status: 'REJECTED', errors: ['EMPTY_PAYLOAD'] }
  const p = raw as Partial<RawProjectPayload>

  const topFields: [string, string | undefined][] = [
    ['title', p.title],
    ['situacionReto', p.situacionReto],
    ['contexto', p.contexto],
    ['propositoComun', p.propositoComun],
    ['productoFinal', p.productoFinal],
  ]
  for (const [name, value] of topFields) {
    if (!value || typeof value !== 'string' || wordCount(value) < (name === 'title' ? 2 : MIN_TEXT_WORDS)) {
      errors.push(`${name.toUpperCase()}_TOO_SHORT_OR_MISSING`)
    }
  }

  // Ninguno de los 4 campos generales debe ser idéntico a otro (repetición = genérico).
  const generalTexts = [p.situacionReto, p.contexto, p.propositoComun, p.productoFinal].filter(
    (t): t is string => typeof t === 'string' && t.length > 0,
  )
  const normalizedSet = new Set(generalTexts.map((t) => t.trim().toLowerCase()))
  if (normalizedSet.size < generalTexts.length) errors.push('GENERAL_FIELDS_REPEATED')

  if (!Array.isArray(p.contributions) || p.contributions.length === 0) {
    errors.push('CONTRIBUTIONS_MISSING')
    return { status: 'REJECTED', errors: [...new Set(errors)] }
  }

  const seenAssignmentIds = new Set<string>()
  for (const c of p.contributions) {
    if (!c || typeof c !== 'object') {
      errors.push('CONTRIBUTION_MALFORMED')
      continue
    }
    if (!c.courseAssignmentId || !expectedAssignmentIds.has(c.courseAssignmentId)) {
      errors.push('CONTRIBUTION_ASSIGNMENT_ID_INVALID')
      continue
    }
    if (seenAssignmentIds.has(c.courseAssignmentId)) errors.push('CONTRIBUTION_ASSIGNMENT_ID_DUPLICATED')
    seenAssignmentIds.add(c.courseAssignmentId)

    if (!c.contribucion || typeof c.contribucion !== 'string' || wordCount(c.contribucion) < MIN_TEXT_WORDS) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_CONTRIBUCION_TOO_SHORT`)
    }
    if (!c.responsabilidad || typeof c.responsabilidad !== 'string' || wordCount(c.responsabilidad) < MIN_TEXT_WORDS) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_RESPONSABILIDAD_TOO_SHORT`)
    }
    if (c.contribucion && c.responsabilidad && c.contribucion.trim().toLowerCase() === c.responsabilidad.trim().toLowerCase()) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_CONTRIBUCION_EQUALS_RESPONSABILIDAD`)
    }
    if (!Array.isArray(c.skillIds) || !Array.isArray(c.competencyIds)) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_SKILL_OR_COMPETENCY_IDS_MALFORMED`)
    }
    if (!Array.isArray(c.weeks) || c.weeks.length !== weeksCount) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEKS_COUNT_MISMATCH`)
      continue
    }
    const seenWeekNumbers = new Set<number>()
    for (const w of c.weeks) {
      if (!w || typeof w !== 'object') {
        errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEK_MALFORMED`)
        continue
      }
      if (typeof w.weekNumber !== 'number' || w.weekNumber < 1 || w.weekNumber > weeksCount) {
        errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEK_NUMBER_OUT_OF_RANGE`)
        continue
      }
      seenWeekNumbers.add(w.weekNumber)
      const phaseFields: [string, unknown][] = [
        ['weekProposito', w.weekProposito],
        ['faseInicio', w.faseInicio],
        ['faseDesarrollo', w.faseDesarrollo],
        ['faseCierre', w.faseCierre],
      ]
      for (const [field, value] of phaseFields) {
        if (typeof value !== 'string' || wordCount(value) < 4) {
          errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEK_${w.weekNumber}_${field.toUpperCase()}_TOO_SHORT`)
        }
      }
      if (
        typeof w.faseInicio === 'string' &&
        typeof w.faseDesarrollo === 'string' &&
        typeof w.faseCierre === 'string' &&
        (w.faseInicio.trim().toLowerCase() === w.faseDesarrollo.trim().toLowerCase() ||
          w.faseDesarrollo.trim().toLowerCase() === w.faseCierre.trim().toLowerCase() ||
          w.faseInicio.trim().toLowerCase() === w.faseCierre.trim().toLowerCase())
      ) {
        errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEK_${w.weekNumber}_PHASES_REPEATED`)
      }
    }
    if (seenWeekNumbers.size !== weeksCount) {
      errors.push(`CONTRIBUTION_${c.courseAssignmentId}_WEEK_NUMBERS_INCOMPLETE_OR_DUPLICATED`)
    }
  }

  if (errors.length > 0) return { status: 'REJECTED', errors: [...new Set(errors)] }
  return { status: 'VERIFIED', payload: raw as RawProjectPayload }
}

/**
 * Genera y GUARDA un proyecto interdisciplinario COMPLETO a partir de una
 * Situación de Aprendizaje que ya marcó ≥2 asignaturas con conexión
 * interdisciplinar. El docente no arma nada a mano: la IA propone título,
 * reto, contexto, propósito, producto final, y por cada asignatura su aporte
 * disciplinar + N semanas coherentes entre sí (mismo weekProposito) pero con
 * actividades propias por asignatura — durando exactamente las semanas de la
 * situación de origen. Reintenta hasta MAX_ATTEMPTS con memoria de conversación
 * persistente (nunca reconstruye messages desde cero) si la validación falla.
 */
export async function draftInterdisciplinaryProject(
  institutionId: string,
  actorId: string,
  situationId: string,
): Promise<DraftInterdisciplinaryProjectResult> {
  if (!isAnthropicConfigured()) {
    throw new ForbiddenError('El asistente IA no está configurado en el servidor')
  }
  const aiConfig = await institutionRepo.getAiConfig(institutionId)
  if (!aiConfig.enabled) {
    throw new ForbiddenError('El asistente IA no está habilitado para esta institución')
  }

  const situation = await prisma.learningSituation.findFirst({
    where: { id: situationId, institutionId },
    include: {
      academicPeriod: true,
      plan: { include: { courseAssignment: { include: { parallel: { include: { level: true } }, academicYear: true } } } },
      weeks: { orderBy: { weekNumber: 'asc' } },
    },
  })
  if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')

  if (situation.interdisciplinarySubjectIds.length < 2) {
    throw new BadRequestError('La situación debe tener al menos 2 materias marcadas con conexión interdisciplinar')
  }

  const weeksCount = situation.weeks.length
  if (weeksCount < 1) {
    throw new BadRequestError('La situación de aprendizaje no tiene semanas registradas todavía')
  }

  const originAssignment = situation.plan.courseAssignment
  const parallelId = originAssignment.parallelId
  const academicYearId = originAssignment.academicYearId
  const academicPeriodId = situation.academicPeriodId

  // El selector de "Conexión interdisciplinar" (WeekCard/PlanningSituationPage)
  // persiste materias del propio docente en `interdisciplinarySubjectIds` —
  // ya no se usa `interdisciplinaryAreaIds` (deprecado, nunca tuvo UI que lo
  // escribiera) como insumo para este generador.
  const subjects = await prisma.subject.findMany({
    where: { id: { in: situation.interdisciplinarySubjectIds }, institutionId, isActive: true },
  })
  if (subjects.length < 2) {
    throw new BadRequestError('No se encontraron al menos 2 materias interdisciplinares válidas')
  }

  const assignments = await prisma.courseAssignment.findMany({
    where: { institutionId, parallelId, academicYearId, subjectId: { in: subjects.map((s) => s.id) } },
    include: { subject: true, teacher: { include: { profile: true } } },
  })
  if (assignments.length < 2) {
    throw new BadRequestError(
      'Se necesitan al menos 2 asignaciones (docente x materia) del paralelo/año de esta situación para las áreas interdisciplinares marcadas',
    )
  }

  const planningModel = await institutionRepo.getPlanningModel(institutionId)
  const isCompetencyModel = planningModel === 'competencias'
  const subnivel = originAssignment.parallel.level.subnivel

  // Carga horaria oficial por asignatura — OPCIONAL (pedido explícito del
  // usuario: "que no sea obligado por ahora"), a diferencia de TIGA que
  // rechaza el proyecto entero si falta (WORKLOAD_CONFIGURATION_REQUIRED).
  // Aquí solo informa a la IA la densidad esperada de actividades de esa
  // materia en el proyecto; si no está configurada, se usa una densidad
  // estándar y el proyecto se genera igual (mismo patrón que
  // competency-pedagogical-generator.service.ts para la planificación
  // semanal individual — nunca bloquea).
  const workloadEntries = await prisma.curricularWorkload.findMany()
  const levelCode = originAssignment.parallel.level.code
  const educationOffer = originAssignment.parallel.educationOffer

  const assignmentBlocks: string[] = []
  for (const a of assignments) {
    const workload = resolveWorkload(workloadEntries, levelCode, a.subject.workloadCode, educationOffer, a.weeklyPeriodsOverride)
    const phaseCounts = weeklyPhaseCounts(workload.weeklyPeriods)
    const densityLine = workload.weeklyPeriods
      ? `Carga horaria: ${workload.weeklyPeriods} períodos/semana — densidad de actividades por fase en las semanas de esta contribución: Inicio ${phaseCounts.anticipation}, Desarrollo ${phaseCounts.construction}, Cierre ${phaseCounts.consolidation} (guíate por esta densidad al describir faseInicio/faseDesarrollo/faseCierre, sin generar una lista numerada — sigue siendo un texto breve por fase).`
      : 'Carga horaria no configurada para este grado+materia — usa densidad estándar (equivalente a Inicio 2, Desarrollo 2, Cierre 2) sin bloquear la generación.'

    if (isCompetencyModel) {
      const areaId = a.subject.competencyAreaId
      if (areaId && subnivel) {
        const available = await prisma.competency.findMany({ where: { areaId, subnivel, isActive: true }, take: 40 })
        const catalog = available.map((comp) => `      [${comp.id}] ${comp.code}: ${comp.text}`).join('\n')
        assignmentBlocks.push(
          `- courseAssignmentId "${a.id}" — ${a.subject.name} (elige 1-2 competencias relevantes al reto, usa sus ids reales en competencyIds; deja skillIds vacío). ${densityLine}\n${catalog || '      (sin competencias disponibles)'}`,
        )
      } else {
        assignmentBlocks.push(
          `- courseAssignmentId "${a.id}" — ${a.subject.name} (sin área de competencias vinculada — deja skillIds y competencyIds vacíos, pero SÍ genera contribucion/responsabilidad/weeks). ${densityLine}`,
        )
      }
      continue
    }
    const areaId = a.subject.curriculumAreaId
    if (areaId && subnivel) {
      const available = await prisma.curriculumSkill.findMany({ where: { criterion: { areaId, subnivel }, isActive: true }, take: 40 })
      const catalog = available.map((s) => `      [${s.id}] ${s.code}: ${s.description}`).join('\n')
      assignmentBlocks.push(
        `- courseAssignmentId "${a.id}" — ${a.subject.name} (elige 1-2 destrezas relevantes al reto, usa sus ids reales en skillIds; deja competencyIds vacío). ${densityLine}\n${catalog || '      (sin destrezas disponibles)'}`,
      )
    } else {
      assignmentBlocks.push(
        `- courseAssignmentId "${a.id}" — ${a.subject.name} (sin área curricular vinculada — deja skillIds y competencyIds vacíos, pero SÍ genera contribucion/responsabilidad/weeks). ${densityLine}`,
      )
    }
  }

  // Fase del PROYECTO por semana (distinta de las fases Inicio/Desarrollo/Cierre
  // de cada semana individual) — determinista, calcada de TIGA, comunicada a la
  // IA como contexto obligatorio para que weekProposito refleje la progresión
  // real del proyecto (semana 1 de arranque, últimas de cierre, etc.).
  const projectPhaseLines = Array.from({ length: weeksCount }, (_, i) => {
    const week = i + 1
    const { title, purpose } = projectPhaseLabel(week, weeksCount)
    return `  Semana ${week} de ${weeksCount} — fase del proyecto: "${title}". ${purpose}`
  }).join('\n')

  const expectedAssignmentIds = new Set(assignments.map((a) => a.id))

  const systemPrompt = `Eres un asistente pedagógico que ayuda a equipos docentes ecuatorianos a diseñar, de forma CASI AUTOMÁTICA, un PROYECTO INTERDISCIPLINARIO completo a partir de una situación de aprendizaje ya planificada, siguiendo el Currículo Priorizado con Énfasis en Competencias del MINEDUC.

Situación de aprendizaje de origen: "${situation.title}"
Grado/Paralelo: ${originAssignment.parallel.level.name} "${originAssignment.parallel.name}"
Periodo: ${situation.academicPeriod.name}
Número de semanas (EXACTO — debe coincidir con las semanas de la situación de origen): ${weeksCount}
Materias con conexión interdisciplinar: ${subjects.map((s) => s.name).join(', ')}

Asignaturas/docentes que contribuyen (una entrada de "contributions" por cada courseAssignmentId, ni más ni menos):

${assignmentBlocks.join('\n\n')}

Fase del proyecto por semana (contexto OBLIGATORIO — cada weekProposito debe reflejar coherentemente este momento del proyecto, no un texto genérico repetido):
${projectPhaseLines}

Genera el proyecto completo con esta tool:
1. title: título corto y concreto del proyecto (distinto del título de la situación de origen, pero inspirado en ella).
2. situacionReto: una pregunta retadora concreta (formato "¿Qué solución sustentada podemos construir al...?") que conecte de forma genuina TODAS las asignaturas listadas.
3. contexto: 2-3 líneas describiendo cómo se desarrollará el proyecto a lo largo de las ${weeksCount} semanas.
4. propositoComun: qué articula el proyecto entre todas las asignaturas — debe ser un texto DISTINTO de situacionReto y de contexto (no repitas frases).
5. productoFinal: un entregable concreto que las y los estudiantes producirán al final — distinto de los 3 campos anteriores.
6. Para CADA courseAssignmentId listado arriba (exactamente ${assignments.length} contribuciones):
   - contribucion: cómo esa asignatura específica aporta al reto compartido (mínimo 6 palabras, distinto de responsabilidad).
   - responsabilidad: qué debe documentar/evidenciar ese docente (mínimo 6 palabras, distinto de contribucion).
   - ${isCompetencyModel ? 'competencyIds' : 'skillIds'}: elige 1-2 ids reales del catálogo dado para esa asignatura (nunca inventes ids). Deja el otro campo (${isCompetencyModel ? 'skillIds' : 'competencyIds'}) vacío en TODAS las contribuciones.
   - Saberes: si la destreza/competencia elegida no tenía saberes en el catálogo, propone 1-2 nuevos de cada tipo (declarativo/procedimental/actitudinal) en newSabers con code "<código_base>.d.1"/".p.1"/".a.1"; si ya tenía, deja newSabers vacío y no listes nada en reusedSaberIds (el sistema los resuelve).
   - weeks: EXACTAMENTE ${weeksCount} entradas, weekNumber de 1 a ${weeksCount} sin repetir ni saltar ninguno. Cada semana necesita:
     - weekProposito: el MISMO texto para TODAS las asignaturas en esa semana (deben coincidir literalmente entre contribuciones) — describe el hito común de esa semana en el proyecto, reflejando la fase del proyecto indicada arriba para ese número de semana (no un texto genérico igual en todas las semanas).
     - faseInicio/faseDesarrollo/faseCierre: actividad CONCRETA y ESPECÍFICA de esa fase para ESTA asignatura en particular (nunca genérica, nunca igual entre fases, nunca igual a la de otra asignatura en la misma semana).

Reglas estrictas: no repitas texto entre situacionReto/contexto/propositoComun/productoFinal; no repitas contribucion y responsabilidad de una misma asignatura; no repitas las 3 fases de una misma semana entre sí; nunca inventes ids de destrezas/competencias fuera de los catálogos dados; genera EXACTAMENTE una contribución por cada courseAssignmentId listado.`

  const client = getAnthropicClient()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Genera el proyecto interdisciplinario completo a partir de esta situación de aprendizaje.' },
  ]
  let lastErrors: string[] = []
  let verifiedPayload: RawProjectPayload | null = null

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response
    try {
      response = await client.messages.create({
        model: aiConfig.model,
        max_tokens: 8000,
        system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
        messages,
        tools: [
          {
            name: 'submit_interdisciplinary_project_draft',
            description: 'Envía el proyecto interdisciplinario completo generado',
            input_schema: RESPONSE_SCHEMA,
          },
        ],
        tool_choice: { type: 'auto' },
      })
    } catch (error) {
      const status = error instanceof Anthropic.APIError ? error.status : undefined
      const nonRetryable = status === 401 || status === 403 || status === 429
      lastErrors = [`API_ERROR_${status ?? 'UNKNOWN'}`]
      if (nonRetryable) break
      continue
    }

    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: actorId,
        action: 'ai.draft_interdisciplinary_project',
        resourceType: 'learning_situation',
        resourceId: situationId,
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
      messages.push({ role: 'assistant', content: response.content })
      messages.push({
        role: 'user',
        content: 'No enviaste el proyecto con la herramienta submit_interdisciplinary_project_draft. Debes usar esa herramienta para responder, con TODOS los campos requeridos.',
      })
      continue
    }

    const validation = validatePayload(toolUse.input, expectedAssignmentIds, weeksCount)
    if (validation.status === 'VERIFIED') {
      verifiedPayload = validation.payload
      break
    }

    lastErrors = validation.errors
    // Empuja la respuesta del modelo + el resultado de error, para que el reintento
    // tenga memoria de qué generó y por qué falló (nunca reconstruir messages desde cero).
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          is_error: true,
          content: `Tu borrador fue rechazado por estos errores de validación: ${lastErrors.join(', ')}. Corrígelos y vuelve a enviar el proyecto COMPLETO con la misma herramienta.`,
        },
      ],
    })
  }

  if (!verifiedPayload) {
    throw new BadRequestError(
      `El asistente IA no pudo generar un proyecto interdisciplinario válido tras ${MAX_ATTEMPTS} intentos (${lastErrors.join(', ')}). Intenta de nuevo o crea el proyecto manualmente.`,
    )
  }

  const raw = verifiedPayload
  let title = raw.title.trim().slice(0, 200)
  const existingWithSameTitle = await prisma.interdisciplinaryProject.findFirst({
    where: { parallelId, academicPeriodId, title },
  })
  if (existingWithSameTitle) {
    title = `${title} (${situation.title.slice(0, 40)})`.slice(0, 200)
  }

  // Mapa semana -> asignaturas participantes esa semana + su "foco" (contribucion,
  // ya redactada por la IA a nivel de la contribución completa) — se construye en
  // memoria a partir del payload verificado, ANTES de persistir, para no depender
  // de una segunda pasada de lectura a BD tras crear las contribuciones.
  const contributionsByWeek = new Map<number, { subjectName: string; focus: string }[]>()
  for (const c of raw.contributions) {
    const assignment = assignments.find((a) => a.id === c.courseAssignmentId)
    if (!assignment) continue
    for (const week of c.weeks) {
      const list = contributionsByWeek.get(week.weekNumber) ?? []
      list.push({ subjectName: assignment.subject.name, focus: c.contribucion })
      contributionsByWeek.set(week.weekNumber, list)
    }
  }

  const projectId = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const project = await tx.interdisciplinaryProject.create({
      data: {
        institutionId,
        parallelId,
        academicPeriodId,
        title,
        situacionReto: raw.situacionReto,
        contexto: raw.contexto,
        propositoComun: raw.propositoComun,
        productoFinal: raw.productoFinal,
        weeksCount,
        createdBy: actorId,
      },
    })

    for (const c of raw.contributions) {
      const assignment = assignments.find((a) => a.id === c.courseAssignmentId)
      if (!assignment) continue

      const validSkillIds = (c.skillIds ?? []).filter((id) => id)
      const validCompetencyIds = (c.competencyIds ?? []).filter((id) => id)
      const createdSabers: DraftedSaber[] = []
      const extraReusedIds: string[] = []

      if (isCompetencyModel) {
        const chosenCompetencies = validCompetencyIds.length
          ? await tx.competency.findMany({ where: { id: { in: validCompetencyIds } } })
          : []
        for (const saber of c.newSabers ?? []) {
          const owning = chosenCompetencies.find((comp) => saber.code.startsWith(comp.code.replace('CE.', '')))
          if (!owning) continue
          const existing = await tx.competencySaber.findUnique({
            where: { competencyId_code: { competencyId: owning.id, code: saber.code } },
          })
          if (existing) {
            extraReusedIds.push(existing.id)
            continue
          }
          const created = await tx.competencySaber.create({
            data: { competencyId: owning.id, type: saber.type, code: saber.code, description: saber.description },
          })
          createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
        }
      } else {
        const chosenSkills = validSkillIds.length ? await tx.curriculumSkill.findMany({ where: { id: { in: validSkillIds } } }) : []
        for (const saber of c.newSabers ?? []) {
          const owning = chosenSkills.find((s) => saber.code.startsWith(s.code))
          if (!owning) continue
          const existing = await tx.curriculumSaber.findUnique({ where: { skillId_code: { skillId: owning.id, code: saber.code } } })
          if (existing) {
            extraReusedIds.push(existing.id)
            continue
          }
          const created = await tx.curriculumSaber.create({
            data: { skillId: owning.id, type: saber.type, code: saber.code, description: saber.description },
          })
          createdSabers.push({ id: created.id, type: saber.type, code: saber.code, description: saber.description })
        }
      }

      const allSaberIds = [...(c.reusedSaberIds ?? []), ...extraReusedIds, ...createdSabers.map((s) => s.id)]

      const contribution = await tx.interdisciplinaryContribution.create({
        data: isCompetencyModel
          ? {
              projectId: project.id,
              courseAssignmentId: assignment.id,
              contribucion: c.contribucion,
              responsabilidad: c.responsabilidad,
              skillIds: [],
              saberIds: [],
              competencyIds: validCompetencyIds,
              competencySaberIds: allSaberIds,
            }
          : {
              projectId: project.id,
              courseAssignmentId: assignment.id,
              contribucion: c.contribucion,
              responsabilidad: c.responsabilidad,
              skillIds: validSkillIds,
              saberIds: allSaberIds,
              competencyIds: [],
              competencySaberIds: [],
            },
      })

      for (const week of c.weeks) {
        await tx.interdisciplinaryWeekEntry.create({
          data: {
            contributionId: contribution.id,
            weekNumber: week.weekNumber,
            weekProposito: week.weekProposito,
            faseInicio: week.faseInicio,
            faseDesarrollo: week.faseDesarrollo,
            faseCierre: week.faseCierre,
            // Deterministas, no generados por IA — calcados de TIGA (ver
            // projectPhaseLabel/buildCommonEvidence): antes quedaban siempre
            // vacíos porque el esquema de la IA nunca los pedía.
            propositoPedagogico: projectPhaseLabel(week.weekNumber, weeksCount).purpose,
            evidencias: buildCommonEvidence(week.weekNumber, weeksCount, contributionsByWeek.get(week.weekNumber) ?? []),
          },
        })
      }
    }

    return project.id
  })

  return { projectId }
}
