import { FastifyInstance } from 'fastify'
import { audit } from '../../../shared/infrastructure/services/audit.service'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { PrismaPromotionRepository } from '../infrastructure/repositories/prisma-promotion.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type { SaveDecisionDto, SaveRecoveryDto } from '../application/dtos/promotion.dto'

const repo = new PrismaPromotionRepository()

export default async function promotionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Params: { parallelId: string }; Querystring: { yearId: string } }>(
    '/parallels/:parallelId/promotion',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      if (!req.query.yearId) return reply.status(400).send({ message: 'yearId es requerido' })
      return reply.send(
        await repo.getParallelPromotion(req.user.institutionId, req.params.parallelId, req.query.yearId),
      )
    },
  )

  app.put<{ Body: SaveRecoveryDto }>(
    '/promotion/recovery',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => {
      return reply.send(await repo.saveRecovery(req.user.institutionId, req.body, req.user.sub))
    },
  )

  app.put<{ Body: SaveDecisionDto }>(
    '/promotion/decision',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => {
      const before = await prisma.promotionDecision.findUnique({
        where: { studentId_academicYearId: { studentId: req.body.studentId, academicYearId: req.body.academicYearId } },
        select: { status: true },
      })
      const result = await repo.saveDecision(req.user.institutionId, req.body, req.user.sub)
      await audit(req, {
        action: 'promotion.decision',
        resourceType: 'student',
        resourceId: req.body.studentId,
        oldValue: { status: before?.status ?? null },
        newValue: { status: req.body.status, notes: req.body.notes ?? null, academicYearId: req.body.academicYearId },
      })
      return reply.send(result)
    },
  )
}
