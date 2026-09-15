import { prisma } from '../database/prisma'
import { BadRequestError } from '../../domain/errors/app.errors'

/**
 * Fuente única de verdad de qué destrezas están REALMENTE planificadas para un
 * curso+periodo: las que aparecen en algún PlanningWeek de la Planificación
 * Microcurricular vigente (LearningSituation -> CurriculumPlan). Todo módulo
 * que necesite "una destreza de esta materia" (actividades, proyectos
 * interdisciplinarios, refuerzo) debe pasar por aquí en vez de ofrecer el
 * banco curricular completo — así lo planificado es lo único disponible para
 * usar en el resto del sistema.
 */
export async function getPlannedSkillIds(
  courseAssignmentId: string,
  academicPeriodId: string,
): Promise<string[]> {
  const weeks = await prisma.planningWeek.findMany({
    where: {
      situation: {
        academicPeriodId,
        plan: { courseAssignmentId },
      },
    },
    select: { skillIds: true },
  })
  const ids = new Set<string>()
  for (const w of weeks) for (const id of w.skillIds) ids.add(id)
  return [...ids]
}

/** Lanza BadRequestError si alguna destreza dada no está entre las planificadas. */
export async function assertSkillsArePlanned(
  courseAssignmentId: string,
  academicPeriodId: string,
  skillIds: string[],
): Promise<void> {
  if (skillIds.length === 0) return
  const planned = new Set(await getPlannedSkillIds(courseAssignmentId, academicPeriodId))
  const notPlanned = skillIds.filter((id) => !planned.has(id))
  if (notPlanned.length > 0) {
    throw new BadRequestError(
      'Solo se pueden usar destrezas que ya estén planificadas para este curso y periodo',
    )
  }
}

/** Misma idea que getPlannedSkillIds pero para el modelo por COMPETENCIAS. */
export async function getPlannedCompetencyIds(
  courseAssignmentId: string,
  academicPeriodId: string,
): Promise<string[]> {
  const weeks = await prisma.planningWeek.findMany({
    where: {
      situation: {
        academicPeriodId,
        plan: { courseAssignmentId },
      },
    },
    select: { competencyIds: true },
  })
  const ids = new Set<string>()
  for (const w of weeks) for (const id of w.competencyIds) ids.add(id)
  return [...ids]
}

/** Lanza BadRequestError si alguna competencia dada no está entre las planificadas. */
export async function assertCompetenciesArePlanned(
  courseAssignmentId: string,
  academicPeriodId: string,
  competencyIds: string[],
): Promise<void> {
  if (competencyIds.length === 0) return
  const planned = new Set(await getPlannedCompetencyIds(courseAssignmentId, academicPeriodId))
  const notPlanned = competencyIds.filter((id) => !planned.has(id))
  if (notPlanned.length > 0) {
    throw new BadRequestError(
      'Solo se pueden usar competencias que ya estén planificadas para este curso y periodo',
    )
  }
}
