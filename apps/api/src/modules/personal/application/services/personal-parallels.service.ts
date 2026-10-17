import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'

const inUseMessage = 'Este paralelo tiene matrículas, asistencia, planificación u otros registros académicos. No se puede eliminar.'

/** Borra un paralelo personal y sus asignaciones vacías, conservando el catálogo de materias y grados. */
export async function deletePersonalParallel(institutionId: string, parallelId: string): Promise<void> {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  const settings = (institution?.settings ?? {}) as Record<string, unknown>
  if (settings.accountType !== 'personal') throw new ForbiddenError('Solo disponible para cuentas personales')

  try {
    await prisma.$transaction(async (tx) => {
      const parallel = await tx.parallel.findFirst({
        where: { id: parallelId, institutionId },
        select: {
          _count: { select: {
            enrollments: true,
            attendanceRecords: true,
            interdisciplinaryProjects: true,
            multigradeGroupMembers: true,
          } },
          courseAssignments: { select: {
            id: true,
            _count: { select: {
              activities: true,
              insumos: true,
              attendance: true,
              schedule: true,
              tasks: true,
              recoveries: true,
              pedagogicRecoveries: true,
              curriculumPlans: true,
              reinforcementPlans: true,
              interdisciplinaryContributions: true,
            } },
          } },
        },
      })
      if (!parallel) throw new NotFoundError('Paralelo no encontrado')
      if (parallel._count.multigradeGroupMembers > 0) {
        throw new ConflictError('Este paralelo forma parte de un aula multigrado. Quítalo del grupo en «Mis grados y materias» antes de eliminarlo.')
      }
      if (Object.values(parallel._count).some((count) => count > 0) ||
          parallel.courseAssignments.some((assignment) => Object.values(assignment._count).some((count) => count > 0))) {
        throw new ConflictError(inUseMessage)
      }

      // Las condiciones se vuelven a comprobar al borrar y todo se revierte si cambia el aula.
      const assignments = await tx.courseAssignment.deleteMany({ where: {
        institutionId, parallelId,
        activities: { none: {} }, insumos: { none: {} }, attendance: { none: {} },
        schedule: { none: {} }, tasks: { none: {} }, recoveries: { none: {} },
        pedagogicRecoveries: { none: {} }, curriculumPlans: { none: {} },
        reinforcementPlans: { none: {} }, interdisciplinaryContributions: { none: {} },
        multigradeGroupMember: { is: null },
      } })
      if (assignments.count !== parallel.courseAssignments.length) throw new ConflictError(inUseMessage)
      const removed = await tx.parallel.deleteMany({ where: {
        id: parallelId, institutionId,
        courseAssignments: { none: {} }, enrollments: { none: {} }, attendanceRecords: { none: {} },
        interdisciplinaryProjects: { none: {} }, multigradeGroupMembers: { none: {} },
      } })
      if (removed.count !== 1) throw new ConflictError(inUseMessage)
    }, { isolationLevel: 'Serializable' })
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error &&
        ['P2003', 'P2014', 'P2034'].includes(String(error.code))) {
      throw new ConflictError('El paralelo cambió mientras se eliminaba. Actualiza la lista e inténtalo de nuevo.')
    }
    throw error
  }
}
