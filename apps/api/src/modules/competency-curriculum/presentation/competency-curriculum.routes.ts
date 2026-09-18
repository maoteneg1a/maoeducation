import { FastifyInstance } from 'fastify'
import { PrismaCompetencyCurriculumRepository } from '../infrastructure/repositories/prisma-competency-curriculum.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'

const repo = new PrismaCompetencyCurriculumRepository()

export default async function competencyCurriculumRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get(
    '/competency-curriculum/areas',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (_req, reply) => reply.send(await repo.listAreas()),
  )

  app.get<{ Params: { areaId: string }; Querystring: { subnivel: string } }>(
    '/competency-curriculum/areas/:areaId/competencies',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) =>
      reply.send(await repo.listCompetencies(req.params.areaId, req.user.institutionId, req.query.subnivel)),
  )

  // Competencias disponibles para una materia (según su área + el subnivel del grado) — usado por el selector del PUD
  app.get<{ Params: { subjectId: string }; Querystring: { subnivel: string } }>(
    '/competency-curriculum/subjects/:subjectId/competencies',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) =>
      reply.send(
        await repo.listCompetenciesForSubject(req.params.subjectId, req.user.institutionId, req.query.subnivel),
      ),
  )

  app.get<{ Params: { competencyId: string }; Querystring: { gradeCode?: string } }>(
    '/competency-curriculum/competencies/:competencyId/saberes',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (req, reply) => reply.send(await repo.listSaberesForCompetency(req.params.competencyId, req.query.gradeCode)),
  )

  app.get(
    '/competency-curriculum/key-competencies',
    { preHandler: [requirePermission('curriculum', 'read', 'all')] },
    async (_req, reply) => reply.send(await repo.listKeyCompetencies()),
  )

  app.post<{ Body: { competencyId: string; type: string; code: string; description: string } }>(
    '/competency-curriculum/saberes',
    { preHandler: [requirePermission('curriculum', 'write', 'own')] },
    async (req, reply) => reply.status(201).send(await repo.createSaber(req.user.institutionId, req.body)),
  )
}
