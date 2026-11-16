import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { actorOf } from '../../../shared/infrastructure/services/actor'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { BadRequestError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import * as boards from '../application/course-board.service'

export default async function courseBoardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requirePermission('reports', 'read'))
  const params = { type: 'object', required: ['id'], properties: { id: { type: 'string', minLength: 1 } } }
  app.get<{ Querystring: { yearId?: string } }>('/course-boards/options', async (req) => boards.boardOptions(req.user.institutionId, actorOf(req.user), req.query.yearId))
  app.put<{ Body: unknown }>('/course-boards/config', async (req) => boards.updateBoardConfig(req.user.institutionId, actorOf(req.user), req.body))
  app.post<{ Body: { parallelId: string; periodId: string } }>('/course-boards', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['parallelId', 'periodId'], properties: { parallelId: { type: 'string', minLength: 1 }, periodId: { type: 'string', minLength: 1 } } } },
  }, async (req, reply) => reply.code(201).send(await boards.createBoard(req.user.institutionId, actorOf(req.user), req.body.parallelId, req.body.periodId)))
  app.get<{ Params: { id: string } }>('/course-boards/:id', { schema: { params } }, async (req) => boards.boardDetail(req.user.institutionId, actorOf(req.user), req.params.id))
  app.get<{ Params: { id: string } }>('/course-boards/:id/invitation', { schema: { params } }, async (req) => boards.previewInvitation(req.user.institutionId, actorOf(req.user), req.params.id))
  app.post<{ Params: { id: string }; Body: { revision: number } }>('/course-boards/:id/invitation', {
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['revision'], properties: { revision: { type: 'integer', minimum: 0 } } } },
  }, async (req) => boards.publishInvitation(req.user.institutionId, actorOf(req.user), req.params.id, req.body.revision))
  app.post<{ Params: { id: string } }>('/course-boards/:id/consolidated', { schema: { params } }, async (req) => boards.emitConsolidated(req.user.institutionId, actorOf(req.user), req.params.id))
  app.post<{ Params: { id: string }; Body: unknown }>('/course-boards/:id/reports', { schema: { params } }, async (req) => boards.emitBoardReport(req.user.institutionId, actorOf(req.user), req.params.id, req.body))
  app.post<{ Params: { id: string }; Body: { conclusions: string; revision: number; matrixHash: string } }>('/course-boards/:id/close', {
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['conclusions', 'revision', 'matrixHash'], properties: { conclusions: { type: 'string', minLength: 5, maxLength: 12000 }, revision: { type: 'integer', minimum: 0 }, matrixHash: { type: 'string', pattern: '^[a-f0-9]{64}$' } } } },
  }, async (req) => boards.closeBoard(req.user.institutionId, actorOf(req.user), req.params.id, req.body.conclusions, req.body.revision, req.body.matrixHash))
  app.put<{ Params: { id: string }; Body: unknown }>('/course-boards/:id/meeting', { schema: { params } }, async (req) => boards.updateMeeting(req.user.institutionId, actorOf(req.user), req.params.id, req.body))
  app.post<{ Params: { id: string; kind: 'CALL' | 'ATTENDANCE' | 'MINUTES' } }>('/course-boards/:id/documents/:kind', {
    schema: { params: { type: 'object', required: ['id', 'kind'], properties: { id: { type: 'string', minLength: 1 }, kind: { type: 'string', enum: ['CALL', 'ATTENDANCE', 'MINUTES'] } } } },
  }, async (req) => boards.emitMeetingDocument(req.user.institutionId, actorOf(req.user), req.params.id, req.params.kind))
  app.post<{ Params: { id: string } }>('/course-boards/:id/reopen', { schema: { params } }, async (req) => { await boards.reopenBoard(req.user.institutionId, actorOf(req.user), req.params.id); return { ok: true } })
  app.put<{ Params: { id: string }; Body: { chairId: string } }>('/course-boards/:id/chair', {
    schema: { params, body: { type: 'object', additionalProperties: false, required: ['chairId'], properties: { chairId: { type: 'string', minLength: 1 } } } },
  }, async (req) => { await boards.assignBoardChair(req.user.institutionId, actorOf(req.user), req.params.id, req.body.chairId); return { ok: true } })
  app.post<{ Params: { id: string }; Querystring: { signed?: string } }>('/course-boards/:id/evidence', { schema: { params } }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: 10 * 1024 * 1024, files: 1 } })
    if (!file) throw new BadRequestError('Selecciona el PDF o la imagen del documento físico')
    const buffer = await file.toBuffer()
    return reply.code(201).send(await boards.uploadBoardEvidence(req.user.institutionId, actorOf(req.user), req.params.id, { filename: file.filename, mimetype: file.mimetype, buffer }, req.query.signed === 'true'))
  })
  app.get<{ Params: { id: string } }>('/course-board-evidence/:id', { schema: { params } }, async (req, reply) => {
    const file = await boards.boardFile(req.user.institutionId, actorOf(req.user), req.params.id)
    const stream = await storage.getStream(file.storedName)
    if (!stream) throw new NotFoundError('El archivo no está disponible')
    reply.header('Content-Type', file.mimeType)
    reply.header('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`)
    reply.header('Cache-Control', 'private, no-store')
    reply.header('X-Content-Type-Options', 'nosniff')
    return reply.send(stream)
  })
}
