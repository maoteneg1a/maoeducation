import { FastifyRequest, FastifyReply } from 'fastify'
import { tokenService, AccessTokenPayload } from '../services/token.service'
import { UnauthorizedError } from '../../domain/errors/app.errors'

// Augment Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    user: AccessTokenPayload
  }
}

export async function authMiddleware(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    throw new UnauthorizedError()
  }

  const token = authHeader.slice(7)
  const payload = tokenService.verifyAccess(token)
  // Los tokens de plataforma se firman con el mismo secreto pero no están
  // atados a una institución: nunca deben pasar por rutas de tenant.
  if ((payload as { scope?: string }).scope === 'platform' || !payload.institutionId) {
    throw new UnauthorizedError('Token inválido o expirado')
  }
  req.user = payload
}
