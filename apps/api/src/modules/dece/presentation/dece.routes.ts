import type { FastifyInstance, FastifyRequest } from 'fastify'
import { AppError } from '../../../shared/domain/errors/app.errors'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { DeceService } from '../application/dece.service'

export function createDeceRoutes(service: DeceService) {
  return async function deceRoutes(app: FastifyInstance) {
    const actor = (req: FastifyRequest) => service.actor(req.user.sub, req.user.institutionId)
    app.addHook('preHandler', authMiddleware)
    app.addHook('onRequest', async (_req, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache')
    })
    // Nunca registrar bodies, valores de validación ni excepciones Prisma de este módulo.
    app.setErrorHandler(async (error, req, reply) => {
      if (error instanceof AppError) {
        if (
          (error.statusCode === 403 || error.statusCode === 404) &&
          req.user?.sub &&
          req.user?.institutionId
        ) {
          try {
            await service.recordDenied(req.user.sub, req.user.institutionId)
          } catch {
            /* no revelar ni registrar contenido sensible */
          }
        }
        return reply
          .status(error.statusCode)
          .send({ error: { code: error.code, message: error.message } })
      }
      req.log.error({ reqId: req.id, code: 'DECE_REQUEST_FAILED' }, 'Protected DECE request failed')
      return reply
        .status(500)
        .send({
          error: { code: 'INTERNAL_ERROR', message: 'No se pudo completar la operación protegida' },
        })
    })
    app.get('/dece/context', async (req) => service.context(await actor(req)))
    app.get('/dece/settings', async (req) => service.getSettings(await actor(req)))
    app.put('/dece/settings', async (req) => service.saveSettings(await actor(req), req.body))
    app.get('/dece/reporting-contacts', async (req) => service.reportingContacts(await actor(req)))
    app.post('/dece/reports', async (req, reply) =>
      reply.code(201).send(await service.createReport(await actor(req), req.body)),
    )
    app.get('/dece/receipts', async (req) => service.receipts(await actor(req)))
    app.get('/dece/cases', async (req) => service.list(await actor(req)))
    app.get<{ Params: { id: string } }>('/dece/cases/:id', async (req) =>
      service.detail(await actor(req), req.params.id),
    )
    app.post<{ Params: { id: string } }>('/dece/cases/:id/actions', async (req) =>
      service.addAction(await actor(req), req.params.id, req.body),
    )
    app.patch<{ Params: { id: string } }>('/dece/cases/:id/status', async (req) =>
      service.changeStatus(await actor(req), req.params.id, req.body),
    )
    app.get<{ Params: { id: string } }>('/dece/cases/:id/access', async (req) =>
      service.access(await actor(req), req.params.id),
    )
    app.post<{ Params: { id: string } }>('/dece/cases/:id/access', async (req) =>
      service.grant(await actor(req), req.params.id, req.body),
    )
    app.post<{ Params: { id: string } }>('/dece/cases/:id/revoke', async (req) =>
      service.revoke(await actor(req), req.params.id, req.body),
    )
    app.post<{ Params: { id: string } }>('/dece/cases/:id/exclusions', async (req) =>
      service.revoke(await actor(req), req.params.id, req.body, true),
    )
    app.get<{ Params: { id: string } }>('/dece/cases/:id/audit', async (req) =>
      service.auditLog(await actor(req), req.params.id),
    )
  }
}

export default async function deceRoutes(app: FastifyInstance) {
  return createDeceRoutes(new DeceService())(app)
}
