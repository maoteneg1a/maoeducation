import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import { BehaviorItemDto, SaveBehaviorDto } from '../../application/dtos/behavior.dto'

const institutionRepo = new PrismaInstitutionRepository()

export class PrismaBehaviorRepository {
  /** Lista estudiantes del paralelo (del año del periodo) con su comportamiento en ese periodo. */
  async listByParallelPeriod(
    institutionId: string,
    parallelId: string,
    periodId: string,
  ): Promise<BehaviorItemDto[]> {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: periodId, academicYear: { institutionId } },
      select: { academicYearId: true },
    })
    if (!period) throw new NotFoundError('Periodo no encontrado')

    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId: period.academicYearId, status: 'active' },
      include: { student: { include: { profile: { select: { firstName: true, lastName: true } } } } },
    })

    const grades = await prisma.behaviorGrade.findMany({
      where: { institutionId, academicPeriodId: periodId, studentId: { in: enrollments.map((e) => e.studentId) } },
    })
    const byStudent = new Map(grades.map((g) => [g.studentId, g]))

    return enrollments
      .map((e) => {
        const g = byStudent.get(e.studentId)
        const p = e.student.profile
        return {
          studentId: e.studentId,
          studentName: p ? `${p.lastName} ${p.firstName}` : e.student.email,
          code: g?.code ?? null,
          notes: g?.notes ?? null,
        }
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, 'es', { sensitivity: 'base' }))
  }

  async bulkSave(institutionId: string, dto: SaveBehaviorDto, recordedBy: string) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: dto.periodId, academicYear: { institutionId } },
      select: { id: true, isClosed: true },
    })
    if (!period) throw new NotFoundError('Periodo no encontrado')
    if (period.isClosed) throw new ConflictError('El período está cerrado: no se puede modificar el comportamiento')

    const config = await institutionRepo.getGradingConfig(institutionId)
    const validCodes = new Set(config.behaviorScale.map((b) => b.code))

    for (const item of dto.items) {
      const code = item.code?.trim()
      if (code && !validCodes.has(code)) {
        throw new BadRequestError(`Código de comportamiento inválido: "${code}"`)
      }
    }

    await prisma.$transaction(
      dto.items.map((item) => {
        const code = item.code?.trim()
        if (!code) {
          // sin código → borrar registro si existe
          return prisma.behaviorGrade.deleteMany({
            where: { institutionId, studentId: item.studentId, academicPeriodId: dto.periodId },
          })
        }
        return prisma.behaviorGrade.upsert({
          where: { studentId_academicPeriodId: { studentId: item.studentId, academicPeriodId: dto.periodId } },
          update: { code, notes: item.notes ?? null, recordedBy },
          create: {
            institutionId,
            studentId: item.studentId,
            academicPeriodId: dto.periodId,
            code,
            notes: item.notes ?? null,
            recordedBy,
          },
        })
      }),
    )

    return this.listByParallelPeriodForStudents(institutionId, dto.periodId, dto.items.map((i) => i.studentId))
  }

  private async listByParallelPeriodForStudents(institutionId: string, periodId: string, studentIds: string[]) {
    return prisma.behaviorGrade.findMany({
      where: { institutionId, academicPeriodId: periodId, studentId: { in: studentIds } },
    })
  }
}
