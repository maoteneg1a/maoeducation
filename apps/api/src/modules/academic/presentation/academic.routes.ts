import { FastifyInstance } from 'fastify'
import { PrismaAcademicRepository } from '../infrastructure/repositories/prisma-academic.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'
import type {
  CreateLevelDto,
  UpdateLevelDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateAcademicYearDto,
  CreateAcademicPeriodDto,
  UpdateAcademicPeriodDto,
  CreateParallelDto,
  UpdateParallelDto,
  CreateCourseAssignmentDto,
  ListQueryDto,
} from '../application/dtos/academic.dto'

const repo = new PrismaAcademicRepository()

export default async function academicRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── Levels ───────────────────────────────────────────────────────────────

  app.get(
    '/academic/levels',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const levels = await repo.listLevels(req.user.institutionId)
      return reply.send(levels)
    },
  )

  app.post<{ Body: CreateLevelDto }>(
    '/academic/levels',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const level = await repo.createLevel(req.user.institutionId, req.body)
      return reply.status(201).send(level)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateLevelDto }>(
    '/academic/levels/:id',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const level = await repo.updateLevel(req.params.id, req.user.institutionId, req.body)
      return reply.send(level)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/academic/levels/:id/toggle',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const level = await repo.toggleLevel(req.params.id, req.user.institutionId)
      return reply.send(level)
    },
  )

  // ─── Subjects ─────────────────────────────────────────────────────────────

  app.get(
    '/academic/subjects',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const subjects = await repo.listSubjects(req.user.institutionId)
      return reply.send(subjects)
    },
  )

  app.post<{ Body: CreateSubjectDto }>(
    '/academic/subjects',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const subject = await repo.createSubject(req.user.institutionId, req.body)
      return reply.status(201).send(subject)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateSubjectDto }>(
    '/academic/subjects/:id',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const subject = await repo.updateSubject(req.params.id, req.user.institutionId, req.body)
      return reply.send(subject)
    },
  )

  // ─── Academic Years ────────────────────────────────────────────────────────

  app.get<{ Querystring: ListQueryDto }>(
    '/academic/years',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const years = await repo.listYears(req.user.institutionId)
      return reply.send(years)
    },
  )

  app.post<{ Body: CreateAcademicYearDto }>(
    '/academic/years',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const year = await repo.createYear(req.user.institutionId, req.body)
      return reply.status(201).send(year)
    },
  )

  app.get<{ Params: { id: string } }>(
    '/academic/years/:id',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const year = await repo.getYear(req.params.id, req.user.institutionId)
      return reply.send(year)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/academic/years/:id/activate',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const result = await repo.activateYear(req.params.id, req.user.institutionId)
      return reply.send(result[1])
    },
  )

  // ─── Academic Periods ──────────────────────────────────────────────────────

  app.get<{ Params: { yearId: string } }>(
    '/academic/years/:yearId/periods',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const periods = await repo.listPeriods(req.params.yearId, req.user.institutionId)
      return reply.send(periods)
    },
  )

  app.post<{ Params: { yearId: string }; Body: CreateAcademicPeriodDto }>(
    '/academic/years/:yearId/periods',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const period = await repo.createPeriod(req.params.yearId, req.user.institutionId, req.body)
      return reply.status(201).send(period)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateAcademicPeriodDto }>(
    '/academic/periods/:id',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const period = await repo.updatePeriod(req.params.id, req.user.institutionId, req.body)
      return reply.send(period)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/academic/periods/:id/activate',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const period = await repo.activatePeriod(req.params.id, req.user.institutionId)
      return reply.send(period)
    },
  )

  app.patch<{ Params: { id: string }; Body: { isClosed: boolean } }>(
    '/academic/periods/:id/closure',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const period = await repo.setPeriodClosed(
        req.params.id,
        req.user.institutionId,
        req.body.isClosed,
        req.user.sub,
      )
      return reply.send(period)
    },
  )

  // ─── Parallels ─────────────────────────────────────────────────────────────

  app.get<{ Querystring: { yearId?: string } }>(
    '/academic/parallels',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const parallels = await repo.listParallels(req.user.institutionId, req.query.yearId)
      return reply.send(parallels)
    },
  )

  app.post<{ Body: CreateParallelDto }>(
    '/academic/parallels',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const parallel = await repo.createParallel(req.user.institutionId, req.body)
      return reply.status(201).send(parallel)
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateParallelDto }>(
    '/academic/parallels/:id',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const parallel = await repo.updateParallel(req.params.id, req.user.institutionId, req.body)
      return reply.send(parallel)
    },
  )

  // ─── Course Assignments ────────────────────────────────────────────────────

  app.get<{ Querystring: { parallelId?: string; yearId?: string; teacherId?: string } }>(
    '/academic/course-assignments',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const assignments = await repo.listAssignments(req.user.institutionId, req.query)
      return reply.send(assignments)
    },
  )

  // Student/guardian: get their own course assignments from enrollment
  app.get<{ Querystring: { academicYearId?: string; studentId?: string } }>(
    '/academic/my-course-assignments',
    async (req, reply) => {
      const { sub: userId, institutionId, roles } = req.user
      const studentId = roles.includes('guardian')
        ? await resolveGuardianStudentId(userId, req.query.studentId)
        : userId

      const years = await prisma.academicYear.findMany({
        where: { institutionId, isActive: true },
        select: { id: true },
        take: 1,
      })
      const yearId = req.query.academicYearId ?? years[0]?.id
      if (!yearId) return reply.send([])

      const enrollments = await prisma.studentEnrollment.findMany({
        where: { institutionId, studentId, academicYearId: yearId },
        select: { parallelId: true, academicYearId: true },
      })
      if (enrollments.length === 0) return reply.send([])

      const [assignments, periods] = await Promise.all([
        prisma.courseAssignment.findMany({
          where: {
            institutionId,
            academicYearId: yearId,
            parallelId: { in: enrollments.map((e) => e.parallelId) },
          },
          include: {
            subject: true,
            parallel: { include: { level: true } },
            academicYear: { select: { id: true, name: true } },
            teacher: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          },
          orderBy: { subject: { name: 'asc' } },
        }),
        prisma.academicPeriod.findMany({
          where: { academicYearId: yearId },
          orderBy: { startDate: 'asc' },
        }),
      ])
      return reply.send({ assignments, periods })
    },
  )

  app.post<{ Body: CreateCourseAssignmentDto }>(
    '/academic/course-assignments',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const assignment = await repo.createAssignment(req.user.institutionId, req.body)
      return reply.status(201).send(assignment)
    },
  )

  app.patch<{ Params: { id: string }; Body: { examWeight: number } }>(
    '/academic/course-assignments/:id/exam-weight',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const { examWeight } = req.body
      if (typeof examWeight !== 'number' || examWeight < 0 || examWeight > 100) {
        return reply.status(400).send({ message: 'examWeight debe ser un número entre 0 y 100' })
      }
      const updated = await prisma.courseAssignment.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
      })
      if (!updated) return reply.status(404).send({ message: 'Asignación no encontrada' })
      const result = await prisma.courseAssignment.update({
        where: { id: req.params.id },
        data: { examWeight },
        select: { id: true, examWeight: true },
      })
      return reply.send(result)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/academic/course-assignments/:id',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      await repo.deleteAssignment(req.params.id, req.user.institutionId)
      return reply.status(204).send()
    },
  )

  app.get<{ Params: { id: string } }>(
    '/academic/course-assignments/:id/workload',
    { preHandler: [requirePermission('planning', 'read', 'own')] },
    async (req, reply) => reply.send(await repo.getAssignmentWorkload(req.params.id, req.user.institutionId)),
  )

  app.patch<{ Params: { id: string }; Body: { weeklyPeriodsOverride: number | null } }>(
    '/academic/course-assignments/:id/weekly-periods-override',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const { weeklyPeriodsOverride } = req.body
      if (weeklyPeriodsOverride !== null && (typeof weeklyPeriodsOverride !== 'number' || weeklyPeriodsOverride < 1 || weeklyPeriodsOverride > 40)) {
        return reply.status(400).send({ message: 'weeklyPeriodsOverride debe ser un número entre 1 y 40, o null' })
      }
      return reply.send(await repo.updateAssignmentWeeklyPeriodsOverride(req.params.id, req.user.institutionId, weeklyPeriodsOverride))
    },
  )

  // ─── Period Schemes ────────────────────────────────────────────────────────

  app.get(
    '/academic/period-schemes',
    { preHandler: [requirePermission('academic_config', 'read')] },
    async (req, reply) => {
      const schemes = await repo.listSchemes(req.user.institutionId)
      return reply.send(schemes)
    },
  )
}
