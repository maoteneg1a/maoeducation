import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ForbiddenError } from '../../../../shared/domain/errors/app.errors'

export interface AiTokenCaps {
  dailyTokenCap: number
  monthlyTokenCap: number
}

export interface AiBudgetUsage {
  usedToday: number
  usedThisMonth: number
  dailyTokenCap: number
  monthlyTokenCap: number
}

/**
 * Suma el consumo real de tokens (input+output) del día y del mes en curso —
 * base compartida por assertBudgetAvailable (bloquea al generar) y por el
 * endpoint que expone el uso a la UI del docente (aviso preventivo antes de
 * chocar contra el tope).
 */
async function computeUsage(institutionId: string): Promise<{ usedToday: number; usedThisMonth: number }> {
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
  for (const log of logs) {
    const v = (log.newValue ?? {}) as { inputTokens?: number; outputTokens?: number }
    const tokens = (v.inputTokens ?? 0) + (v.outputTokens ?? 0)
    usedThisMonth += tokens
    if (log.createdAt >= startOfDay) usedToday += tokens
  }
  return { usedToday, usedThisMonth }
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
  const { usedToday, usedThisMonth } = await computeUsage(institutionId)
  return { usedToday, usedThisMonth, dailyTokenCap: caps.dailyTokenCap, monthlyTokenCap: caps.monthlyTokenCap }
}
