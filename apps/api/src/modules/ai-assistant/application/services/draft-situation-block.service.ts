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

/** Sin contenido generado todavía — ya sea un placeholder nuevo o el residuo de un intento anterior que falló a medias. */
function isEmptyWeek(week: { competenciasEspecificas: string | null; indicadoresEvaluacion: string | null }): boolean {
  return !week.competenciasEspecificas && !week.indicadoresEvaluacion
}

// Cuántas semanas se generan a la vez — TIGA nunca dispara N llamadas de golpe;
// limitar la concurrencia evita saturar la API y reduce el riesgo de timeout
// del lado del cliente sin serializar todo el bloque semana por semana.
const GENERATION_CONCURRENCY = 3

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Estilo TIGA: el docente elige la(s) destreza(s)/competencia(s) UNA sola vez
 * junto con cuántas semanas dura el bloque, y se generan las N PlanningWeek de
 * un solo golpe — cada una con su propia secuencia completa de 3 momentos
 * (reusa exactamente el mismo motor de IA en dos capas que ya existe para una
 * semana individual, solo que disparado N veces, con concurrencia acotada). El
 * docente ya no tiene que entrar semana por semana a pedir el borrador; puede
 * seguir agregando semanas sueltas después con el flujo manual existente si
 * necesita más.
 *
 * Idempotente ante reintentos: si un intento anterior falló a medias y dejó
 * semanas vacías, este reutiliza esos huecos por número en vez de crear
 * semanas nuevas encima — reintentar la misma petición nunca duplica.
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
    select: { id: true, weekNumber: true, competenciasEspecificas: true, indicadoresEvaluacion: true },
    orderBy: { weekNumber: 'asc' },
  })
  const existingNumbers = new Set(existingWeeks.map((w) => w.weekNumber))
  const reusableEmpty = existingWeeks.filter(isEmptyWeek)
  const highestNumber = existingNumbers.size ? Math.max(...existingNumbers) : 0

  const isCompetencyModel = !!dto.competencyIds?.length

  // Reserva primero los N slots (reutilizando huecos vacíos, creando el resto) —
  // rápido y secuencial, sin llamadas a IA todavía — y solo después dispara la
  // generación real con concurrencia acotada.
  const slots: { weekId: string; weekNumber: number }[] = []
  let nextNewNumber = highestNumber + 1
  for (let i = 0; i < dto.weeksCount; i++) {
    const reused = reusableEmpty[i]
    if (reused) {
      slots.push({ weekId: reused.id, weekNumber: reused.weekNumber })
      continue
    }
    const created = await prisma.planningWeek.create({
      data: {
        institutionId,
        situationId: dto.situationId,
        weekNumber: nextNewNumber,
        skillIds: dto.skillIds ?? [],
        competencyIds: dto.competencyIds ?? [],
      },
    })
    slots.push({ weekId: created.id, weekNumber: created.weekNumber })
    nextNewNumber++
  }

  // Una semana que falla (excepción no controlada del motor de IA, error de red, etc.)
  // NUNCA debe tumbar el bloque completo — queda vacía (lista para reintentar, ver
  // `reusableEmpty` arriba) mientras las demás semanas del mismo lote siguen su curso.
  const weeks = (
    await mapWithConcurrency(slots, GENERATION_CONCURRENCY, async (slot, index): Promise<DraftedBlockWeek | null> => {
      try {
        const result = isCompetencyModel
          ? await draftCompetencyWeek(institutionId, actorId, {
              situationId: dto.situationId,
              competencyIds: dto.competencyIds!,
              weekName: undefined,
              rotationSeed: index,
            })
          : await draftWeek(institutionId, actorId, {
              situationId: dto.situationId,
              skillIds: dto.skillIds ?? [],
              weekName: undefined,
              rotationSeed: index,
            })

        await prisma.planningWeek.update({
          where: { id: slot.weekId },
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

        return { weekId: slot.weekId, weekNumber: slot.weekNumber, result }
      } catch (error) {
        console.error(`[draftSituationBlock] semana ${slot.weekNumber} falló, queda vacía para reintentar:`, error)
        return null
      }
    })
  ).filter((w): w is DraftedBlockWeek => w !== null)

  return { weeks }
}
