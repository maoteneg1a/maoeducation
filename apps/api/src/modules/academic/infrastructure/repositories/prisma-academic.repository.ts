import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateLevelDto,
  UpdateLevelDto,
  CreateSubjectDto,
  UpdateSubjectDto,
  CreateAcademicYearDto,
  CreateAcademicPeriodDto,
  UpdateAcademicPeriodDto,
  CreateParallelDto,
  UpdateParallelDto,
  CreateCourseAssignmentDto,
} from '../../application/dtos/academic.dto'

export class PrismaAcademicRepository {
  // ─── Levels ───────────────────────────────────────────────────────────────

  async listLevels(institutionId: string) {
    return prisma.level.findMany({
      where: { institutionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async createLevel(institutionId: string, dto: CreateLevelDto) {
    const existing = await prisma.level.findFirst({
      where: { institutionId, name: dto.name },
    })
    if (existing) {
      throw new ConflictError(`Ya existe un nivel con el nombre "${dto.name}"`)
    }
    const code = dto.name.toUpperCase().replace(/\s+/g, '_').slice(0, 20)
    return prisma.level.create({
      data: {
        institutionId,
        name: dto.name,
        code,
        sortOrder: dto.order ?? 0,
        subnivel: dto.subnivel,
      },
    })
  }

  async updateLevel(id: string, institutionId: string, dto: UpdateLevelDto) {
    const level = await prisma.level.findFirst({ where: { id, institutionId } })
    if (!level) throw new NotFoundError('Nivel no encontrado')

    if (dto.name && dto.name !== level.name) {
      const conflict = await prisma.level.findFirst({
        where: { institutionId, name: dto.name, id: { not: id } },
      })
      if (conflict) throw new ConflictError(`Ya existe un nivel con el nombre "${dto.name}"`)
    }

    return prisma.level.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.order !== undefined && { sortOrder: dto.order }),
        ...(dto.attendanceMode !== undefined && { attendanceMode: dto.attendanceMode }),
        ...(dto.subnivel !== undefined && { subnivel: dto.subnivel }),
      },
    })
  }

  async toggleLevel(id: string, institutionId: string) {
    const level = await prisma.level.findFirst({ where: { id, institutionId } })
    if (!level) throw new NotFoundError('Nivel no encontrado')
    return prisma.level.update({
      where: { id },
      data: { isActive: !level.isActive },
    })
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────

  async listSubjects(institutionId: string) {
    return prisma.subject.findMany({
      where: { institutionId },
      orderBy: { name: 'asc' },
    })
  }

  async createSubject(institutionId: string, dto: CreateSubjectDto) {
    const existing = await prisma.subject.findFirst({
      where: { institutionId, name: dto.name },
    })
    if (existing) throw new ConflictError(`Ya existe una materia con el nombre "${dto.name}"`)

    if (dto.code) {
      const codeConflict = await prisma.subject.findFirst({
        where: { institutionId, code: dto.code },
      })
      if (codeConflict) throw new ConflictError(`Ya existe una materia con el código "${dto.code}"`)
    }

    return prisma.subject.create({
      data: {
        institutionId,
        name: dto.name,
        code: dto.code,
        description: dto.description,
        isQualitative: dto.isQualitative ?? false,
        curriculumAreaId: dto.curriculumAreaId,
        competencyAreaId: dto.competencyAreaId,
      },
    })
  }

  async updateSubject(id: string, institutionId: string, dto: UpdateSubjectDto) {
    const subject = await prisma.subject.findFirst({ where: { id, institutionId } })
    if (!subject) throw new NotFoundError('Materia no encontrada')

    if (dto.name && dto.name !== subject.name) {
      const conflict = await prisma.subject.findFirst({
        where: { institutionId, name: dto.name, id: { not: id } },
      })
      if (conflict) throw new ConflictError(`Ya existe una materia con el nombre "${dto.name}"`)
    }

    if (dto.code && dto.code !== subject.code) {
      const codeConflict = await prisma.subject.findFirst({
        where: { institutionId, code: dto.code, id: { not: id } },
      })
      if (codeConflict) throw new ConflictError(`Ya existe una materia con el código "${dto.code}"`)
    }

    return prisma.subject.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isQualitative !== undefined && { isQualitative: dto.isQualitative }),
        ...(dto.curriculumAreaId !== undefined && { curriculumAreaId: dto.curriculumAreaId }),
        ...(dto.competencyAreaId !== undefined && { competencyAreaId: dto.competencyAreaId }),
      },
    })
  }

  async toggleSubject(id: string, institutionId: string) {
    const subject = await prisma.subject.findFirst({ where: { id, institutionId } })
    if (!subject) throw new NotFoundError('Materia no encontrada')
    return prisma.subject.update({
      where: { id },
      data: { isActive: !subject.isActive },
    })
  }

  // ─── Academic Years ────────────────────────────────────────────────────────

  async listYears(institutionId: string) {
    return prisma.academicYear.findMany({
      where: { institutionId },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { academicPeriods: true, parallels: true } } },
    })
  }

  async createYear(institutionId: string, dto: CreateAcademicYearDto) {
    const existing = await prisma.academicYear.findFirst({
      where: { institutionId, name: dto.name },
    })
    if (existing) throw new ConflictError(`Ya existe un año académico con el nombre "${dto.name}"`)

    return prisma.academicYear.create({
      data: {
        institutionId,
        name: dto.name,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        isActive: false,
      },
    })
  }

  async getYear(id: string, institutionId: string) {
    const year = await prisma.academicYear.findFirst({
      where: { id, institutionId },
      include: {
        academicPeriods: { orderBy: { periodNumber: 'asc' } },
        _count: { select: { parallels: true } },
      },
    })
    if (!year) throw new NotFoundError('Año académico no encontrado')
    return year
  }

  async activateYear(id: string, institutionId: string) {
    const year = await prisma.academicYear.findFirst({ where: { id, institutionId } })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    return prisma.$transaction([
      prisma.academicYear.updateMany({
        where: { institutionId, isActive: true },
        data: { isActive: false },
      }),
      prisma.academicYear.update({
        where: { id },
        data: { isActive: true },
      }),
    ])
  }

  // ─── Academic Periods ──────────────────────────────────────────────────────

  async listPeriods(yearId: string, institutionId: string) {
    const year = await prisma.academicYear.findFirst({ where: { id: yearId, institutionId } })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    return prisma.academicPeriod.findMany({
      where: { academicYearId: yearId },
      orderBy: { periodNumber: 'asc' },
      include: { scheme: true },
    })
  }

  async createPeriod(yearId: string, institutionId: string, dto: CreateAcademicPeriodDto) {
    const year = await prisma.academicYear.findFirst({ where: { id: yearId, institutionId } })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const schemeId = dto.schemeId ?? (await this.getDefaultScheme(institutionId))?.id
    if (!schemeId) throw new BadRequestError('No se encontró un esquema de períodos. Especifica un schemeId.')

    return prisma.academicPeriod.create({
      data: {
        academicYearId: yearId,
        schemeId,
        name: dto.name,
        periodNumber: dto.order,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
      include: { scheme: true },
    })
  }

  async updatePeriod(periodId: string, institutionId: string, dto: UpdateAcademicPeriodDto) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: periodId, academicYear: { institutionId } },
    })
    if (!period) throw new NotFoundError('Período no encontrado')

    return prisma.academicPeriod.update({
      where: { id: periodId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.order !== undefined && { periodNumber: dto.order }),
        ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
        ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
      },
      include: { scheme: true },
    })
  }

  async activatePeriod(periodId: string, institutionId: string) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: periodId, academicYear: { institutionId } },
    })
    if (!period) throw new NotFoundError('Período no encontrado')

    const result = await prisma.$transaction([
      prisma.academicPeriod.updateMany({
        where: { academicYearId: period.academicYearId, isActive: true },
        data: { isActive: false },
      }),
      prisma.academicPeriod.update({
        where: { id: periodId },
        data: { isActive: true },
        include: { scheme: true },
      }),
    ])
    return result[1]
  }

  async getDefaultScheme(institutionId: string) {
    return prisma.academicPeriodScheme.findFirst({
      where: { institutionId, isDefault: true },
    })
  }

  /** Cierra o reabre un periodo. Al cerrar, bloquea la captura de notas/comportamiento. */
  async setPeriodClosed(periodId: string, institutionId: string, isClosed: boolean, userId: string) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: periodId, academicYear: { institutionId } },
      select: { id: true, isClosed: true },
    })
    if (!period) throw new NotFoundError('Período no encontrado')

    const updated = await prisma.academicPeriod.update({
      where: { id: periodId },
      data: { isClosed },
      include: { scheme: true },
    })

    await prisma.auditLog.create({
      data: {
        institutionId,
        userId,
        action: isClosed ? 'period.close' : 'period.reopen',
        resourceType: 'academic_period',
        resourceId: periodId,
        oldValue: { isClosed: period.isClosed },
        newValue: { isClosed },
      },
    })

    return updated
  }

  // ─── Parallels ─────────────────────────────────────────────────────────────

  private readonly parallelInclude = {
    level: true,
    academicYear: { select: { id: true, name: true, isActive: true } },
    tutor: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    _count: { select: { enrollments: true, courseAssignments: true } },
  } as const

  async listParallels(institutionId: string, yearId?: string) {
    return prisma.parallel.findMany({
      where: {
        institutionId,
        ...(yearId && { academicYearId: yearId }),
      },
      orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
      include: this.parallelInclude,
    })
  }

  async createParallel(institutionId: string, dto: CreateParallelDto) {
    const level = await prisma.level.findFirst({ where: { id: dto.levelId, institutionId } })
    if (!level) throw new NotFoundError('Nivel no encontrado')

    const year = await prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, institutionId },
    })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const existing = await prisma.parallel.findFirst({
      where: { institutionId, name: dto.name, levelId: dto.levelId, academicYearId: dto.academicYearId },
    })
    if (existing) throw new ConflictError('Ya existe un paralelo con ese nombre en ese nivel y año')

    return prisma.parallel.create({
      data: {
        institutionId,
        name: dto.name,
        levelId: dto.levelId,
        academicYearId: dto.academicYearId,
        capacity: dto.capacity,
        ...(dto.tutorId && { tutorId: dto.tutorId }),
      },
      include: this.parallelInclude,
    })
  }

  async updateParallel(id: string, institutionId: string, dto: UpdateParallelDto) {
    const parallel = await prisma.parallel.findFirst({ where: { id, institutionId } })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    if (dto.levelId) {
      const level = await prisma.level.findFirst({ where: { id: dto.levelId, institutionId } })
      if (!level) throw new NotFoundError('Nivel no encontrado')
    }

    return prisma.parallel.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.levelId !== undefined && { levelId: dto.levelId }),
        ...(dto.capacity !== undefined && { capacity: dto.capacity }),
        ...('tutorId' in dto && { tutorId: dto.tutorId ?? null }),
      },
      include: this.parallelInclude,
    })
  }

  // ─── Course Assignments ────────────────────────────────────────────────────

  async listAssignments(
    institutionId: string,
    filters: { parallelId?: string; yearId?: string; teacherId?: string } = {},
  ) {
    return prisma.courseAssignment.findMany({
      where: {
        institutionId,
        ...(filters.parallelId && { parallelId: filters.parallelId }),
        ...(filters.yearId && { academicYearId: filters.yearId }),
        ...(filters.teacherId && { teacherId: filters.teacherId }),
      },
      include: {
        parallel: { include: { level: true } },
        subject: true,
        teacher: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
      orderBy: [{ parallel: { name: 'asc' } }, { subject: { name: 'asc' } }],
    })
  }

  async createAssignment(institutionId: string, dto: CreateCourseAssignmentDto) {
    const [parallel, subject, teacher, year] = await Promise.all([
      prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
      prisma.subject.findFirst({ where: { id: dto.subjectId, institutionId } }),
      prisma.user.findFirst({ where: { id: dto.teacherId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
    ])

    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    if (!subject) throw new NotFoundError('Materia no encontrada')
    if (!teacher) throw new NotFoundError('Docente no encontrado')
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const existing = await prisma.courseAssignment.findFirst({
      where: {
        institutionId,
        parallelId: dto.parallelId,
        subjectId: dto.subjectId,
        academicYearId: dto.academicYearId,
      },
    })
    if (existing) {
      throw new ConflictError('Ya existe una asignación para esa materia en ese paralelo y año')
    }

    return prisma.courseAssignment.create({
      data: {
        institutionId,
        parallelId: dto.parallelId,
        subjectId: dto.subjectId,
        teacherId: dto.teacherId,
        academicYearId: dto.academicYearId,
      },
      include: {
        parallel: { include: { level: true } },
        subject: true,
        teacher: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
    })
  }

  async deleteAssignment(id: string, institutionId: string) {
    const assignment = await prisma.courseAssignment.findFirst({ where: { id, institutionId } })
    if (!assignment) throw new NotFoundError('Asignación no encontrada')
    await prisma.courseAssignment.delete({ where: { id } })
  }

  // ─── Period Schemes ────────────────────────────────────────────────────────

  async listSchemes(institutionId: string) {
    return prisma.academicPeriodScheme.findMany({
      where: { institutionId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
  }
}
