import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { draftWeek } from '../application/services/planning-ai.service'
import { draftProject } from '../application/services/project-ai.service'
import type { DraftProjectDto, DraftWeekDto } from '../application/dtos/ai-assistant.dto'

export default async function aiAssistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Genera un borrador de semana (competencias/indicadores/saberes/momentos DUA) — no guarda nada.
  app.post<{ Body: DraftWeekDto }>(
    '/ai-assistant/draft-week',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => {
      const result = await draftWeek(req.user.institutionId, req.user.sub, req.body)
      return reply.send(result)
    },
  )

  // Genera y GUARDA todo el proyecto interdisciplinario (reto/contexto/propósito/producto
  // final + aporte, destrezas/saberes y todas las semanas de cada asignatura ya unida).
  app.post<{ Body: DraftProjectDto }>(
    '/ai-assistant/draft-project',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => {
      const result = await draftProject(req.user.institutionId, req.user.sub, req.body)
      return reply.send(result)
    },
  )
}
