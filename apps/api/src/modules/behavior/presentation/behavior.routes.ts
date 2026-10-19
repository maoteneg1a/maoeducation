import { FastifyInstance } from 'fastify'
import { PrismaBehaviorRepository } from '../infrastructure/repositories/prisma-behavior.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import type { SaveBehaviorDto } from '../application/dtos/behavior.dto'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { ForbiddenError, BadRequestError } from '../../../shared/domain/errors/app.errors'
import {
  assertParallelInScope,
  isPrivilegedStaff,
} from '../../../shared/infrastructure/services/teacher-scope.service'

/** El comportamiento lo registra el tutor del paralelo (o staff privilegiado). */
async function assertTutorOfStudents(
  institutionId: string,
  userId: string,
  roles: string[],
  dto: SaveBehaviorDto,
): Promise<void> {
  if (isPrivilegedStaff(roles)) return
  if (!Array.isArray(dto.items) || dto.items.length === 0) throw new BadRequestError('No hay registros para guardar')
  const period = await prisma.academicPeriod.findFirst({
    where: { id: dto.periodId, academicYear: { institutionId } },
    select: { academicYearId: true },
  })
  if (!period) throw new BadRequestError('Periodo no encontrado')
  const ids = [...new Set(dto.items.map((i) => i.studentId))]
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { institutionId, academicYearId: period.academicYearId, studentId: { in: ids }, status: 'active' },
    select: { studentId: true, parallel: { select: { tutorId: true } } },
  })
  if (enrollments.length !== ids.length || enrollments.some((e) => e.parallel.tutorId !== userId)) {
    throw new ForbiddenError('Solo el tutor del paralelo puede registrar el comportamiento')
  }
}

const repo = new PrismaBehaviorRepository()

export default async function behaviorRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Params: { parallelId: string }; Querystring: { periodId: string } }>(
    '/parallels/:parallelId/behavior',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => {
      if (!req.query.periodId) return reply.status(400).send({ message: 'periodId es requerido' })
      await assertParallelInScope(req, req.params.parallelId)
      return reply.send(
        await repo.listByParallelPeriod(req.user.institutionId, req.params.parallelId, req.query.periodId),
      )
    },
  )

  app.put<{ Body: SaveBehaviorDto }>(
    '/behavior',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => {
      await assertTutorOfStudents(req.user.institutionId, req.user.sub, req.user.roles, req.body)
      return reply.send(await repo.bulkSave(req.user.institutionId, req.body, req.user.sub))
    },
  )
}
