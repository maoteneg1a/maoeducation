import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import type { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from '../../application/dtos/task.dto'

const taskInclude = {
  courseAssignment: {
    select: {
      id: true,
      subject: { select: { id: true, name: true } },
      parallel: { select: { id: true, name: true, level: { select: { name: true } } } },
      academicYear: { select: { id: true, name: true } },
      teacher: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  },
  creator: {
    select: { id: true, profile: { select: { firstName: true, lastName: true } } },
  },
  activity: { select: { id: true, isPublished: true, academicPeriodId: true } },
  attachments: {
    orderBy: { createdAt: 'asc' as const },
    select: {
      id: true,
      fileName: true,
      storedName: true,
      mimeType: true,
      fileSize: true,
      createdAt: true,
      uploader: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    },
  },
}

export class PrismaTaskRepository {
  // Teacher: list tasks for their course assignment(s)
  async listForTeacher(institutionId: string, teacherId: string, query: ListTasksQueryDto) {
    return prisma.task.findMany({
      where: {
        institutionId,
        ...(query.courseAssignmentId
          ? { courseAssignmentId: query.courseAssignmentId }
          : {
              courseAssignment: {
                teacherId,
                ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
              },
            }),
        ...(query.from || query.to
          ? {
              dueDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { dueDate: 'asc' },
      include: taskInclude,
    })
  }

  // Student/Guardian: list published tasks for their enrolled courses
  async listForStudent(institutionId: string, studentId: string, query: ListTasksQueryDto) {
    // Find the student's enrollments to get their parallels
    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        studentId,
        ...(query.academicYearId ? { academicYearId: query.academicYearId } : {}),
      },
      select: { parallelId: true, academicYearId: true },
    })

    if (enrollments.length === 0) return []

    return prisma.task.findMany({
      where: {
        institutionId,
        isPublished: true,
        publishAt: { lte: new Date() },
        courseAssignment: {
          OR: enrollments.map((e) => ({
            parallelId: e.parallelId,
            academicYearId: e.academicYearId,
          })),
          ...(query.courseAssignmentId ? { id: query.courseAssignmentId } : {}),
        },
        ...(query.from || query.to
          ? {
              dueDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { dueDate: 'asc' },
      include: taskInclude,
    })
  }

  // Admin/Inspector: list all tasks
  async listAll(institutionId: string, query: ListTasksQueryDto) {
    return prisma.task.findMany({
      where: {
        institutionId,
        ...(query.courseAssignmentId ? { courseAssignmentId: query.courseAssignmentId } : {}),
        ...(query.academicYearId
          ? { courseAssignment: { academicYearId: query.academicYearId } }
          : {}),
        ...(query.from || query.to
          ? {
              dueDate: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { dueDate: 'asc' },
      include: taskInclude,
    })
  }

  async getById(id: string, institutionId: string) {
    const task = await prisma.task.findFirst({ where: { id, institutionId }, include: taskInclude })
    if (!task) throw new NotFoundError('Tarea no encontrada')
    return task
  }

  async create(institutionId: string, dto: CreateTaskDto, createdById: string) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')

    return prisma.task.create({
      data: {
        institutionId,
        courseAssignmentId: dto.courseAssignmentId,
        title: dto.title,
        description: dto.description,
        dueDate: new Date(dto.dueDate),
        publishAt: dto.publishAt ? new Date(dto.publishAt) : new Date(),
        isPublished: false,
        createdBy: createdById,
      },
      include: taskInclude,
    })
  }

  async update(id: string, institutionId: string, dto: UpdateTaskDto) {
    const task = await prisma.task.findFirst({ where: { id, institutionId } })
    if (!task) throw new NotFoundError('Tarea no encontrada')

    return prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dueDate !== undefined && { dueDate: new Date(dto.dueDate) }),
        ...(dto.publishAt !== undefined && { publishAt: new Date(dto.publishAt) }),
      },
      include: taskInclude,
    })
  }

  async publish(id: string, institutionId: string) {
    const task = await prisma.task.findFirst({ where: { id, institutionId } })
    if (!task) throw new NotFoundError('Tarea no encontrada')
    return prisma.task.update({ where: { id }, data: { isPublished: true }, include: taskInclude })
  }

  async delete(id: string, institutionId: string) {
    const task = await prisma.task.findFirst({ where: { id, institutionId } })
    if (!task) throw new NotFoundError('Tarea no encontrada')
    await prisma.task.delete({ where: { id } })
  }
}
