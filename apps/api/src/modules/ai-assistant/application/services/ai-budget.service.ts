import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError } from '../../../../shared/domain/errors/app.errors'
import { estimateCostUsd } from './ai-pricing'

export interface AiTokenCaps {
  dailyTokenCap: number
  monthlyTokenCap: number
}

export interface AiBudgetUsage {
  usedToday: number
  usedThisMonth: number
  dailyTokenCap: number
  monthlyTokenCap: number
  /** Costo real estimado en USD — a diferencia de usedToday/usedThisMonth (tokens crudos), distingue input caro de cache barato/output. */
  costTodayUsd: number
  costThisMonthUsd: number
}

/**
 * Suma el consumo real de tokens (input+output) Y el costo estimado en USD
 * (que sí distingue input caro, cache barato, output 5x más caro, y
 * búsquedas web) del día y del mes en curso — base compartida por
 * assertBudgetAvailable (bloquea al generar, sigue en tokens crudos para no
 * cambiar el comportamiento de los topes ya configurados en producción) y
 * por el endpoint que expone el uso a la UI (aviso preventivo, que sí puede
 * mostrar dólares reales).
 */
async function computeUsage(
  institutionId: string,
): Promise<{ usedToday: number; usedThisMonth: number; costTodayUsd: number; costThisMonthUsd: number }> {
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const logs = await prisma.auditLog.findMany({
    where: { institutionId, action: { startsWith: 'ai.' }, createdAt: { gte: startOfMonth } },
    select: { newValue: true, createdAt: true },
  })

  let usedToday = 0
  let usedThisMonth = 0
  let costTodayUsd = 0
  let costThisMonthUsd = 0
  for (const log of logs) {
    const v = (log.newValue ?? {}) as {
      model?: string
      inputTokens?: number
      outputTokens?: number
      cacheReadTokens?: number
      cacheCreationTokens?: number
      webSearches?: number
      estimatedCostUsd?: number
    }
    const tokens = (v.inputTokens ?? 0) + (v.outputTokens ?? 0)
    // Si el log ya trae estimatedCostUsd (generadores instrumentados) se reusa;
    // si no (logs viejos o acciones sin costo, ej. ai.draft_multigrade_week_summary
    // que ya es un agregado), se recalcula solo cuando hay datos de modelo/tokens.
    const cost =
      v.estimatedCostUsd ??
      (v.model
        ? estimateCostUsd({
            model: v.model,
            inputTokens: v.inputTokens ?? 0,
            outputTokens: v.outputTokens ?? 0,
            cacheReadTokens: v.cacheReadTokens,
            cacheCreationTokens: v.cacheCreationTokens,
            webSearches: v.webSearches,
          })
        : 0)
    usedThisMonth += tokens
    costThisMonthUsd += cost
    if (log.createdAt >= startOfDay) {
      usedToday += tokens
      costTodayUsd += cost
    }
  }
  return { usedToday, usedThisMonth, costTodayUsd, costThisMonthUsd }
}

/**
 * Tope de uso del asistente IA compartido por los 5 generadores (draft_week,
 * draft_project, draft_competency_week, draft_multigrade_shared_experience,
 * draft_situation_narrative) — cuenta TODO el tráfico ai.* de la institución
 * (no por feature), porque el presupuesto es de la institución completa, no
 * de una sola pantalla.
 *
 * El tope diario existe porque el mensual solo no frena un pico concentrado
 * en un día (ej. varios docentes planificando el trimestre completo la misma
 * semana): con solo tope mensual, ese pico puede agotar el cupo del mes en
 * horas sin que nada lo detecte hasta que ya es tarde.
 */
export async function assertBudgetAvailable(institutionId: string, caps: AiTokenCaps): Promise<void> {
  if (caps.dailyTokenCap <= 0 && caps.monthlyTokenCap <= 0) return

  const { usedToday, usedThisMonth } = await computeUsage(institutionId)

  if (caps.dailyTokenCap > 0 && usedToday >= caps.dailyTokenCap) {
    throw new ForbiddenError('Se alcanzó el tope diario de uso del asistente IA para esta institución')
  }
  if (caps.monthlyTokenCap > 0 && usedThisMonth >= caps.monthlyTokenCap) {
    throw new ForbiddenError('Se alcanzó el tope mensual de uso del asistente IA para esta institución')
  }
}

/** Uso real de hoy/mes + los topes configurados — para el aviso preventivo en la UI del docente. */
export async function getBudgetUsage(institutionId: string, caps: AiTokenCaps): Promise<AiBudgetUsage> {
  const { usedToday, usedThisMonth, costTodayUsd, costThisMonthUsd } = await computeUsage(institutionId)
  return {
    usedToday,
    usedThisMonth,
    dailyTokenCap: caps.dailyTokenCap,
    monthlyTokenCap: caps.monthlyTokenCap,
    costTodayUsd,
    costThisMonthUsd,
  }
}
