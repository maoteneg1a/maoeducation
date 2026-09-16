import { FastifyInstance } from 'fastify'
import { PrismaPlanningRepository } from '../infrastructure/repositories/prisma-planning.repository'
import { PrismaInstitutionRepository } from '../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildMicrocurricularPdf } from '../application/services/microcurricular-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { getPlannedSkillIds, getPlannedCompetencyIds } from '../../../shared/infrastructure/services/planned-curriculum.service'
import { prisma } from '../../../shared/infrastructure/database/prisma'
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
const institutionRepo = new PrismaInstitutionRepository()

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

  // Sin flujo de aprobación por terceros para el plan padre (pedido explícito
  // del usuario): antes existían /plans/:id/submit y /plans/:id/approve con
  // CurriculumPlan.status ("borrador"|"enviado"|"aprobado") completamente
  // desconectado del estado real de las situaciones hijas — se podía "aprobar"
  // un plan con 0 situaciones o con todas en borrador. Eliminados; ver
  // comentario en el modelo CurriculumPlan (schema.prisma).

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

  // Sin flujo de aprobación por terceros para este documento (pedido explícito
  // del usuario) — el propio docente marca "listo" cuando termina, y puede
  // volver a "borrador" libremente. Ambos endpoints requieren solo permiso de
  // escritura "own" (el mismo que edita la situación), no "manage"/"all" como
  // antes con review/approve.
  app.post<{ Params: { id: string } }>(
    '/planning/situations/:id/mark-ready',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.markSituationReady(req.params.id, req.user.institutionId, req.user.sub)),
  )

  app.post<{ Params: { id: string } }>(
    '/planning/situations/:id/reopen',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.reopenSituation(req.params.id, req.user.institutionId, req.user.sub)),
  )

  app.delete<{ Params: { id: string } }>(
    '/planning/situations/:id',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) => reply.send(await repo.deleteSituation(req.params.id, req.user.institutionId)),
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

  // ─── Destrezas planificadas (motor central: lo único disponible para el
  // resto del sistema — actividades, refuerzo, proyectos interdisciplinarios) ──
  app.get<{ Querystring: { courseAssignmentId: string; academicPeriodId: string } }>(
    '/planning/planned-skills',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const skillIds = await getPlannedSkillIds(req.query.courseAssignmentId, req.query.academicPeriodId)
      if (skillIds.length === 0) return reply.send([])
      const skills = await prisma.curriculumSkill.findMany({
        where: { id: { in: skillIds } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      })
      return reply.send(skills)
    },
  )

  // Misma idea que planned-skills pero para el modelo por COMPETENCIAS
  app.get<{ Querystring: { courseAssignmentId: string; academicPeriodId: string } }>(
    '/planning/planned-competencies',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const competencyIds = await getPlannedCompetencyIds(req.query.courseAssignmentId, req.query.academicPeriodId)
      if (competencyIds.length === 0) return reply.send([])
      const competencies = await prisma.competency.findMany({
        where: { id: { in: competencyIds } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      })
      return reply.send(competencies)
    },
  )

  // ─── PDF (Planificación Microcurricular) ────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/planning/situations/:id/pdf',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const [data, template] = await Promise.all([
        repo.getSituationPdfData(req.params.id, req.user.institutionId),
        institutionRepo.getMicrocurricularTemplate(req.user.institutionId),
      ])
      const pdf = await buildMicrocurricularPdf(data, template)
      // Content-Disposition debe ser ASCII puro — un título con tildes/ñ (normal en
      // español: "Situación", "Ecología"...) rompía el header con ERR_INVALID_CHAR
      // y tumbaba la descarga con 500, sin relación con el contenido del PDF.
      const slug = data.situationTitle
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase() || 'situacion'
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="planificacion-${slug}.pdf"`)
        .send(pdf)
    },
  )
}
