import { FastifyInstance } from 'fastify'
import { PrismaScheduleRepository } from '../infrastructure/repositories/prisma-schedule.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'
import { ForbiddenError } from '../../../shared/domain/errors/app.errors'
import type {
  CreateScheduleEntryDto,
  UpdateScheduleEntryDto,
  GetScheduleQuery,
} from '../application/dtos/schedule.dto'

const repo = new PrismaScheduleRepository()

const scheduleManagers = new Set(['admin', 'rector', 'teacher'])

function assertCanManageSchedule(roles: string[]) {
  if (!roles.some((role) => scheduleManagers.has(role))) throw new ForbiddenError()
}

function teacherScope(userId: string, roles: string[]) {
  return roles.includes('teacher') && !roles.includes('admin') && !roles.includes('rector')
    ? userId
    : undefined
}

export default async function scheduleRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /schedules
  app.get<{ Querystring: GetScheduleQuery }>(
    '/schedules',
    async (req, reply) => {
      const { sub: userId, institutionId, roles } = req.user
      const canManage = roles.some((role) => scheduleManagers.has(role))
      const studentId = !canManage && roles.includes('guardian')
        ? await resolveGuardianStudentId(userId, req.query.studentId)
        : !canManage && roles.includes('student')
          ? userId
          : undefined
      const result = await repo.getSchedule(institutionId, req.query, studentId)
      return reply.status(200).send(result)
    },
  )

  // POST /schedules
  app.post<{ Body: CreateScheduleEntryDto }>(
    '/schedules',
    async (req, reply) => {
      assertCanManageSchedule(req.user.roles)
      const result = await repo.create(
        req.user.institutionId,
        req.body,
        teacherScope(req.user.sub, req.user.roles),
      )
      return reply.code(201).send(result)
    },
  )

  // PATCH /schedules/:id
  app.patch<{ Params: { id: string }; Body: UpdateScheduleEntryDto }>(
    '/schedules/:id',
    async (req, reply) => {
      assertCanManageSchedule(req.user.roles)
      const result = await repo.update(
        req.params.id,
        req.user.institutionId,
        req.body,
        teacherScope(req.user.sub, req.user.roles),
      )
      return reply.status(200).send(result)
    },
  )

  // DELETE /schedules/:id
  app.delete<{ Params: { id: string } }>(
    '/schedules/:id',
    async (req, reply) => {
      assertCanManageSchedule(req.user.roles)
      await repo.delete(
        req.params.id,
        req.user.institutionId,
        teacherScope(req.user.sub, req.user.roles),
      )
      return reply.code(204).send()
    },
  )
}
