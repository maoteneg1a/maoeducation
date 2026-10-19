import { FastifyRequest, FastifyReply } from 'fastify'
import { tokenService, PlatformTokenPayload } from '../services/token.service'
import { ForbiddenError, UnauthorizedError } from '../../domain/errors/app.errors'

// Augment Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    platformAdmin: PlatformTokenPayload
  }
}

export async function platformAuthMiddleware(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError()
  }

  const token = authHeader.slice(7)
  req.platformAdmin = tokenService.verifyPlatformAccess(token)
}

export type PlatformRole = 'owner' | 'support' | 'billing'

/**
 * Restringe una ruta de plataforma a ciertos roles del equipo. `owner` siempre
 * pasa. Usar después de platformAuthMiddleware.
 */
export function requirePlatformRole(...roles: PlatformRole[]) {
  return async (req: FastifyRequest): Promise<void> => {
    const role = (req.platformAdmin?.role ?? 'owner') as PlatformRole
    if (role === 'owner' || roles.includes(role)) return
    throw new ForbiddenError('Tu rol de plataforma no permite esta acción')
  }
}
