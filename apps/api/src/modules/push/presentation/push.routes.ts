import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { env } from '../../../config/env'

export default async function pushRoutes(app: FastifyInstance) {
  // Clave pública VAPID — pública, sin auth (el SW la necesita antes del login)
  app.get('/push/vapid-public-key', async (_req, reply) => {
    return reply.send({ publicKey: env.VAPID_PUBLIC_KEY ?? null })
  })

  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: { limit?: string } }>('/notifications', async (req, reply) => {
    const requested = Number(req.query.limit ?? 30)
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 100) : 30
    const [items, unread] = await Promise.all([
      prisma.userNotification.findMany({
        where: { userId: req.user.sub },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.userNotification.count({ where: { userId: req.user.sub, readAt: null } }),
    ])
    return reply.send({ items, unread })
  })

  app.patch<{ Params: { id: string } }>('/notifications/:id/read', async (req, reply) => {
    await prisma.userNotification.updateMany({
      where: { id: req.params.id, userId: req.user.sub },
      data: { readAt: new Date() },
    })
    return reply.send({ ok: true })
  })

  app.patch('/notifications/read-all', async (req, reply) => {
    await prisma.userNotification.updateMany({
      where: { userId: req.user.sub, readAt: null },
      data: { readAt: new Date() },
    })
    return reply.send({ ok: true })
  })

  // POST /push/subscribe — registra o actualiza una suscripción push
  app.post<{ Body: { endpoint: string; keys: { p256dh: string; auth: string } } }>(
    '/push/subscribe',
    async (req, reply) => {
      const { endpoint, keys } = req.body
      await prisma.pushSubscription.upsert({
        where: { userId_endpoint: { userId: req.user.sub, endpoint } },
        update: { p256dh: keys.p256dh, auth: keys.auth },
        create: { userId: req.user.sub, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      })
      return reply.send({ ok: true })
    },
  )

  // DELETE /push/subscribe — elimina la suscripción de este dispositivo
  app.delete<{ Body: { endpoint: string } }>(
    '/push/subscribe',
    async (req, reply) => {
      await prisma.pushSubscription.deleteMany({
        where: { userId: req.user.sub, endpoint: req.body.endpoint },
      })
      return reply.send({ ok: true })
    },
  )
}
