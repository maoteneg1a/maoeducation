import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { actorOf } from '../../../shared/infrastructure/services/actor'
import { PrismaEarlyAlertRepository } from '../infrastructure/repositories/prisma-early-alert.repository'
import type { DismissAlertDto, LinkCaseDto, ListEarlyAlertsQuery } from '../application/dtos/early-alert.dto'

export default async function earlyAlertRoutes(app: FastifyInstance) {
  const repo = new PrismaEarlyAlertRepository()
  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: ListEarlyAlertsQuery }>(
    '/early-alerts',
    { preHandler: [requirePermission('early_alerts', 'read')] },
    async (req, reply) => reply.send(await repo.list(req.user.institutionId, actorOf(req.user), req.query)),
  )

  app.get<{ Querystring: { periodId: string } }>(
    '/early-alerts/summary',
    { preHandler: [requirePermission('early_alerts', 'read', 'all')] },
    async (req, reply) => reply.send(await repo.summary(req.user.institutionId, actorOf(req.user), req.query.periodId)),
  )

  app.post<{ Params: { id: string }; Body: DismissAlertDto }>(
    '/early-alerts/:id/dismiss',
    { preHandler: [requirePermission('early_alerts', 'read')] },
    async (req, reply) => reply.send(await repo.dismiss(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.reason)),
  )

  app.post<{ Params: { id: string } }>(
    '/early-alerts/:id/reopen',
    { preHandler: [requirePermission('early_alerts', 'read')] },
    async (req, reply) => reply.send(await repo.reopen(req.user.institutionId, actorOf(req.user), req.params.id)),
  )

  app.post<{ Params: { id: string }; Body: LinkCaseDto }>(
    '/early-alerts/:id/link-case',
    { preHandler: [requirePermission('early_alerts', 'read')] },
    async (req, reply) => reply.send(await repo.linkCase(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.planId)),
  )
}
