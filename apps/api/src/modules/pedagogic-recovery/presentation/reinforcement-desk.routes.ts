import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { actorOf } from '../../../shared/infrastructure/services/actor'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { BadRequestError, ForbiddenError } from '../../../shared/domain/errors/app.errors'
import { PrismaReinforcementDeskRepository, type ListCasesQuery, type FormativeResultDto } from '../infrastructure/repositories/prisma-reinforcement-desk.repository'

const formativeBody = {
  type: 'object',
  required: ['studentId', 'activityIds', 'sessionIds'],
  properties: {
    studentId: { type: 'string', minLength: 1, maxLength: 128 },
    activityIds: { type: 'array', maxItems: 500, items: { type: 'string', minLength: 1, maxLength: 128 } },
    sessionIds: { type: 'array', maxItems: 500, items: { type: 'string', minLength: 1, maxLength: 128 } },
    reason: { type: 'string', maxLength: 2000 },
    revoke: { type: 'boolean' },
    expectedResultId: { type: ['string', 'null'], maxLength: 128 },
    expectedPreviewToken: { type: 'string', minLength: 64, maxLength: 64 },
  },
} as const

/**
 * Consulta del caso de refuerzo por rol + archivos + sesiones con asistencia.
 * El control de acceso fino (docente, tutor, lectura transversal, destinatario
 * de un informe del caso) lo hace el repositorio. Representantes y estudiantes
 * no tienen acceso.
 */
export default async function reinforcementDeskRoutes(app: FastifyInstance) {
  const repo = new PrismaReinforcementDeskRepository()
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', async (req) => {
    if (!req.user.roles.some((r) => r !== 'guardian' && r !== 'student')) throw new ForbiddenError()
  })

  app.get<{ Querystring: ListCasesQuery }>('/reinforcement-desk/cases', async (req, reply) =>
    reply.send(await repo.list(req.user.institutionId, actorOf(req.user), req.query)))

  app.get<{ Params: { id: string } }>('/reinforcement-desk/cases/:id', async (req, reply) =>
    reply.send(await repo.detail(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.get<{ Params: { id: string } }>('/reinforcement-desk/cases/:id/activities', async (req, reply) =>
    reply.send(await repo.activities(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.get<{ Params: { id: string } }>('/reinforcement-desk/cases/:id/formative', async (req, reply) =>
    reply.send(await repo.formativeOptions(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.post<{ Params: { id: string }; Body: FormativeResultDto }>('/reinforcement-desk/cases/:id/formative/preview', { schema: { body: formativeBody } }, async (req, reply) =>
    reply.send(await repo.previewFormative(req.user.institutionId, actorOf(req.user), req.params.id, req.body)))

  app.post<{ Params: { id: string }; Body: FormativeResultDto }>('/reinforcement-desk/cases/:id/formative/apply', { schema: { body: { ...formativeBody, required: [...formativeBody.required, 'reason', 'expectedResultId', 'expectedPreviewToken'] } } }, async (req, reply) =>
    reply.code(201).send(await repo.applyFormative(req.user.institutionId, actorOf(req.user), req.params.id, req.body)))

  app.post<{ Params: { id: string }; Body: { date: string; title: string; description?: string; targetActivityId?: string | null } }>(
    '/reinforcement-desk/cases/:id/sessions',
    async (req, reply) => reply.code(201).send(await repo.createSession(req.user.institutionId, actorOf(req.user), req.params.id, req.body)),
  )

  app.patch<{ Params: { id: string; sessionId: string }; Body: { date?: string; title?: string; description?: string | null; targetActivityId?: string | null } }>(
    '/reinforcement-desk/cases/:id/sessions/:sessionId',
    async (req, reply) => reply.send(await repo.updateSession(req.user.institutionId, actorOf(req.user), req.params.id, req.params.sessionId, req.body ?? {})),
  )

  app.delete<{ Params: { id: string; sessionId: string } }>(
    '/reinforcement-desk/cases/:id/sessions/:sessionId',
    async (req, reply) => {
      await repo.deleteSession(req.user.institutionId, actorOf(req.user), req.params.id, req.params.sessionId)
      return reply.code(204).send()
    },
  )

  app.put<{ Params: { id: string; sessionId: string }; Body: { items: Array<{ studentId: string; status: 'present' | 'absent' | 'justified'; score?: number | null; observation?: string | null }> } }>(
    '/reinforcement-desk/cases/:id/sessions/:sessionId/attendance',
    async (req, reply) => reply.send(await repo.saveAttendance(req.user.institutionId, actorOf(req.user), req.params.id, req.params.sessionId, req.body?.items ?? [])),
  )

  app.post<{ Params: { id: string }; Querystring: { category?: string; sessionId?: string } }>(
    '/reinforcement-desk/cases/:id/attachments',
    async (req, reply) => {
      const data = await req.file()
      if (!data) throw new BadRequestError('No se recibió ningún archivo')
      const buffer = await data.toBuffer()
      return reply.send(await repo.addAttachment(
        req.user.institutionId, actorOf(req.user), req.params.id,
        { filename: data.filename, mimetype: data.mimetype, buffer },
        req.query.category ?? 'otro', req.query.sessionId,
      ))
    },
  )

  app.get<{ Params: { id: string; attachmentId: string } }>(
    '/reinforcement-desk/cases/:id/attachments/:attachmentId',
    async (req, reply) => {
      const a = await repo.attachmentForDownload(req.user.institutionId, actorOf(req.user), req.params.id, req.params.attachmentId)
      const stream = await storage.getStream(a.storedName)
      if (!stream) return reply.code(404).send({ message: 'Archivo no encontrado' })
      return reply
        .header('Content-Type', a.mimeType)
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(a.fileName)}"`)
        .send(stream)
    },
  )

  app.delete<{ Params: { id: string; attachmentId: string } }>(
    '/reinforcement-desk/cases/:id/attachments/:attachmentId',
    async (req, reply) => reply.send(await repo.removeAttachment(req.user.institutionId, actorOf(req.user), req.params.id, req.params.attachmentId)),
  )
}
