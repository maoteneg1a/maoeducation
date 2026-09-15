import { FastifyInstance } from 'fastify'
import { PrismaCurricularInsertionRepository } from '../infrastructure/repositories/prisma-curricular-insertion.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'

const repo = new PrismaCurricularInsertionRepository()

export default async function curricularInsertionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get(
    '/curricular-insertions/banks',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (_req, reply) => reply.send(await repo.listBanks()),
  )

  // Sugerencias de ejes de inserción curricular (socioemocional, sostenible, cívica,
  // vial, financiera) relevantes a las destrezas/competencias que el docente ya
  // seleccionó en la semana — solo referencia, nunca bloquea ni se auto-aplica.
  app.get<{ Querystring: { codes: string; bankKey?: string } }>(
    '/curricular-insertions/candidates',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) => {
      const codes = req.query.codes ? req.query.codes.split(',').filter(Boolean) : []
      return reply.send(await repo.findCandidatesForCodes(codes, req.query.bankKey))
    },
  )
}
