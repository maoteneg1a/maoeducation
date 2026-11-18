import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { BadRequestError } from '../../../shared/domain/errors/app.errors'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { contextSchema } from '../domain/preparatoria-policy'
import { preparatoryOptions, preparatoryContext, prepareProgram, configureProgram, preparatorySheet, selectPeriodLearning, savePreparatoryValues } from '../application/preparatoria.service'

export default async function preparatoriaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.get('/preparatoria/options', req => preparatoryOptions(req.user))
  const query = (input: unknown) => { const result = contextSchema.safeParse(input); if (!result.success) throw new BadRequestError('Selecciona un paralelo y período válidos'); return result.data }
  app.get('/preparatoria/context', req => preparatoryContext(req.user, query(req.query).parallelId))
  app.post('/preparatoria/prepare', req => prepareProgram(req.user, query(req.query).parallelId))
  app.put('/preparatoria/program', req => configureProgram(req.user, query(req.query).parallelId, req.body))
  app.get('/preparatoria/sheet', req => { const q = query(req.query); if (!q.periodId) throw new BadRequestError('Selecciona un período'); return preparatorySheet(req.user, q.parallelId, q.periodId) })
  app.put('/preparatoria/selection', req => { const q = query(req.query); if (!q.periodId) throw new BadRequestError('Selecciona un período'); return selectPeriodLearning(req.user, q.parallelId, q.periodId, req.body) })
  app.put('/preparatoria/values', req => { const q = query(req.query); if (!q.periodId) throw new BadRequestError('Selecciona un período'); return savePreparatoryValues(req.user, q.parallelId, q.periodId, req.body) })
  app.get('/preparatoria/history', async req => {
    const ctx = await preparatoryContext(req.user, query(req.query).parallelId)
    if (!ctx.program) return { items: [] }
    return { items: await prisma.auditLog.findMany({ where: { institutionId: req.user.institutionId, resourceType: 'preparatoria', resourceId: ctx.program.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, action: true, userId: true, createdAt: true } }) }
  })
}
