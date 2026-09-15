import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import type {
  CreateActivityTypeDto,
  UpdateActivityTypeDto,
  CreateInsumoDto,
  UpdateInsumoDto,
  CreateActivityDto,
  UpdateActivityDto,
  BulkGradeDto,
  ListActivitiesQueryDto,
} from '../../application/dtos/activity.dto'

export class PrismaActivityRepository {
  // ─── Activity Types ────────────────────────────────────────────────────────

  async listTypes(institutionId: string) {
    return prisma.activityType.findMany({
      where: { institutionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async createType(institutionId: string, dto: CreateActivityTypeDto) {
    const existing = await prisma.activityType.findFirst({
      where: { institutionId, name: dto.name },
    })
    if (existing) throw new ConflictError(`Ya existe un tipo de actividad con el nombre "${dto.name}"`)

    const code = dto.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 50)
    const codeConflict = await prisma.activityType.findFirst({
      where: { institutionId, code },
    })
    const finalCode = codeConflict ? `${code}_${Date.now()}` : code

    return prisma.activityType.create({
      data: {
        institutionId,
        name: dto.name,
        code: finalCode,
        description: dto.description,
      },
    })
  }

  async updateType(id: string, institutionId: string, dto: UpdateActivityTypeDto) {
    const type = await prisma.activityType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de actividad no encontrado')

    if (dto.name && dto.name !== type.name) {
      const conflict = await prisma.activityType.findFirst({
        where: { institutionId, name: dto.name, id: { not: id } },
      })
      if (conflict) throw new ConflictError(`Ya existe un tipo de actividad con el nombre "${dto.name}"`)
    }

    return prisma.activityType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    })
  }

  async toggleType(id: string, institutionId: string) {
    const type = await prisma.activityType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de actividad no encontrado')
    return prisma.activityType.update({
      where: { id },
      data: { isActive: !type.isActive },
    })
  }

  // ─── Insumos ───────────────────────────────────────────────────────────────

  async listInsumos(institutionId: string, courseAssignmentId: string, periodId: string) {
    return prisma.insumo.findMany({
      where: {
        institutionId,
        courseAssignmentId,
        academicPeriodId: periodId,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { activities: true } },
        creator: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
  }

  async createInsumo(institutionId: string, dto: CreateInsumoDto, createdById: string) {
    const [assignment, period] = await Promise.all([
      prisma.courseAssignment.findFirst({ where: { id: dto.courseAssignmentId, institutionId } }),
      prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } }),
    ])
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')
    if (!period) throw new NotFoundError('Período académico no encontrado')

    return prisma.insumo.create({
      data: {
        institutionId,
        name: dto.name,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        weight: dto.weight,
        sortOrder: dto.order ?? 0,
        createdBy: createdById,
      },
      include: { _count: { select: { activities: true } } },
    })
  }

  async updateInsumo(id: string, institutionId: string, dto: UpdateInsumoDto) {
    const insumo = await prisma.insumo.findFirst({ where: { id, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    return prisma.insumo.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.order !== undefined && { sortOrder: dto.order }),
      },
      include: { _count: { select: { activities: true } } },
    })
  }

  async deleteInsumo(id: string, institutionId: string) {
    const insumo = await prisma.insumo.findFirst({ where: { id, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    const activityCount = await prisma.activity.count({ where: { insumoId: id } })
    if (activityCount > 0) {
      throw new ConflictError('No se puede eliminar un insumo que tiene actividades asociadas')
    }

    await prisma.insumo.delete({ where: { id } })
  }

  // ─── Activities ────────────────────────────────────────────────────────────

  async list(institutionId: string, query: ListActivitiesQueryDto) {
    return prisma.activity.findMany({
      where: {
        institutionId,
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.periodId,
        ...(query.insumoId && { insumoId: query.insumoId }),
      },
      orderBy: [{ activityDate: 'asc' }, { name: 'asc' }],
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
        _count: { select: { grades: true } },
        creator: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
  }

  async create(institutionId: string, dto: CreateActivityDto, createdById: string) {
    const [assignment, period, activityType] = await Promise.all([
      prisma.courseAssignment.findFirst({ where: { id: dto.courseAssignmentId, institutionId } }),
      prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } }),
      prisma.activityType.findFirst({ where: { id: dto.activityTypeId, institutionId } }),
    ])

    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')
    if (!period) throw new NotFoundError('Período académico no encontrado')
    if (!activityType) throw new NotFoundError('Tipo de actividad no encontrado')

    if (dto.insumoId) {
      const insumo = await prisma.insumo.findFirst({ where: { id: dto.insumoId, institutionId } })
      if (!insumo) throw new NotFoundError('Insumo no encontrado')
    }

    if (dto.taskId) {
      const task = await prisma.task.findFirst({ where: { id: dto.taskId, institutionId } })
      if (!task) throw new NotFoundError('Tarea no encontrada')
      if (task.courseAssignmentId !== dto.courseAssignmentId) {
        throw new ConflictError('La tarea pertenece a otra asignación de curso')
      }
      const linked = await prisma.activity.findUnique({ where: { taskId: dto.taskId } })
      if (linked) throw new ConflictError('Esta tarea ya tiene una actividad calificable')
    }

    if (dto.curriculumSkillId) {
      await assertSkillsArePlanned(dto.courseAssignmentId, dto.academicPeriodId, [dto.curriculumSkillId])
    }

    return prisma.activity.create({
      data: {
        institutionId,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        activityTypeId: dto.activityTypeId,
        insumoId: dto.insumoId,
        taskId: dto.taskId,
        curriculumSkillId: dto.curriculumSkillId,
        name: dto.name,
        description: dto.description,
        maxScore: dto.maxScore,
        activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        isPublished: false,
        createdBy: createdById,
      },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
      },
    })
  }

  async getById(id: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({
      where: { id, institutionId },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        courseAssignment: {
          include: {
            subject: true,
            parallel: { include: { level: true } },
          },
        },
        academicPeriod: { select: { id: true, name: true } },
        _count: { select: { grades: true } },
      },
    })
    if (!activity) throw new NotFoundError('Actividad no encontrada')
    return activity
  }

  async update(id: string, institutionId: string, dto: UpdateActivityDto) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    if (dto.curriculumSkillId) {
      await assertSkillsArePlanned(activity.courseAssignmentId, activity.academicPeriodId, [dto.curriculumSkillId])
    }

    return prisma.activity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.maxScore !== undefined && { maxScore: dto.maxScore }),
        ...(dto.activityDate !== undefined && {
          activityDate: dto.activityDate ? new Date(dto.activityDate) : null,
        }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
        ...('insumoId' in dto && { insumoId: dto.insumoId ?? null }),
        ...('curriculumSkillId' in dto && { curriculumSkillId: dto.curriculumSkillId ?? null }),
      },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
      },
    })
  }

  async publish(id: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    return prisma.activity.update({
      where: { id },
      data: { isPublished: true },
    })
  }

  async assignInsumo(id: string, institutionId: string, insumoId: string) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    return prisma.activity.update({
      where: { id },
      data: { insumoId },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
      },
    })
  }

  async delete(id: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    // No permitir borrar una actividad que ya tiene NOTAS registradas.
    const gradedCount = await prisma.grade.count({
      where: { activityId: id, score: { not: null } },
    })
    if (gradedCount > 0) {
      throw new ConflictError(
        'No se puede eliminar una actividad que ya tiene notas registradas. Primero borra las notas.',
      )
    }

    // Solo quedan filas de nota vacías (sin valor): se limpian para respetar la FK
    // (nota → actividad es RESTRICT) y luego se elimina la actividad.
    await prisma.$transaction([
      prisma.grade.deleteMany({ where: { activityId: id } }),
      prisma.activity.delete({ where: { id } }),
    ])
  }

  // ─── Grades ────────────────────────────────────────────────────────────────

  async getByActivity(activityId: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, institutionId },
      include: {
        courseAssignment: {
          select: { parallelId: true, academicYearId: true },
        },
      },
    })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    const { parallelId, academicYearId } = activity.courseAssignment

    // Get all enrolled students in the parallel/year
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })

    // Get existing grades for this activity
    const grades = await prisma.grade.findMany({
      where: { activityId, institutionId },
    })
    const gradeMap = new Map(grades.map((g) => [g.studentId, g]))

    // Merge: every student gets a grade entry (or null)
    return enrollments.map((enrollment) => ({
      student: enrollment.student,
      enrollmentStatus: enrollment.status,
      grade: gradeMap.get(enrollment.studentId) ?? null,
    }))
  }

  async bulkUpsert(
    institutionId: string,
    dto: BulkGradeDto,
    gradedById: string,
  ) {
    // Bloquear la captura si la actividad pertenece a un periodo cerrado
    const activityIds = [...new Set(dto.grades.map((g) => g.activityId))]
    if (activityIds.length > 0) {
      const closed = await prisma.activity.findFirst({
        where: { id: { in: activityIds }, institutionId, academicPeriod: { isClosed: true } },
        select: { id: true },
      })
      if (closed) throw new ConflictError('El período está cerrado: no se pueden modificar las notas')
    }

    const results = await Promise.all(
      dto.grades.map((g) => {
        const status = g.status ?? 'entregado'
        // Regla de negocio del estado de entrega:
        //  - no_realizado → cuenta como 0 si no se ingresó otra nota
        //  - excusado     → se ignora en el promedio (score null + isExcused)
        let score = g.score
        let isExcused = false
        if (status === 'no_realizado') {
          score = g.score ?? 0
        } else if (status === 'excusado') {
          score = null
          isExcused = true
        }

        return prisma.grade.upsert({
          where: {
            activityId_studentId: {
              activityId: g.activityId,
              studentId: g.studentId,
            },
          },
          create: {
            institutionId,
            activityId: g.activityId,
            studentId: g.studentId,
            score,
            status,
            isExcused,
            notes: g.notes,
            gradedBy: gradedById,
          },
          update: {
            score,
            status,
            isExcused,
            notes: g.notes,
            gradedBy: gradedById,
          },
        })
      }),
    )
    return results
  }

  async getStudentGrades(
    studentId: string,
    institutionId: string,
    courseAssignmentId?: string,
    periodId?: string,
  ) {
    const grades = await prisma.grade.findMany({
      where: {
        institutionId,
        studentId,
        activity: {
          ...(courseAssignmentId && { courseAssignmentId }),
          ...(periodId && { academicPeriodId: periodId }),
        },
      },
      include: {
        activity: {
          include: {
            activityType: true,
            insumo: { select: { id: true, name: true, sortOrder: true } },
            academicPeriod: { select: { id: true, name: true } },
            courseAssignment: {
              include: {
                subject: true,
                parallel: { include: { level: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { activity: { insumo: { sortOrder: 'asc' } } },
        { activity: { activityDate: 'asc' } },
      ],
    })

    // Group by insumo
    const grouped = new Map<string, { insumo: object | null; activities: typeof grades }>()
    for (const grade of grades) {
      const key = grade.activity.insumoId ?? '__no_insumo__'
      if (!grouped.has(key)) {
        grouped.set(key, {
          insumo: grade.activity.insumo,
          activities: [],
        })
      }
      grouped.get(key)!.activities.push(grade)
    }

    return Array.from(grouped.values())
  }

  async getGradesSummary(institutionId: string, courseAssignmentId: string, periodId: string) {
    const insumos = await prisma.insumo.findMany({
      where: {
        institutionId,
        courseAssignmentId,
        academicPeriodId: periodId,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        activities: {
          where: { isPublished: true },
          orderBy: { activityDate: 'asc' },
          include: {
            activityType: true,
            grades: {
              where: { institutionId },
              select: { score: true, studentId: true },
            },
          },
        },
      },
    })

    return insumos.map((insumo) => ({
      id: insumo.id,
      name: insumo.name,
      weight: insumo.weight,
      sortOrder: insumo.sortOrder,
      activities: insumo.activities.map((activity) => {
        const scoredGrades = activity.grades.filter((g) => g.score !== null)
        const average =
          scoredGrades.length > 0
            ? scoredGrades.reduce((sum, g) => sum + (g.score ? Number(g.score) : 0), 0) / scoredGrades.length
            : null

        return {
          id: activity.id,
          name: activity.name,
          maxScore: activity.maxScore,
          activityDate: activity.activityDate,
          activityType: activity.activityType,
          gradeCount: activity.grades.length,
          scoredCount: scoredGrades.length,
          average,
        }
      }),
    }))
  }
}
