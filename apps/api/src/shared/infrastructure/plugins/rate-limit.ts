import type { FastifyRequest } from 'fastify'

/**
 * Límites por ruta para @fastify/rate-limit (se pasan en `config.rateLimit`).
 * El límite global (por IP) se registra en app.ts y es generoso porque un
 * colegio entero suele salir a internet por una sola IP (NAT).
 */

/** Login / registro / reenvíos: frena fuerza bruta por IP + identificador. */
export const AUTH_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  // preHandler (no onRequest) para que el body ya esté parseado al armar la clave.
  hook: 'preHandler' as const,
  keyGenerator: (req: FastifyRequest) => {
    const body = (req.body ?? {}) as { email?: string; institutionCode?: string }
    const id = `${body.institutionCode ?? ''}:${(body.email ?? '').toLowerCase().trim()}`
    return `auth:${req.ip}:${id}`
  },
}
