import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError } from '../../../../shared/domain/errors/app.errors'
import { hasPermission, type Actor } from '../../../../shared/infrastructure/services/actor'

export interface CreateOwnInsumosInput {
  periodId: string
  courseAssignmentIds: string[]
  names: string[]
}
const clean = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ')
const key = (value: string) => clean(value).toLocaleLowerCase('es')

/** Crea los insumos faltantes únicamente en asignaciones propias, sin modificar categorías existentes. */
export async function createOwnInsumos(institutionId: string, actor: Actor, dto: CreateOwnInsumosInput) {
  if (!hasPermission(actor, 'insumos', 'write', 'own')) throw new ForbiddenError()
  if (!dto || !Array.isArray(dto.courseAssignmentIds) || !Array.isArray(dto.names) || !dto.periodId
    || dto.courseAssignmentIds.length < 1 || dto.courseAssignmentIds.length > 200
    || dto.names.length < 1 || dto.names.length > 30
    || dto.names.some((name) => typeof name !== 'string' || !clean(name) || clean(name).length > 100)) {
    throw new BadRequestError('Selecciona las materias y al menos un insumo con nombre de hasta 100 caracteres')
  }
  const assignmentIds = [...new Set(dto.courseAssignmentIds)].sort()
  const names = [...new Map(dto.names.map((name) => [key(name), clean(name)])).values()]
  return prisma.$transaction(async (tx) => {
    const period = await tx.academicPeriod.findFirst({
      where: { id: dto.periodId, academicYear: { institutionId } },
      select: { academicYearId: true, isClosed: true },
    })
    if (!period || period.isClosed) throw new BadRequestError('Selecciona un período abierto de tu institución')
    const assignments = await tx.courseAssignment.findMany({
      where: { institutionId, id: { in: assignmentIds }, teacherId: actor.userId, academicYearId: period.academicYearId, isActive: true },
      select: { id: true },
    })
    if (assignments.length !== assignmentIds.length) {
      throw new ForbiddenError('Solo puedes crear insumos en tus propias materias del año seleccionado')
    }
    // Orden estable para serializar envíos simultáneos sin duplicar categorías.
    for (const id of assignmentIds) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`insumos:${institutionId}:${id}:${dto.periodId}`}))`
    }
    const existing = await tx.insumo.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: dto.periodId },
      select: { courseAssignmentId: true, name: true, sortOrder: true },
    })
    const additions = assignmentIds.flatMap((id) => {
      const rows = existing.filter((insumo) => insumo.courseAssignmentId === id)
      const present = new Set(rows.map((insumo) => key(insumo.name)))
      const start = rows.reduce((max, insumo) => Math.max(max, insumo.sortOrder), -1) + 1
      return names.filter((name) => !present.has(key(name))).map((name, index) => ({
        institutionId, courseAssignmentId: id, academicPeriodId: dto.periodId,
        name, sortOrder: start + index, createdBy: actor.userId,
      }))
    })
    if (additions.length) await tx.insumo.createMany({ data: additions })
    return { assignments: assignments.length, created: additions.length, skipped: assignmentIds.length * names.length - additions.length }
  }, { timeout: 60000 })
}
