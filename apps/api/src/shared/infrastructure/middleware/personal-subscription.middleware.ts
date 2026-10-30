import type { FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../database/prisma'
import { tokenService } from '../services/token.service'
import { computeSubscriptionStatus } from '../../../modules/subscription/domain/subscription-state'
import { SubscriptionInactiveError } from '../../domain/errors/app.errors'

const EXEMPT_PREFIXES = [
  '/api/v1/auth',
  '/api/v1/platform',
  '/api/v1/subscription',
  '/api/v1/push',
]

const EXEMPT_PERSONAL_ROUTES = new Set([
  '/api/v1/personal/login',
  '/api/v1/personal/register',
  '/api/v1/personal/verify-email',
  '/api/v1/personal/resend-verification',
  '/api/v1/personal/registration-status',
])

function isExempt(pathname: string): boolean {
  return EXEMPT_PERSONAL_ROUTES.has(pathname)
    || EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/**
 * Bloquea toda la API tenant de una cuenta personal vencida. La verificación
 * es server-side para que escribir una URL o llamar la API directamente no
 * eluda el bloqueo visual de la aplicación.
 */
export async function personalSubscriptionMiddleware(
  req: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const pathname = req.url.split('?')[0]
  if (!pathname.startsWith('/api/v1/') || isExempt(pathname)) return

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) return

  let payload
  try {
    payload = tokenService.verifyAccess(authHeader.slice(7))
  } catch {
    // La ruta autenticada devolverá el 401 correspondiente.
    return
  }
  if (!payload.institutionId || (payload as { scope?: string }).scope === 'platform') return

  const institution = await prisma.institution.findUnique({
    where: { id: payload.institutionId },
    select: {
      settings: true,
      subscription: {
        select: { plan: true, startsAt: true, expiresAt: true, graceDays: true, suspendedAt: true },
      },
    },
  })
  const settings = (institution?.settings ?? {}) as Record<string, unknown>
  if (settings.accountType !== 'personal') return

  if (!institution?.subscription) return

  if (computeSubscriptionStatus(institution.subscription).readOnly) {
    throw new SubscriptionInactiveError()
  }
}
