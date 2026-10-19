import type { FastifyRequest } from 'fastify'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { NotFoundError, ForbiddenError } from '../../../shared/domain/errors/app.errors'
import {
  assertCourseAssignmentAccess,
  isPrivilegedStaff,
} from '../../../shared/infrastructure/services/teacher-scope.service'

/** Scope `own` sobre una actividad: resuelve su asignación y valida acceso. */
export async function assertActivityAccess(req: FastifyRequest, activityId: string, mode: 'read' | 'write') {
  const activity = await prisma.activity.findFirst({
    where: { id: activityId, institutionId: req.user.institutionId },
    select: { courseAssignmentId: true },
  })
  if (!activity) throw new NotFoundError('Actividad no encontrada')
  await assertCourseAssignmentAccess(req, activity.courseAssignmentId, mode)
  return activity
}

/** Valida acceso de escritura a todas las actividades involucradas en un guardado masivo. */
export async function assertActivitiesWritable(req: FastifyRequest, activityIds: string[]) {
  const unique = [...new Set(activityIds)]
  if (unique.length === 0) return
  const activities = await prisma.activity.findMany({
    where: { id: { in: unique }, institutionId: req.user.institutionId },
    select: { courseAssignmentId: true },
  })
  if (activities.length !== unique.length) throw new NotFoundError('Actividad no encontrada')
  for (const caId of new Set(activities.map((a) => a.courseAssignmentId))) {
    await assertCourseAssignmentAccess(req, caId, 'write')
  }
}

export async function assertInsumoAccess(req: FastifyRequest, insumoId: string, mode: 'read' | 'write') {
  const insumo = await prisma.insumo.findFirst({
    where: { id: insumoId, institutionId: req.user.institutionId },
    select: { courseAssignmentId: true },
  })
  if (!insumo) throw new NotFoundError('Insumo no encontrado')
  await assertCourseAssignmentAccess(req, insumo.courseAssignmentId, mode)
  return insumo
}

/** Plantilla de insumos para todo un paralelo: solo staff privilegiado o el tutor del paralelo. */
export async function assertParallelInsumoAdmin(req: FastifyRequest, parallelId: string) {
  if (isPrivilegedStaff(req.user.roles)) return
  const parallel = await prisma.parallel.findFirst({
    where: { id: parallelId, institutionId: req.user.institutionId },
    select: { tutorId: true },
  })
  if (parallel?.tutorId === req.user.sub) return
  throw new ForbiddenError('Solo la administración o el tutor pueden configurar los insumos del paralelo')
}
