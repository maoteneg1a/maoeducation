import { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { draftWeek } from '../application/services/planning-ai.service'
import { draftProject } from '../application/services/project-ai.service'
import { draftCompetencyWeek } from '../application/services/competency-pedagogical-generator.service'
import { draftSituationBlock, type DraftSituationBlockDto } from '../application/services/draft-situation-block.service'
import type { DraftCompetencyWeekDto, DraftProjectDto, DraftWeekDto } from '../application/dtos/ai-assistant.dto'

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

  // Igual que draft-week pero para el modelo por competencias — motor en dos capas
  // (IA validada agresivamente + fallback determinista por catálogos DUA/evaluación).
  app.post<{ Body: DraftCompetencyWeekDto }>(
    '/ai-assistant/draft-competency-week',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => {
      const result = await draftCompetencyWeek(req.user.institutionId, req.user.sub, req.body)
      return reply.send(result)
    },
  )

  // Estilo TIGA: genera y GUARDA de una sola vez las N semanas de un bloque completo
  // (el docente elige destreza/competencia UNA vez, no semana por semana).
  app.post<{ Body: DraftSituationBlockDto }>(
    '/ai-assistant/draft-situation-block',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => {
      const result = await draftSituationBlock(req.user.institutionId, req.user.sub, req.body)
      return reply.status(201).send(result)
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
