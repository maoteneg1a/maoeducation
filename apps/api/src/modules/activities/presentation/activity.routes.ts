import { FastifyInstance } from 'fastify'
import { PrismaActivityRepository } from '../infrastructure/repositories/prisma-activity.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import type {
  CreateActivityTypeDto,
  UpdateActivityTypeDto,
  CreateInsumoDto,
  UpdateInsumoDto,
  CreateActivityDto,
  UpdateActivityDto,
  BulkGradeDto,
  BulkManualInsumoAverageDto,
  ListActivitiesQueryDto,
} from '../application/dtos/activity.dto'

const repo = new PrismaActivityRepository()

export default async function activityRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── Activity Types ────────────────────────────────────────────────────────

  app.get(
    '/activity-types',
    { preHandler: [requirePermission('activities', 'read')] },
    async (req, reply) => {
      const types = await repo.listTypes(req.user.institutionId)
      return reply.send(types)
    },
  )

  app.post<{ Body: CreateActivityTypeDto }>(
    '/activity-types',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const type = await repo.createType(req.user.institutionId, req.body)
      return reply.status(201).send(type)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateActivityTypeDto }>(
    '/activity-types/:id',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const type = await repo.updateType(req.params.id, req.user.institutionId, req.body)
      return reply.send(type)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/activity-types/:id/toggle',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const type = await repo.toggleType(req.params.id, req.user.institutionId)
      return reply.send(type)
    },
  )

  // ─── Insumos ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: { courseAssignmentId: string; periodId: string } }>(
    '/insumos',
    { preHandler: [requirePermission('insumos', 'read', 'own')] },
    async (req, reply) => {
      const insumos = await repo.listInsumos(
        req.user.institutionId,
        req.query.courseAssignmentId,
        req.query.periodId,
      )
      return reply.send(insumos)
    },
  )

  app.post<{ Body: CreateInsumoDto }>(
    '/insumos',
    { preHandler: [requirePermission('insumos', 'write', 'own')] },
    async (req, reply) => {
      const insumo = await repo.createInsumo(req.user.institutionId, req.body, req.user.sub)
      return reply.status(201).send(insumo)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateInsumoDto }>(
    '/insumos/:id',
    { preHandler: [requirePermission('insumos', 'write', 'own')] },
    async (req, reply) => {
      const insumo = await repo.updateInsumo(req.params.id, req.user.institutionId, req.body)
      return reply.send(insumo)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/insumos/:id',
    { preHandler: [requirePermission('insumos', 'write', 'own')] },
    async (req, reply) => {
      await repo.deleteInsumo(req.params.id, req.user.institutionId)
      return reply.status(204).send()
    },
  )

  // POST /insumos/parallel-setup — apply same insumo template to all subjects in a parallel
  app.post<{
    Body: {
      parallelId: string
      academicYearId: string
      periodId: string
      insumos: Array<{ name: string; weight?: number; sortOrder: number }>
    }
  }>(
    '/insumos/parallel-setup',
    { preHandler: [requirePermission('insumos', 'write', 'own')] },
    async (req, reply) => {
      const { parallelId, academicYearId, periodId, insumos: template } = req.body
      const { institutionId, sub: userId } = req.user

      const assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, parallelId, academicYearId },
        select: { id: true },
      })
      if (assignments.length === 0) return reply.status(404).send({ message: 'No se encontraron asignaciones para este paralelo' })

      const period = await prisma.academicPeriod.findFirst({ where: { id: periodId } })
      if (!period) return reply.status(404).send({ message: 'Período no encontrado' })

      // Parametrización GENERAL (base): agrega/actualiza los insumos de la plantilla
      // en todas las materias del paralelo, SIN borrar los insumos propios que cada
      // profesor haya configurado en su materia (aditivo, no destructivo).
      for (const assignment of assignments) {
        const existing = await prisma.insumo.findMany({
          where: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: periodId },
          select: { id: true, name: true },
        })

        for (const tpl of template) {
          const match = existing.find((e) => e.name === tpl.name)
          if (match) {
            await prisma.insumo.update({
              where: { id: match.id },
              data: { weight: tpl.weight ?? null, sortOrder: tpl.sortOrder },
            })
          } else {
            await prisma.insumo.create({
              data: {
                institutionId,
                courseAssignmentId: assignment.id,
                academicPeriodId: periodId,
                name: tpl.name,
                weight: tpl.weight ?? null,
                sortOrder: tpl.sortOrder,
                createdBy: userId,
              },
            })
          }
        }
      }

      return reply.status(200).send({ message: 'Insumos aplicados correctamente', assignments: assignments.length })
    },
  )

  // GET /insumos/parallel-template?parallelId=X&academicYearId=Y&periodId=Z
  app.get<{ Querystring: { parallelId: string; academicYearId: string; periodId: string } }>(
    '/insumos/parallel-template',
    { preHandler: [requirePermission('insumos', 'read', 'own')] },
    async (req, reply) => {
      const { parallelId, academicYearId, periodId } = req.query
      const { institutionId } = req.user

      // Todas las materias del paralelo (no solo la primera): así la plantilla
      // refleja los insumos ya creados aunque se hayan agregado materias nuevas.
      const assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, parallelId, academicYearId },
        select: { id: true },
      })
      if (assignments.length === 0) return reply.send([])

      const insumos = await prisma.insumo.findMany({
        where: {
          institutionId,
          courseAssignmentId: { in: assignments.map((a) => a.id) },
          academicPeriodId: periodId,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        select: { name: true, weight: true, sortOrder: true },
      })

      // Unión por nombre (un insumo puede existir en varias materias del paralelo).
      const byName = new Map<string, { name: string; weight: number | null; sortOrder: number }>()
      for (const ins of insumos) {
        if (!byName.has(ins.name)) {
          byName.set(ins.name, {
            name: ins.name,
            weight: ins.weight != null ? Number(ins.weight) : null,
            sortOrder: ins.sortOrder,
          })
        }
      }
      const template = [...byName.values()].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      )
      return reply.send(template)
    },
  )

  // ─── Activities ────────────────────────────────────────────────────────────

  app.get<{ Querystring: ListActivitiesQueryDto }>(
    '/activities',
    { preHandler: [requirePermission('activities', 'read', 'own')] },
    async (req, reply) => {
      const activities = await repo.list(req.user.institutionId, req.query)
      return reply.send(activities)
    },
  )

  app.post<{ Body: CreateActivityDto }>(
    '/activities',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const activity = await repo.create(req.user.institutionId, req.body, req.user.sub)
      return reply.status(201).send(activity)
    },
  )

  app.get<{ Params: { id: string } }>(
    '/activities/:id',
    { preHandler: [requirePermission('activities', 'read', 'own')] },
    async (req, reply) => {
      const activity = await repo.getById(req.params.id, req.user.institutionId)
      return reply.send(activity)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateActivityDto }>(
    '/activities/:id',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const activity = await repo.update(req.params.id, req.user.institutionId, req.body)
      return reply.send(activity)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/activities/:id/publish',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const activity = await repo.publish(req.params.id, req.user.institutionId)
      return reply.send(activity)
    },
  )

  app.patch<{ Params: { id: string }; Body: { insumoId: string } }>(
    '/activities/:id/insumo',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      const activity = await repo.assignInsumo(
        req.params.id,
        req.user.institutionId,
        req.body.insumoId,
      )
      return reply.send(activity)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/activities/:id',
    { preHandler: [requirePermission('activities', 'write', 'own')] },
    async (req, reply) => {
      await repo.delete(req.params.id, req.user.institutionId)
      return reply.status(204).send()
    },
  )

  // ─── Grades ────────────────────────────────────────────────────────────────

  app.get<{ Querystring: { activityId: string } }>(
    '/grades',
    { preHandler: [requirePermission('grades', 'read', 'own')] },
    async (req, reply) => {
      const grades = await repo.getByActivity(req.query.activityId, req.user.institutionId)
      return reply.send(grades)
    },
  )

  app.put<{ Body: BulkGradeDto }>(
    '/grades/bulk',
    { preHandler: [requirePermission('grades', 'write', 'own')] },
    async (req, reply) => {
      const grades = await repo.bulkUpsert(req.user.institutionId, req.body, req.user.sub)
      return reply.send(grades)
    },
  )

  app.put<{ Body: BulkManualInsumoAverageDto }>(
    '/grades/manual-insumo-averages/bulk',
    { preHandler: [requirePermission('grades', 'write', 'own')] },
    async (req, reply) => {
      const result = await repo.bulkUpsertManualInsumoAverages(
        req.user.institutionId,
        req.body,
        req.user.sub,
        req.user.roles,
      )
      return reply.send(result)
    },
  )

  app.get<{
    Params: { studentId: string }
    Querystring: { courseAssignmentId?: string; periodId?: string }
  }>(
    '/grades/student/:studentId',
    { preHandler: [requirePermission('grades', 'read', 'own')] },
    async (req, reply) => {
      const grades = await repo.getStudentGrades(
        req.params.studentId,
        req.user.institutionId,
        req.query.courseAssignmentId,
        req.query.periodId,
      )
      return reply.send(grades)
    },
  )

  app.get<{ Querystring: { courseAssignmentId: string; periodId: string } }>(
    '/grades/summary',
    { preHandler: [requirePermission('grades', 'read', 'own')] },
    async (req, reply) => {
      const summary = await repo.getGradesSummary(
        req.user.institutionId,
        req.query.courseAssignmentId,
        req.query.periodId,
      )
      return reply.send(summary)
    },
  )
}
