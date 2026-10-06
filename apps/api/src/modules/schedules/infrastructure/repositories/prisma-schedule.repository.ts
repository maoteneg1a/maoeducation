import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateScheduleEntryDto,
  UpdateScheduleEntryDto,
  GetScheduleQuery,
} from '../../application/dtos/schedule.dto'

export class PrismaScheduleRepository {
  async getSchedule(institutionId: string, query: GetScheduleQuery, studentId?: string) {
    return prisma.scheduleEntry.findMany({
      where: {
        institutionId,
        courseAssignment: {
          ...(studentId
            ? {
                parallel: {
                  enrollments: { some: { studentId, status: 'active' } },
                },
              }
            : {
                ...(query.parallelId && { parallelId: query.parallelId }),
                ...(query.teacherId && { teacherId: query.teacherId }),
                ...(query.yearId && { academicYearId: query.yearId }),
              }),
        },
      },
      include: {
        courseAssignment: {
          include: {
            subject: true,
            parallel: {
              include: { level: true },
            },
            teacher: {
              select: {
                id: true,
                profile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
            academicYear: {
              select: { id: true, name: true },
            },
          },
        },
      },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    })
  }

  async create(institutionId: string, dto: CreateScheduleEntryDto, teacherId?: string) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId, ...(teacherId && { teacherId }) },
    })
    if (!assignment) {
      throw new NotFoundError('Asignación de curso no encontrada')
    }

    const existing = await prisma.scheduleEntry.findFirst({
      where: {
        courseAssignmentId: dto.courseAssignmentId,
        weekday: dto.weekday,
        startTime: dto.startTime,
      },
    })
    if (existing) {
      throw new ConflictError('Ya existe una entrada de horario para ese día y hora')
    }

    return prisma.scheduleEntry.create({
      data: {
        institutionId,
        courseAssignmentId: dto.courseAssignmentId,
        weekday: dto.weekday,
        startTime: dto.startTime,
        endTime: dto.endTime,
        room: dto.room,
      },
      include: {
        courseAssignment: {
          include: {
            subject: true,
            parallel: {
              include: { level: true },
            },
            teacher: {
              select: {
                id: true,
                profile: {
                  select: { firstName: true, lastName: true },
                },
              },
            },
            academicYear: {
              select: { id: true, name: true },
            },
          },
        },
      },
    })
  }

  async update(id: string, institutionId: string, dto: UpdateScheduleEntryDto, teacherId?: string) {
    const entry = await prisma.scheduleEntry.findFirst({
      where: { id, institutionId, ...(teacherId && { courseAssignment: { teacherId } }) },
    })
    if (!entry) {
      throw new NotFoundError('Entrada de horario no encontrada')
    }

    return prisma.scheduleEntry.update({
      where: { id },
      data: { ...dto },
    })
  }

  async delete(id: string, institutionId: string, teacherId?: string) {
    const entry = await prisma.scheduleEntry.findFirst({
      where: { id, institutionId, ...(teacherId && { courseAssignment: { teacherId } }) },
    })
    if (!entry) {
      throw new NotFoundError('Entrada de horario no encontrada')
    }

    await prisma.scheduleEntry.delete({ where: { id } })
  }
}
