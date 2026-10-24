import { prisma } from '../../../../shared/infrastructure/database/prisma'
import type { ReportInstance } from '../../../../shared/domain/reports-flow'

export interface RecipientContext {
  institutionId: string
  studentId: string | null
  parallelId: string | null
}

/**
 * Resuelve los usuarios de una instancia configurable de la escuela.
 * Nunca hay usuarios fijos en el código: todo sale de `reportsFlow.instances`.
 */
export async function resolveInstanceUsers(instance: ReportInstance, ctx: RecipientContext): Promise<string[]> {
  const { institutionId } = ctx
  switch (instance.resolver) {
    case 'tutor_of_parallel': {
      if (!ctx.parallelId) return []
      const p = await prisma.parallel.findFirst({ where: { id: ctx.parallelId, institutionId }, select: { tutorId: true } })
      return p?.tutorId ? [p.tutorId] : []
    }
    case 'teachers_of_parallel': {
      if (!ctx.parallelId) return []
      const rows = await prisma.courseAssignment.findMany({
        where: { institutionId, parallelId: ctx.parallelId, isActive: true },
        select: { teacherId: true },
      })
      return [...new Set(rows.map((r) => r.teacherId))]
    }
    case 'role': {
      if (!instance.role) return []
      const rows = await prisma.userRole.findMany({
        where: { role: { institutionId, name: instance.role }, user: { isActive: true, institutionId } },
        select: { userId: true },
      })
      return [...new Set(rows.map((r) => r.userId))]
    }
    case 'users': {
      if (!instance.userIds?.length) return []
      const rows = await prisma.user.findMany({
        where: { institutionId, id: { in: instance.userIds }, isActive: true },
        select: { id: true },
      })
      return rows.map((r) => r.id)
    }
    case 'guardians_of_student': {
      if (!ctx.studentId) return []
      const rows = await prisma.guardianStudent.findMany({
        where: { studentId: ctx.studentId, guardian: { isActive: true, institutionId } },
        select: { guardianId: true },
      })
      return rows.map((r) => r.guardianId)
    }
    default:
      return []
  }
}
