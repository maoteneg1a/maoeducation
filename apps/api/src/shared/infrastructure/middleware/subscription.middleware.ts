import { FastifyInstance, FastifyRequest } from 'fastify'
import { prisma } from '../database/prisma'
import { tokenService } from '../services/token.service'
import { SubscriptionInactiveError } from '../../domain/errors/app.errors'
import {
  computeSubscriptionStatus,
  type SubscriptionStatus,
} from '../../../modules/subscription/domain/subscription-state'
import { guardsRequest } from '../../../modules/subscription/domain/write-guard-policy'

/**
 * Modo solo-lectura por suscripción vencida.
 *
 * Se aplica como hook global porque gatear ruta por ruta en ~30 módulos es
 * garantizar que alguna se olvide. Solo intercepta métodos que escriben: GET
 * sigue funcionando siempre, así que consultar y exportar nunca se bloquea.
 */

/** TTL del cache en memoria. Evita una consulta por cada escritura. */
const CACHE_TTL_MS = 60_000

const cache = new Map<string, { status: SubscriptionStatus | null; at: number }>()

/**
 * Borra la entrada del cache de una institución.
 *
 * Hay que llamarlo al aprobar un pago o mover la vigencia a mano: sin esto, el
 * cliente que acaba de pagar seguiría bloqueado hasta un minuto después.
 */
export function invalidateSubscriptionCache(institutionId: string): void {
  cache.delete(institutionId)
}

async function getStatus(institutionId: string): Promise<SubscriptionStatus | null> {
  const hit = cache.get(institutionId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.status

  const sub = await prisma.subscription.findUnique({
    where: { institutionId },
    select: { plan: true, startsAt: true, expiresAt: true, graceDays: true, suspendedAt: true },
  })
  // Sin fila = institución no gestionada por cobro = sin restricciones.
  const status = sub ? computeSubscriptionStatus(sub) : null
  cache.set(institutionId, { status, at: Date.now() })
  return status
}

/** institutionId del token, o null si no hay token válido. */
function institutionFromRequest(req: FastifyRequest): string | null {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  try {
    return tokenService.verifyAccess(header.slice(7)).institutionId
  } catch {
    // Token inválido o expirado: que responda authMiddleware con su 401.
    return null
  }
}

export function registerSubscriptionGuard(app: FastifyInstance): void {
  app.addHook('preHandler', async (req) => {
    if (!guardsRequest(req.method, req.url.split('?')[0])) return

    const institutionId = institutionFromRequest(req)
    if (!institutionId) return

    let status: SubscriptionStatus | null
    try {
      status = await getStatus(institutionId)
    } catch (err) {
      // Nunca tumbar la app por una consulta de suscripción: si el chequeo
      // falla, se deja pasar y queda registrado.
      req.log.error({ err, institutionId }, 'Fallo el chequeo de suscripción — se permite la escritura')
      return
    }

    if (!status?.readOnly) return

    req.log.info({ institutionId, state: status.state }, 'Escritura rechazada por suscripción')
    throw new SubscriptionInactiveError(
      status.state === 'suspended'
        ? 'Esta cuenta está suspendida. Contacta a soporte para reactivarla.'
        : 'La suscripción venció. Puedes consultar y exportar, pero para registrar cambios necesitas renovar.',
    )
  })
}
