import { FastifyInstance } from 'fastify'
import { PrismaEnrollmentRepository } from '../infrastructure/repositories/prisma-enrollment.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { BadRequestError } from '../../../shared/domain/errors/app.errors'
import {
  getTeacherParallelIds,
  isPrivilegedStaff,
  assertParallelInScope,
} from '../../../shared/infrastructure/services/teacher-scope.service'
import type {
  CreateEnrollmentDto,
  BulkEnrollmentDto,
  UpdateEnrollmentStatusDto,
  UpdateEnrollmentAdaptationDto,
  CreateStudentEnrollmentDto,
  BulkCreateStudentsDto,
} from '../application/dtos/enrollment.dto'

const repo = new PrismaEnrollmentRepository()

export default async function enrollmentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: { parallelId?: string; yearId?: string } }>(
    '/enrollments',
    { preHandler: [requirePermission('enrollment', 'read', 'own')] },
    async (req, reply) => {
      const { institutionId, sub, roles } = req.user

      // Staff privilegiado (admin/rector/dece/inspector) ve toda la institución.
      if (isPrivilegedStaff(roles)) {
        const enrollments = await repo.list(institutionId, req.query.parallelId, req.query.yearId)
        return reply.send(enrollments)
      }

      // Docente: solo matrículas de sus paralelos (donde dicta o es tutor).
      const allowed = await getTeacherParallelIds(institutionId, sub)
      if (allowed.length === 0) return reply.send([])

      // Si pide un paralelo concreto, debe estar dentro de su alcance.
      if (req.query.parallelId && !allowed.includes(req.query.parallelId)) {
        return reply.send([])
      }

      const enrollments = await repo.listForTeacher(
        institutionId,
        req.query.parallelId ? [req.query.parallelId] : allowed,
        req.query.yearId,
      )
      return reply.send(enrollments)
    },
  )

  // Buscador de estudiantes para el selector.
  // Docentes ven solo los de sus paralelos; staff privilegiado ve todos.
  app.get<{ Querystring: { search?: string } }>(
    '/enrollments/students',
    { preHandler: [requirePermission('enrollment', 'read', 'own')] },
    async (req, reply) => {
      const { sub, institutionId, roles } = req.user
      const parallelIds = isPrivilegedStaff(roles)
        ? undefined
        : await getTeacherParallelIds(institutionId, sub)
      const students = await repo.searchStudents(institutionId, req.query.search, parallelIds)
      return reply.send(students)
    },
  )

  app.post<{ Body: CreateEnrollmentDto }>(
    '/enrollments',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      await assertParallelInScope(req, req.body.parallelId)
      const enrollment = await repo.create(req.user.institutionId, req.body)
      return reply.status(201).send(enrollment)
    },
  )

  // Crear un estudiante nuevo y matricularlo (cuando no existe). Valida
  // nombres y cédula; el docente solo puede hacerlo en sus paralelos.
  app.post<{ Body: CreateStudentEnrollmentDto }>(
    '/enrollments/student',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      const { firstName, lastName, dni, parallelId } = req.body
      if (!firstName?.trim() || !lastName?.trim()) {
        throw new BadRequestError('Nombres y apellidos son obligatorios')
      }
      if (!/^\d{10}$/.test(dni ?? '')) {
        throw new BadRequestError('La cédula debe tener 10 dígitos')
      }
      await assertParallelInScope(req, parallelId)
      const enrollment = await repo.createStudentAndEnroll(req.user.institutionId, req.body)
      return reply.status(201).send(enrollment)
    },
  )

  app.post<{ Body: BulkEnrollmentDto }>(
    '/enrollments/bulk',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      await assertParallelInScope(req, req.body.parallelId)
      const result = await repo.bulkCreate(req.user.institutionId, req.body)
      return reply.status(201).send(result)
    },
  )

  app.post<{ Body: BulkCreateStudentsDto }>(
    '/enrollments/students/bulk',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      await assertParallelInScope(req, req.body.parallelId)
      const result = await repo.bulkCreateStudents(req.user.institutionId, req.body)
      return reply.status(201).send(result)
    },
  )

  app.patch<{ Params: { id: string }; Body: UpdateEnrollmentStatusDto }>(
    '/enrollments/:id/status',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      const current = await repo.findById(req.params.id, req.user.institutionId)
      await assertParallelInScope(req, current.parallelId)
      const enrollment = await repo.updateStatus(req.params.id, req.user.institutionId, req.body)
      return reply.send(enrollment)
    },
  )

  app.patch<{ Params: { id: string }; Body: UpdateEnrollmentAdaptationDto }>(
    '/enrollments/:id/adaptation',
    { preHandler: [requirePermission('enrollment', 'manage', 'own')] },
    async (req, reply) => {
      const current = await repo.findById(req.params.id, req.user.institutionId)
      await assertParallelInScope(req, current.parallelId)
      const enrollment = await repo.updateAdaptation(req.params.id, req.user.institutionId, req.body)
      return reply.send(enrollment)
    },
  )
}
