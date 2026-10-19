import { FastifyRequest, FastifyReply } from 'fastify'
import { ForbiddenError } from '../../domain/errors/app.errors'

/**
 * Returns a preHandler that checks if the authenticated user has the required permission.
 *
 * Permission format: "resource:action" or "resource:action:scope"
 * - Admin role bypasses all checks.
 * - Scope "own" means the controller is responsible for filtering by ownership.
 */
export function requirePermission(resource: string, action: string, scope?: 'own' | 'all') {
  return async (req: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const { roles, permissions } = req.user

    if (roles.includes('admin')) return
    // Rectoría administra la institución como autoridad máxima. Las cuentas
    // de plataforma y suscripciones siguen siendo exclusivas de admin.
    if (roles.includes('rector') && !['platform', 'subscription', 'leads'].includes(resource)) return

    const required = scope ? `${resource}:${action}:${scope}` : null

    const granted = permissions.some((p) => {
      const parts = p.split(':')
      const [pResource, pAction, pScope] = parts

      const resourceMatch = pResource === resource || pResource === '*'
      const actionMatch   = pAction === action || pAction === 'manage'

      if (!scope) return resourceMatch && actionMatch

      const scopeMatch = pScope === scope || pScope === 'all'
      return resourceMatch && actionMatch && scopeMatch
    })

    if (!granted) {
      req.log.warn({ userId: req.user.sub, required }, 'Permission denied')
      throw new ForbiddenError()
    }
  }
}
