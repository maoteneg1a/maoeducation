import { FastifyInstance } from 'fastify'
import { platformAuthMiddleware, requirePlatformRole } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { quickStartGuide, restorationGuide, railwayRecoveryGuide } from '../application/platform-documentation.generated'

export default async function platformDocumentationRoutes(app: FastifyInstance) {
  app.get('/platform/documentation', {
    preHandler: [platformAuthMiddleware, requirePlatformRole('owner')],
  }, async (_req, reply) => {
    return reply.header('Cache-Control', 'private, no-store').send({
      guides: [{
        id: 'getting-started',
        title: 'Empezar aquí: guía práctica',
        description: 'Instalación, claves, otra computadora y respaldos paso a paso.',
        content: quickStartGuide,
      }, {
        id: 'restore-local-database',
        title: 'Restaurar una base local',
        description: 'Docker Desktop, PostgreSQL 18, copias cifradas y DBeaver.',
        content: restorationGuide,
      }, {
        id: 'recover-railway',
        title: 'Recuperar la base en Railway',
        description: 'Restaurar una copia en una base nueva y reconectar producción.',
        content: railwayRecoveryGuide,
      }],
    })
  })
}
