import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors/app.errors'
import { draftWeek } from './planning-ai.service'
import { draftCompetencyWeek } from './competency-pedagogical-generator.service'
import type { DraftWeekResult, DraftCompetencyWeekResult } from '../dtos/ai-assistant.dto'

export interface DraftSituationBlockDto {
  situationId: string
  weeksCount: number
  skillIds?: string[]
  competencyIds?: string[]
}

export interface DraftedBlockWeek {
  weekId: string
  weekNumber: number
  result: DraftWeekResult | DraftCompetencyWeekResult
}

export interface DraftSituationBlockResult {
  weeks: DraftedBlockWeek[]
}

/**
 * Estilo TIGA: el docente elige la(s) destreza(s)/competencia(s) UNA sola vez
 * junto con cuántas semanas dura el bloque, y se generan las N PlanningWeek de
 * un solo golpe — cada una con su propia secuencia completa de 3 momentos
 * (reusa exactamente el mismo motor de IA en dos capas que ya existe para una
 * semana individual, solo que disparado N veces). El docente ya no tiene que
 * entrar semana por semana a pedir el borrador; puede seguir agregando semanas
 * sueltas después con el flujo manual existente si necesita más.
 */
export async function draftSituationBlock(
  institutionId: string,
  actorId: string,
  dto: DraftSituationBlockDto,
): Promise<DraftSituationBlockResult> {
  if (dto.weeksCount < 1 || dto.weeksCount > 40) {
    throw new ConflictError('El número de semanas debe estar entre 1 y 40')
  }

  const situation = await prisma.learningSituation.findFirst({ where: { id: dto.situationId, institutionId } })
  if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')

  const existingWeeks = await prisma.planningWeek.findMany({
    where: { situationId: dto.situationId },
    select: { weekNumber: true },
  })
  const existingNumbers = new Set(existingWeeks.map((w) => w.weekNumber))
  const startNumber = existingNumbers.size ? Math.max(...existingNumbers) + 1 : 1

  const isCompetencyModel = !!dto.competencyIds?.length
  const weeks: DraftedBlockWeek[] = []

  for (let i = 0; i < dto.weeksCount; i++) {
    const weekNumber = startNumber + i
    if (existingNumbers.has(weekNumber)) continue

    const created = await prisma.planningWeek.create({
      data: {
        institutionId,
        situationId: dto.situationId,
        weekNumber,
        skillIds: dto.skillIds ?? [],
        competencyIds: dto.competencyIds ?? [],
      },
    })

    const result = isCompetencyModel
      ? await draftCompetencyWeek(institutionId, actorId, {
          situationId: dto.situationId,
          competencyIds: dto.competencyIds!,
          weekName: undefined,
        })
      : await draftWeek(institutionId, actorId, {
          situationId: dto.situationId,
          skillIds: dto.skillIds ?? [],
          weekName: undefined,
        })

    await prisma.planningWeek.update({
      where: { id: created.id },
      data: isCompetencyModel
        ? {
            indicadoresEvaluacion: (result as DraftCompetencyWeekResult).indicadoresEvaluacion,
            momentos: result.momentos as unknown as Prisma.InputJsonValue,
            competencySaberIds: [
              ...(result as DraftCompetencyWeekResult).reusedSaberIds,
              ...(result as DraftCompetencyWeekResult).newSabers.map((s) => s.id),
            ],
          }
        : {
            competenciasEspecificas: (result as DraftWeekResult).competenciasEspecificas,
            indicadoresEvaluacion: (result as DraftWeekResult).indicadoresEvaluacion,
            momentos: result.momentos as unknown as Prisma.InputJsonValue,
            saberIds: [
              ...(result as DraftWeekResult).reusedSaberIds,
              ...(result as DraftWeekResult).newSabers.map((s) => s.id),
            ],
          },
    })

    weeks.push({ weekId: created.id, weekNumber, result })
  }

  return { weeks }
}
