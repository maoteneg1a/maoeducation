import path from 'path'
import crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { BadRequestError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import {
  PrismaSubscriptionRepository,
  receiptKey,
} from '../infrastructure/repositories/prisma-subscription.repository'
import type { SubmitPaymentDto } from '../application/dtos/subscription.dto'

const repo = new PrismaSubscriptionRepository()

/** Capturas de pantalla y PDF del comprobante. */
const ALLOWED_RECEIPT_MIME = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'application/pdf',
]

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024

export default async function subscriptionRoutes(app: FastifyInstance) {
  /**
   * Estado de la suscripción. Lo lee CUALQUIER usuario autenticado porque es lo
   * que alimenta el banner global — un docente también tiene que enterarse de
   * que la cuenta está por vencer, aunque no pueda pagar.
   */
  app.get('/subscription/status', { preHandler: [authMiddleware] }, async (req, reply) => {
    return reply.send({ status: await repo.getStatus(req.user.institutionId) })
  })

  /** Detalle con historial de pagos: solo quien administra la institución. */
  app.get(
    '/subscription',
    { preHandler: [authMiddleware, requirePermission('institution_config', 'manage')] },
    async (req, reply) => {
      return reply.send(await repo.getDetail(req.user.institutionId))
    },
  )

  /** Sube la captura del comprobante de transferencia (multipart). */
  app.post(
    '/subscription/payments',
    { preHandler: [authMiddleware, requirePermission('institution_config', 'manage')] },
    async (req, reply) => {
      const data = await req.file()
      if (!data) throw new BadRequestError('Adjunta la captura del comprobante')

      if (!ALLOWED_RECEIPT_MIME.includes(data.mimetype)) {
        throw new BadRequestError('Formato no permitido (usa PNG, JPG, WebP o PDF)')
      }

      const buf = await data.toBuffer()
      if (buf.length > MAX_RECEIPT_BYTES) {
        throw new BadRequestError('El comprobante no debe superar 8 MB')
      }

      // Los campos del formulario vienen como partes de texto del multipart.
      const fields = data.fields as Record<string, { value?: unknown } | undefined>
      const text = (key: string): string | undefined => {
        const raw = fields[key]?.value
        if (typeof raw !== 'string') return undefined
        const trimmed = raw.trim()
        return trimmed === '' ? undefined : trimmed
      }

      const rawAmount = text('amount')
      const amount = rawAmount === undefined ? undefined : Number(rawAmount)
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
        throw new BadRequestError('El monto no es un número válido')
      }

      const dto: SubmitPaymentDto = {
        amount,
        currency: text('currency') ?? 'USD',
        transferredAt: text('transferredAt'),
        reference: text('reference'),
        notes: text('notes'),
      }

      const ext = path.extname(data.filename).toLowerCase()
      const storedName = `${crypto.randomUUID()}${ext}`
      await storage.save(receiptKey(storedName), buf, data.mimetype)

      const payment = await repo.submitPayment(req.user.institutionId, req.user.sub, dto, {
        fileName: data.filename,
        storedName,
        mimeType: data.mimetype,
        fileSize: buf.length,
      })

      return reply.status(201).send(payment)
    },
  )

  /**
   * Descarga del comprobante propio.
   *
   * Existe porque /uploads/* es público: una captura de transferencia no puede
   * servirse sin autenticación. Se filtra por institutionId del token para que
   * un admin no pueda leer el comprobante de otra institución cambiando el id.
   */
  app.get<{ Params: { id: string } }>(
    '/subscription/payments/:id/receipt',
    { preHandler: [authMiddleware, requirePermission('institution_config', 'manage')] },
    async (req, reply) => {
      const payment = await prisma.subscriptionPayment.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
        select: { storedName: true, mimeType: true, fileName: true },
      })
      if (!payment) throw new NotFoundError('Comprobante no encontrado')

      const stream = await storage.getStream(receiptKey(payment.storedName))
      if (!stream) throw new NotFoundError('El archivo del comprobante no está disponible')

      reply.header('Content-Type', payment.mimeType)
      reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(payment.fileName)}"`)
      reply.header('Cache-Control', 'private, no-store')
      return reply.send(stream)
    },
  )
}
