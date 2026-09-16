/**
 * Estado efectivo de una suscripción, derivado de las fechas.
 *
 * Nada de esto se guarda en la base: un `status` persistido se queda viejo en
 * cuanto pasa la medianoche y nadie corre un cron para moverlo. Se calcula en
 * cada lectura a partir de expiresAt + graceDays, que sí son hechos.
 */

export type SubscriptionState =
  /** Período de prueba vigente. */
  | 'trial'
  /** Pagada y vigente. */
  | 'active'
  /** Venció pero está dentro de los días de tolerancia: sigue escribiendo. */
  | 'grace'
  /** Pasó la tolerancia: puede consultar y exportar, no crear ni editar. */
  | 'readonly'
  /** Cortada a mano por el superadmin. */
  | 'suspended'

/** Días antes del vencimiento en que empieza el aviso. */
export const EXPIRING_SOON_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** Lo mínimo que hace falta para calcular el estado (subconjunto de la fila). */
export interface SubscriptionPeriod {
  plan: string
  startsAt: Date
  expiresAt: Date
  graceDays: number
  suspendedAt: Date | null
}

export interface SubscriptionStatus {
  state: SubscriptionState
  plan: 'trial' | 'paid'
  startsAt: string
  expiresAt: string
  /** Fecha en que se corta el acceso de escritura. */
  graceEndsAt: string
  /** Días hasta el vencimiento. 0 o negativo = ya venció. */
  daysRemaining: number
  /** Conviene avisar: faltan EXPIRING_SOON_DAYS o menos y todavía escribe. */
  expiringSoon: boolean
  /** La API debe rechazar escrituras. */
  readOnly: boolean
}

export function computeSubscriptionStatus(
  sub: SubscriptionPeriod,
  now: Date = new Date(),
): SubscriptionStatus {
  const graceEndsAt = new Date(sub.expiresAt.getTime() + sub.graceDays * DAY_MS)
  const daysRemaining = Math.ceil((sub.expiresAt.getTime() - now.getTime()) / DAY_MS)
  const plan = sub.plan === 'paid' ? 'paid' : 'trial'

  const state: SubscriptionState = sub.suspendedAt
    ? 'suspended'
    : now < sub.expiresAt
      ? plan === 'trial'
        ? 'trial'
        : 'active'
      : now < graceEndsAt
        ? 'grace'
        : 'readonly'

  const readOnly = state === 'readonly' || state === 'suspended'

  return {
    state,
    plan,
    startsAt: sub.startsAt.toISOString(),
    expiresAt: sub.expiresAt.toISOString(),
    graceEndsAt: graceEndsAt.toISOString(),
    daysRemaining,
    expiringSoon: !readOnly && daysRemaining <= EXPIRING_SOON_DAYS,
    readOnly,
  }
}

/**
 * Estado de una institución sin fila de suscripción: sin restricciones.
 *
 * Es lo que mantiene andando a las instituciones que ya existían antes de este
 * módulo. Si alguna vez esto pasa a bloquear por defecto, el deploy dejaría a
 * todos los clientes actuales en solo-lectura de golpe.
 */
export const UNMANAGED_STATUS = null
