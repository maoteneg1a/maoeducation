import { FastifyInstance } from 'fastify'
import { platformAuthMiddleware } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { invalidateSubscriptionCache } from '../../../shared/infrastructure/middleware/subscription.middleware'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { BadRequestError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import {
  PAID_PERIOD_DAYS,
  PrismaSubscriptionRepository,
  addDays,
  receiptKey,
} from '../infrastructure/repositories/prisma-subscription.repository'
import type { PaymentStatus } from '../application/dtos/subscription.dto'

const repo = new PrismaSubscriptionRepository()

const PAYMENT_STATUSES: PaymentStatus[] = ['pending', 'approved', 'rejected']

export default async function platformSubscriptionRoutes(app: FastifyInstance) {
  const protectedOpts = { preHandler: [platformAuthMiddleware] }

  /** Una fila por institución, con estado derivado y comprobantes pendientes. */
  app.get('/platform/subscriptions', protectedOpts, async (_req, reply) => {
    return reply.send(await repo.listSubscriptions())
  })

  /**
   * Vigencia propuesta al aprobar: un año desde hoy, o desde el vencimiento
   * actual si todavía no pasó — así renovar antes de tiempo no regala ni quita
   * días. El superadmin puede editarla antes de confirmar.
   */
  app.get('/platform/subscription-payments', protectedOpts, async (req, reply) => {
    const status = (req.query as { status?: string }).status
    if (status && !PAYMENT_STATUSES.includes(status as PaymentStatus)) {
      throw new BadRequestError('Estado inválido')
    }
    const payments = await repo.listPayments(status as PaymentStatus | undefined)
    const now = new Date()
    return reply.send(
      payments.map((p) => {
        const current = p.currentExpiresAt ? new Date(p.currentExpiresAt) : now
        const base = current > now ? current : now
        return { ...p, suggestedExpiresAt: addDays(base, PAID_PERIOD_DAYS).toISOString() }
      }),
    )
  })

  /** Ver la captura del comprobante (no pasa por /uploads/*, que es público). */
  app.get<{ Params: { id: string } }>(
    '/platform/subscription-payments/:id/receipt',
    protectedOpts,
    async (req, reply) => {
      const payment = await repo.findPaymentStoredName(req.params.id)
      if (!payment) throw new NotFoundError('Comprobante no encontrado')

      const stream = await storage.getStream(receiptKey(payment.storedName))
      if (!stream) throw new NotFoundError('El archivo del comprobante no está disponible')

      reply.header('Content-Type', payment.mimeType)
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(payment.fileName)}"`)
      reply.header('Cache-Control', 'private, no-store')
      return reply.send(stream)
    },
  )

  /** Aprueba el comprobante y activa hasta la fecha indicada. */
  app.post<{ Params: { id: string }; Body: { expiresAt: string; amount?: number; reviewNotes?: string } }>(
    '/platform/subscription-payments/:id/approve',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['expiresAt'],
          properties: {
            expiresAt: { type: 'string', format: 'date-time' },
            amount: { type: 'number', minimum: 0 },
            reviewNotes: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const expiresAt = new Date(req.body.expiresAt)
      if (Number.isNaN(expiresAt.getTime())) throw new BadRequestError('Fecha de vigencia inválida')

      const { institutionId } = await repo.approvePayment(
        req.params.id,
        req.platformAdmin.sub,
        req.body,
      )
      // Sin esto el cliente que acaba de pagar sigue bloqueado hasta un minuto.
      invalidateSubscriptionCache(institutionId)

      return reply.send(await repo.getDetail(institutionId))
    },
  )

  app.post<{ Params: { id: string }; Body: { reviewNotes: string } }>(
    '/platform/subscription-payments/:id/reject',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['reviewNotes'],
          properties: { reviewNotes: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (req, reply) => {
      const { institutionId } = await repo.rejectPayment(
        req.params.id,
        req.platformAdmin.sub,
        req.body.reviewNotes,
      )
      return reply.send(await repo.getDetail(institutionId))
    },
  )

  /**
   * Fija la vigencia a mano, sin comprobante. Para pagos que llegan por fuera
   * (WhatsApp, efectivo) y para poner bajo gestión a una institución que todavía
   * no tenía suscripción — hace upsert.
   */
  app.put<{
    Params: { institutionId: string }
    Body: { expiresAt: string; plan?: 'trial' | 'paid'; graceDays?: number; notes?: string }
  }>(
    '/platform/subscriptions/:institutionId/validity',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['expiresAt'],
          properties: {
            expiresAt: { type: 'string', format: 'date-time' },
            plan: { type: 'string', enum: ['trial', 'paid'] },
            graceDays: { type: 'integer', minimum: 0, maximum: 365 },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const expiresAt = new Date(req.body.expiresAt)
      if (Number.isNaN(expiresAt.getTime())) throw new BadRequestError('Fecha de vigencia inválida')

      const status = await repo.setValidity(req.params.institutionId, req.body)
      invalidateSubscriptionCache(req.params.institutionId)
      return reply.send({ status })
    },
  )

  /** Corte manual (y su reversa). Gana sobre las fechas. */
  app.patch<{ Params: { institutionId: string }; Body: { suspended: boolean } }>(
    '/platform/subscriptions/:institutionId/suspend',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['suspended'],
          properties: { suspended: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const status = await repo.setSuspended(req.params.institutionId, req.body.suspended)
      invalidateSubscriptionCache(req.params.institutionId)
      return reply.send({ status })
    },
  )
}
