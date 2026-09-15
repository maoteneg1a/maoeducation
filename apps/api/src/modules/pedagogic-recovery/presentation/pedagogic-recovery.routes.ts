import { FastifyInstance } from 'fastify'
import { PrismaPedagogicRecoveryRepository } from '../infrastructure/repositories/prisma-pedagogic-recovery.repository'
import { buildReinforcementPlanPdf } from '../application/services/reinforcement-plan-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type {
  CreateReinforcementPlanDto,
  ListReinforcementPlansQuery,
  PedagogicRecoveryQuery,
  SavePedagogicRecoveryDto,
  SkillReinforcementQuery,
  UpdateReinforcementPlanDto,
} from '../application/dtos/pedagogic-recovery.dto'

const repo = new PrismaPedagogicRecoveryRepository()

export default async function pedagogicRecoveryRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /pedagogic-recovery?parallelId=&periodId=&yearId=
  app.get<{ Querystring: PedagogicRecoveryQuery }>(
    '/pedagogic-recovery',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      const result = await repo.getPage(req.user.institutionId, req.query)
      return reply.send(result)
    },
  )

  // PUT /pedagogic-recovery  (upsert o borrar si score=null)
  app.put<{ Body: SavePedagogicRecoveryDto }>(
    '/pedagogic-recovery',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => {
      const result = await repo.save(req.user.institutionId, req.body, req.user.sub)
      return reply.send(result)
    },
  )

  // GET /pedagogic-recovery/skill-reinforcement?courseAssignmentId=&academicPeriodId=
  // Candidatos de refuerzo detectados automáticamente por destreza (a partir de las notas).
  app.get<{ Querystring: SkillReinforcementQuery }>(
    '/pedagogic-recovery/skill-reinforcement',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      const result = await repo.getSkillReinforcementCandidates(req.user.institutionId, req.query)
      return reply.send(result)
    },
  )

  // ─── Plan de Refuerzo Académico Individualizado ────────────────────────
  app.get<{ Querystring: ListReinforcementPlansQuery }>(
    '/pedagogic-recovery/reinforcement-plans',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => reply.send(await repo.listReinforcementPlans(req.user.institutionId, req.query)),
  )

  app.get<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-plans/:id',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => reply.send(await repo.getReinforcementPlan(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreateReinforcementPlanDto }>(
    '/pedagogic-recovery/reinforcement-plans',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createReinforcementPlan(req.user.institutionId, req.user.sub, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateReinforcementPlanDto }>(
    '/pedagogic-recovery/reinforcement-plans/:id',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.send(await repo.updateReinforcementPlan(req.params.id, req.user.institutionId, req.body)),
  )

  app.get<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-plans/:id/pdf',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      const data = await repo.getReinforcementPlanPdfData(req.params.id, req.user.institutionId)
      const pdf = await buildReinforcementPlanPdf(data)
      const slug = data.studentName.replace(/\s+/g, '_').toLowerCase()
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="plan-refuerzo-${slug}.pdf"`)
        .send(pdf)
    },
  )
}
