import { FastifyInstance } from 'fastify'
import { PrismaInterdisciplinaryProjectRepository } from '../infrastructure/repositories/prisma-interdisciplinary-project.repository'
import { buildInterdisciplinaryProjectPdf } from '../application/services/interdisciplinary-project-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type {
  CreateInterdisciplinaryProjectDto,
  JoinProjectDto,
  ListInterdisciplinaryProjectsQuery,
  UpdateContributionDto,
  UpdateInterdisciplinaryProjectDto,
  UpsertWeekEntryDto,
} from '../application/dtos/interdisciplinary-project.dto'

const repo = new PrismaInterdisciplinaryProjectRepository()

export default async function interdisciplinaryProjectRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: ListInterdisciplinaryProjectsQuery }>(
    '/interdisciplinary-projects',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.listProjects(req.user.institutionId, req.query)),
  )

  app.get<{ Params: { id: string } }>(
    '/interdisciplinary-projects/:id',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.getProject(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreateInterdisciplinaryProjectDto }>(
    '/interdisciplinary-projects',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createProject(req.user.institutionId, req.user.sub, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateInterdisciplinaryProjectDto }>(
    '/interdisciplinary-projects/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.updateProject(req.params.id, req.user.institutionId, req.body)),
  )

  // ─── Contribuciones (una asignatura se une al proyecto) ────────────────
  app.post<{ Params: { id: string }; Body: JoinProjectDto }>(
    '/interdisciplinary-projects/:id/contributions',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.status(201).send(await repo.joinProject(req.params.id, req.user.institutionId, req.body)),
  )

  app.put<{ Params: { contributionId: string }; Body: UpdateContributionDto }>(
    '/interdisciplinary-projects/contributions/:contributionId',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.send(await repo.updateContribution(req.params.contributionId, req.user.institutionId, req.body)),
  )

  app.delete<{ Params: { contributionId: string } }>(
    '/interdisciplinary-projects/contributions/:contributionId',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.send(await repo.removeContribution(req.params.contributionId, req.user.institutionId)),
  )

  // ─── Semanas (integración por hitos) ────────────────────────────────────
  app.put<{ Params: { contributionId: string }; Body: UpsertWeekEntryDto }>(
    '/interdisciplinary-projects/contributions/:contributionId/weeks',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.send(await repo.upsertWeekEntry(req.params.contributionId, req.user.institutionId, req.body)),
  )

  // ─── PDF (secciones 6 y 7 del formato de referencia) ────────────────────
  app.get<{ Params: { id: string } }>(
    '/interdisciplinary-projects/:id/pdf',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const data = await repo.getProjectPdfData(req.params.id, req.user.institutionId)
      const pdf = await buildInterdisciplinaryProjectPdf(data)
      const slug = data.title.replace(/\s+/g, '_').toLowerCase()
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="proyecto-${slug}.pdf"`)
        .send(pdf)
    },
  )
}
