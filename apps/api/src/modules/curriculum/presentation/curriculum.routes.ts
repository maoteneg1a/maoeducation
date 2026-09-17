import { FastifyInstance } from 'fastify'
import { PrismaCurriculumRepository } from '../infrastructure/repositories/prisma-curriculum.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type {
  CreateCustomSkillDto,
  CreateSaberDto,
  UpdateSaberDto,
  UpdateSkillDto,
} from '../application/dtos/curriculum.dto'

const repo = new PrismaCurriculumRepository()

export default async function curriculumRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get(
    '/curriculum/areas',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (_req, reply) => reply.send(await repo.listAreas()),
  )

  app.get<{ Params: { areaId: string }; Querystring: { subnivel: string } }>(
    '/curriculum/areas/:areaId/criteria',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) =>
      reply.send(
        await repo.listCriteria(req.params.areaId, req.user.institutionId, req.query.subnivel),
      ),
  )

  // Destrezas disponibles para una materia (según su área + el subnivel del grado) — usado por el selector del PUD
  app.get<{ Params: { subjectId: string }; Querystring: { subnivel: string } }>(
    '/curriculum/subjects/:subjectId/skills',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) =>
      reply.send(
        await repo.listSkillsForSubject(req.params.subjectId, req.user.institutionId, req.query.subnivel),
      ),
  )

  app.post<{ Body: CreateCustomSkillDto }>(
    '/curriculum/skills',
    { preHandler: [requirePermission('curriculum', 'manage', 'all')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createCustomSkill(req.user.institutionId, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateSkillDto }>(
    '/curriculum/skills/:id',
    { preHandler: [requirePermission('curriculum', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.updateSkill(req.params.id, req.user.institutionId, req.body)),
  )

  // ─── Saberes (declarativo/procedimental/actitudinal) — desagregación institucional ──
  app.get<{ Params: { skillId: string } }>(
    '/curriculum/skills/:skillId/saberes',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) =>
      reply.send(await repo.listSaberesForSkill(req.params.skillId, req.user.institutionId)),
  )

  app.post<{ Body: CreateSaberDto }>(
    '/curriculum/saberes',
    { preHandler: [requirePermission('curriculum', 'write', 'own')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createSaber(req.user.institutionId, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateSaberDto }>(
    '/curriculum/saberes/:id',
    { preHandler: [requirePermission('curriculum', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.updateSaber(req.params.id, req.user.institutionId, req.body)),
  )
}
