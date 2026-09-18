import { FastifyInstance } from 'fastify'
import { PrismaPlanningRepository } from '../infrastructure/repositories/prisma-planning.repository'
import { PrismaInstitutionRepository } from '../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildMicrocurricularPdf } from '../application/services/microcurricular-pdf.service'
import { buildMicrocurricularDocx } from '../application/services/microcurricular-docx.service'
import { buildMultigradePdf, type MultigradeGradeColumn } from '../application/services/multigrade-pdf.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { getPlannedSkillIds, getPlannedCompetencyIds } from '../../../shared/infrastructure/services/planned-curriculum.service'
import { NotFoundError, BadRequestError } from '../../../shared/domain/errors/app.errors'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import type {
  ConfirmDistributionDto,
  CreatePlanDto,
  CreateSituationDto,
  CreateTemplateDto,
  CreateWeekDto,
  PlanningTemplateType,
  SuggestDistributionDto,
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

  // ─── Distribución de competencias/saberes por semana ────────────────────
  // Reemplaza la elección manual de "situación de aprendizaje": el docente
  // elige periodo + número de semanas, ve la sugerencia automática, la edita
  // si quiere, y confirma — solo entonces se crea/actualiza la situación y
  // las semanas (el docente nunca ve el concepto de "situación").
  app.post<{ Params: { courseAssignmentId: string; academicPeriodId: string }; Body: SuggestDistributionDto }>(
    '/planning/course-assignments/:courseAssignmentId/periods/:academicPeriodId/suggest-distribution',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply.send(
        await repo.suggestDistribution(req.user.institutionId, req.params.courseAssignmentId, req.params.academicPeriodId, req.body),
      ),
  )

  app.post<{ Params: { courseAssignmentId: string; academicPeriodId: string }; Body: ConfirmDistributionDto }>(
    '/planning/course-assignments/:courseAssignmentId/periods/:academicPeriodId/confirm-distribution',
    { preHandler: [requirePermission('planning', 'write', 'own')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(
          await repo.confirmDistribution(
            req.user.institutionId,
            req.user.sub,
            req.params.courseAssignmentId,
            req.params.academicPeriodId,
            req.body,
          ),
        ),
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

  // ─── Word (Planificación Microcurricular) ───────────────────────────────
  // Mismos datos/plantilla que el PDF (buildMicrocurricularDocx replica la misma
  // estructura de secciones/tablas/colores) — el docente elige el formato que
  // prefiera, ambos se ven equivalentes (Word maneja sus propios saltos de
  // página de forma nativa, no es un clon pixel-perfect del PDF).
  app.get<{ Params: { id: string } }>(
    '/planning/situations/:id/docx',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const [data, template] = await Promise.all([
        repo.getSituationPdfData(req.params.id, req.user.institutionId),
        institutionRepo.getMicrocurricularTemplate(req.user.institutionId),
      ])
      const docxBuffer = await buildMicrocurricularDocx(data, template)
      const slug = data.situationTitle
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .trim()
        .replace(/\s+/g, '_')
        .toLowerCase() || 'situacion'
      return reply
        .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        .header('Content-Disposition', `attachment; filename="planificacion-${slug}.docx"`)
        .send(docxBuffer)
    },
  )

  // ─── Aula multigrado (grupo, miembros, semanas ya generadas) ─────────────
  // El groupId lo obtiene el frontend de GET /personal/classes
  // (multigradeGroupId, PR #66) — una cuenta personal tiene como máximo un
  // grupo, no hace falta un endpoint de "listar mis grupos".
  app.get<{ Params: { groupId: string } }>(
    '/planning/multigrade-groups/:groupId',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const group = await prisma.multigradeGroup.findFirst({
        where: { id: req.params.groupId, institutionId: req.user.institutionId },
        include: {
          members: {
            include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } },
          },
        },
      })
      if (!group) throw new NotFoundError('Aula multigrado no encontrada')

      const experiences = await prisma.multigradeSharedExperience.findMany({
        where: { groupId: group.id },
        orderBy: { weekNumber: 'asc' },
        select: { id: true, subjectId: true, academicPeriodId: true, weekNumber: true, title: true, createdAt: true },
      })

      // La experiencia común se genera POR MATERIA (nunca mezclando materias
      // distintas de un mismo bloque, decisión de producto — ver comentario
      // en schema.prisma MultigradeSharedExperience.subjectId) — se agrupan
      // los miembros por subjectId para que la UI muestre un bloque
      // independiente por cada materia, cada uno con sus propias semanas.
      const bySubject = new Map<string, { subjectId: string; subjectName: string; members: typeof group.members }>()
      for (const m of group.members) {
        const key = m.subjectId
        if (!bySubject.has(key)) {
          bySubject.set(key, { subjectId: key, subjectName: m.courseAssignment.subject.name, members: [] })
        }
        bySubject.get(key)!.members.push(m)
      }

      const subjectBlocks = [...bySubject.values()].map((block) => ({
        subjectId: block.subjectId,
        subjectName: block.subjectName,
        members: block.members.map((m) => ({
          courseAssignmentId: m.courseAssignmentId,
          gradeCode: m.gradeCode,
          gradeName: m.courseAssignment.parallel.level.name,
          parallelId: m.parallelId,
        })),
        experiences: experiences
          .filter((e) => e.subjectId === block.subjectId)
          .map((e) => ({ id: e.id, academicPeriodId: e.academicPeriodId, weekNumber: e.weekNumber, title: e.title, createdAt: e.createdAt })),
      }))

      return reply.send({
        id: group.id,
        name: group.name,
        academicYearId: group.academicYearId,
        allowSuperiorExtension: group.allowSuperiorExtension,
        subjectBlocks,
      })
    },
  )

  // ─── PDF (Planificación Microcurricular MULTIGRADO) ─────────────────────
  // Una semana multigrado ya generada (ver /ai-assistant/draft-multigrade-week):
  // experiencia común + una columna por grado participante, en vez de la tabla
  // de 3 columnas de una sola materia.
  app.get<{ Params: { groupId: string; weekNumber: string }; Querystring: { subjectId: string } }>(
    '/planning/multigrade-groups/:groupId/weeks/:weekNumber/pdf',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => {
      const weekNumber = Number(req.params.weekNumber)
      const { subjectId } = req.query
      if (!subjectId) throw new BadRequestError('subjectId es obligatorio — la experiencia común se genera por materia')

      const group = await prisma.multigradeGroup.findFirst({
        where: { id: req.params.groupId, institutionId: req.user.institutionId },
        include: {
          teacher: { include: { profile: true } },
          academicYear: true,
          members: {
            where: { subjectId },
            include: {
              courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } },
            },
          },
        },
      })
      if (!group) throw new NotFoundError('Aula multigrado no encontrada')

      const experience = await prisma.multigradeSharedExperience.findFirst({
        where: { groupId: group.id, subjectId, weekNumber },
        include: { academicPeriod: true },
      })
      if (!experience) throw new NotFoundError('No hay experiencia común generada para esa semana todavía')

      const gradeColumns: MultigradeGradeColumn[] = []
      for (const member of group.members) {
        const situation = await prisma.learningSituation.findFirst({
          where: { plan: { courseAssignmentId: member.courseAssignmentId }, academicPeriodId: experience.academicPeriodId },
          include: { weeks: { where: { weekNumber } } },
        })
        const week = situation?.weeks[0]
        if (!week || !week.momentos) continue

        const [competencies, indicators, sabers] = await Promise.all([
          week.competencyIds.length ? prisma.competency.findMany({ where: { id: { in: week.competencyIds } } }) : [],
          week.competencyIndicatorIds.length
            ? prisma.competencyIndicator.findMany({ where: { id: { in: week.competencyIndicatorIds } } })
            : [],
          week.competencySaberIds.length
            ? prisma.competencySaber.findMany({ where: { id: { in: week.competencySaberIds } } })
            : [],
        ])

        gradeColumns.push({
          gradeCode: member.gradeCode,
          gradeLabel: member.courseAssignment.parallel.level.name,
          subjectName: member.courseAssignment.subject.name,
          competencyCodes: competencies.map((c) => c.code),
          indicatorCodes: indicators.map((i) => i.code).length ? indicators.map((i) => i.code) : week.indicadoresEvaluacion ? [week.indicadoresEvaluacion] : [],
          saberCodes: sabers.map((s) => s.code),
          momentos: week.momentos as unknown as import('../../../shared/domain/pedagogical-methodology').CompetencyWeekMomentos,
        })
      }
      if (gradeColumns.length === 0) {
        throw new NotFoundError('Ningún grado tiene esa semana generada todavía')
      }

      const template = await institutionRepo.getMicrocurricularTemplate(req.user.institutionId)
      const teacherProfile = group.teacher.profile
      const pdf = await buildMultigradePdf(
        {
          institutionName: (await prisma.institution.findUnique({ where: { id: req.user.institutionId } }))?.name ?? '',
          yearName: group.academicYear.name,
          teacherName: teacherProfile ? `${teacherProfile.firstName} ${teacherProfile.lastName}` : '',
          periodName: experience.academicPeriod.name,
          groupName: group.name,
          weekNumber,
          experienceTitle: experience.title,
          experienceContext: experience.context,
          experienceCommonPurpose: experience.commonPurpose,
          grades: gradeColumns,
        },
        template,
      )

      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `inline; filename="planificacion-multigrado-semana-${weekNumber}.pdf"`)
        .send(pdf)
    },
  )
}
