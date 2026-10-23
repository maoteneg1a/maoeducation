import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { PrismaNormativeRepository } from '../infrastructure/repositories/prisma-normative.repository'
import type { NormativeProfile } from '../../../shared/domain/agreement-rules'
import type { ReportsFlowConfig } from '../../../shared/domain/reports-flow'

/**
 * Configuración normativa por institución (Acuerdo 2026-00082-A):
 * perfil (sostenimiento/régimen/marco), reglas del motor y flujo de informes.
 */
export default async function normativeRoutes(app: FastifyInstance) {
  const repo = new PrismaNormativeRepository()
  app.addHook('preHandler', authMiddleware)

  // Lectura: cualquier usuario autenticado (el frontend necesita las reglas activas)
  app.get('/institution/normative-profile', async (req, reply) =>
    reply.send(await repo.get(req.user.institutionId)),
  )

  app.put<{ Body: { profile?: Partial<NormativeProfile>; rules?: unknown } }>(
    '/institution/normative-profile',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => reply.send(await repo.update(req.user.institutionId, req.body ?? {})),
  )

  app.post<{ Body: { includeWeights?: boolean; includeScales?: boolean } }>(
    '/institution/normative-profile/apply-preset',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => reply.send(await repo.applyPreset(req.user.institutionId, req.body ?? {})),
  )

  app.get('/institution/reports-flow', async (req, reply) =>
    reply.send(await repo.getReportsFlow(req.user.institutionId)),
  )

  app.put<{ Body: ReportsFlowConfig }>(
    '/institution/reports-flow',
    { preHandler: [requirePermission('formal_reports', 'manage')] },
    async (req, reply) => reply.send(await repo.updateReportsFlow(req.user.institutionId, req.body)),
  )

  app.post(
    '/institution/reports-flow/reset',
    { preHandler: [requirePermission('formal_reports', 'manage')] },
    async (req, reply) => reply.send(await repo.resetReportsFlow(req.user.institutionId)),
  )
}
