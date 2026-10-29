import { FastifyInstance } from 'fastify'
import { platformAuthMiddleware, requirePlatformRole } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { restorationGuide } from '../application/platform-documentation.generated'

export default async function platformDocumentationRoutes(app: FastifyInstance) {
  app.get('/platform/documentation', {
    preHandler: [platformAuthMiddleware, requirePlatformRole('owner')],
  }, async (_req, reply) => {
    return reply.header('Cache-Control', 'private, no-store').send({
      guides: [{
        id: 'restore-local-database',
        title: 'Restaurar una base local',
        description: 'Docker Desktop, PostgreSQL 18, copias cifradas y DBeaver.',
        content: restorationGuide,
      }],
    })
  })
}
