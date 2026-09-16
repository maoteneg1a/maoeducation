import { FastifyInstance } from 'fastify'
import { PrismaPedagogicRecoveryRepository } from '../infrastructure/repositories/prisma-pedagogic-recovery.repository'
import { buildReinforcementPlanPdf } from '../application/services/reinforcement-plan-pdf.service'
import { buildReinforcementCasePdf } from '../application/services/reinforcement-case-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type {
  CreateReinforcementPlanDto,
  ListReinforcementPlansQuery,
  PedagogicRecoveryQuery,
  SavePedagogicRecoveryDto,
  SkillReinforcementQuery,
  UpdateReinforcementPlanDto,
  CreateReinforcementCaseDto,
  EditReinforcementProposalDto,
  AddReinforcementCommunicationDto,
  AddReinforcementCommitmentDto,
  AddReinforcementFollowUpDto,
  ReevaluateReinforcementCaseDto,
  ConfirmReinforcementOutcomeDto,
  CreateNextReinforcementCycleDto,
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

  // ─── Flujo completo de refuerzo pedagógico (motor TIGA) ────────────────
  // Máquina de estados sobre ReinforcementPlan.planType="academico".

  app.get<{ Querystring: ListReinforcementPlansQuery }>(
    '/pedagogic-recovery/reinforcement-cases',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => reply.send(await repo.listReinforcementCases(req.user.institutionId, req.query)),
  )

  app.get<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-cases/:id',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => reply.send(await repo.getReinforcementCase(req.params.id, req.user.institutionId)),
  )

  app.post<{ Body: CreateReinforcementCaseDto }>(
    '/pedagogic-recovery/reinforcement-cases',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.status(201).send(await repo.createReinforcementCase(req.user.institutionId, req.user.sub, req.body)),
  )

  app.put<{ Params: { id: string }; Body: EditReinforcementProposalDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/proposal',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.send(await repo.editReinforcementProposal(req.params.id, req.user.institutionId, req.body)),
  )

  app.post<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-cases/:id/confirm-plan',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => reply.send(await repo.confirmReinforcementPlan(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-cases/:id/start',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => reply.send(await repo.startReinforcement(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string }; Body: AddReinforcementCommunicationDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/communications',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(await repo.addReinforcementCommunication(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  app.post<{ Params: { id: string }; Body: AddReinforcementCommitmentDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/commitments',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(await repo.addReinforcementCommitment(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  app.post<{ Params: { id: string }; Body: AddReinforcementFollowUpDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/follow-ups',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(await repo.addReinforcementFollowUp(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  app.post<{ Params: { id: string }; Body: ReevaluateReinforcementCaseDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/reevaluate',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.send(await repo.reevaluateReinforcementCase(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  app.post<{ Params: { id: string }; Body: ConfirmReinforcementOutcomeDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/confirm-outcome',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply.send(await repo.confirmReinforcementOutcome(req.params.id, req.user.institutionId, req.body)),
  )

  app.post<{ Params: { id: string }; Body: CreateNextReinforcementCycleDto }>(
    '/pedagogic-recovery/reinforcement-cases/:id/next-cycle',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(await repo.createNextReinforcementCycle(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  app.get<{ Params: { id: string } }>(
    '/pedagogic-recovery/reinforcement-cases/:id/pdf',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      const kase = await repo.getReinforcementCase(req.params.id, req.user.institutionId)
      const pdfData = await repo.getReinforcementCasePdfData(req.params.id, req.user.institutionId)
      const pdf = await buildReinforcementCasePdf(pdfData)
      const slug = (kase.student.profile ? `${kase.student.profile.firstName}_${kase.student.profile.lastName}` : kase.studentId)
        .replace(/\s+/g, '_')
        .toLowerCase()
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="caso-refuerzo-${slug}.pdf"`)
        .send(pdf)
    },
  )
}
