import { FastifyInstance } from 'fastify'
import { PrismaPlanningRepository } from '../infrastructure/repositories/prisma-planning.repository'
import { buildMicrocurricularPdf } from '../application/services/microcurricular-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type {
  CreatePlanDto,
  CreateSituationDto,
  CreateTemplateDto,
  CreateWeekDto,
  PlanningTemplateType,
  UpdatePlanDto,
  UpdateSituationDto,
  UpdateTemplateDto,
  UpdateWeekDto,
} from '../application/dtos/planning.dto'

const repo = new PrismaPlanningRepository()

export default async function planningRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── Plantillas (PCA) ───────────────────────────────────────────────────
  app.get<{ Querystring: { type?: PlanningTemplateType } }>(
    '/planning/templates',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.listTemplates(req.user.institutionId, req.query.type)),
  )

  app.post<{ Body: CreateTemplateDto }>(
    '/planning/templates',
    { preHandler: [requirePermission('planning', 'manage', 'all')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createTemplate(req.user.institutionId, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateTemplateDto }>(
    '/planning/templates/:id',
    { preHandler: [requirePermission('planning', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.updateTemplate(req.params.id, req.user.institutionId, req.body)),
  )

  // ─── PCA ────────────────────────────────────────────────────────────────
  app.get<{ Querystring: { courseAssignmentIds?: string } }>(
    '/planning/plans',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const ids = req.query.courseAssignmentIds?.split(',').filter(Boolean)
      return reply.send(await repo.listPlans(req.user.institutionId, ids))
    },
  )

  app.get<{ Params: { id: string } }>(
    '/planning/plans/:id',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.getPlan(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreatePlanDto }>(
    '/planning/plans',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createPlan(req.user.institutionId, req.user.sub, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdatePlanDto }>(
    '/planning/plans/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.updatePlan(req.params.id, req.user.institutionId, req.body)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/plans/:id/submit',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.submitPlan(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/plans/:id/approve',
    { preHandler: [requirePermission('planning', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.approvePlan(req.params.id, req.user.institutionId, req.user.sub)),
  )

  // ─── Situación de aprendizaje ───────────────────────────────────────────
  app.get<{ Params: { planId: string } }>(
    '/planning/plans/:planId/situations',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.listSituations(req.params.planId, req.user.institutionId)),
  )

  app.get<{ Params: { id: string } }>(
    '/planning/situations/:id',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.getSituation(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreateSituationDto }>(
    '/planning/situations',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createSituation(req.user.institutionId, req.user.sub, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateSituationDto }>(
    '/planning/situations/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.send(await repo.updateSituation(req.params.id, req.user.institutionId, req.body)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/situations/:id/submit',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.submitSituation(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/situations/:id/review',
    { preHandler: [requirePermission('planning', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.reviewSituation(req.params.id, req.user.institutionId, req.user.sub)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/situations/:id/approve',
    { preHandler: [requirePermission('planning', 'manage', 'all')] },
    async (req, reply) =>
      reply.send(await repo.approveSituation(req.params.id, req.user.institutionId, req.user.sub)),
  )

  // ─── Semanas (PlanningWeek) ─────────────────────────────────────────────
  app.get<{ Params: { situationId: string } }>(
    '/planning/situations/:situationId/weeks',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.listWeeks(req.params.situationId, req.user.institutionId)),
  )

  app.get<{ Params: { id: string } }>(
    '/planning/weeks/:id',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.getWeek(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreateWeekDto }>(
    '/planning/weeks',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.status(201).send(await repo.createWeek(req.user.institutionId, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateWeekDto }>(
    '/planning/weeks/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.updateWeek(req.params.id, req.user.institutionId, req.body)),
  )

  app.delete<{ Params: { id: string } }>(
    '/planning/weeks/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.deleteWeek(req.params.id, req.user.institutionId)),
  )

  // ─── PDF (Planificación Microcurricular) ────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/planning/situations/:id/pdf',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const data = await repo.getSituationPdfData(req.params.id, req.user.institutionId)
      const pdf = await buildMicrocurricularPdf(data)
      const slug = data.situationTitle.replace(/\s+/g, '_').toLowerCase()
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="planificacion-${slug}.pdf"`)
        .send(pdf)
    },
  )
}
