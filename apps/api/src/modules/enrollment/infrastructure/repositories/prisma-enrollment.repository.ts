import bcrypt from 'bcryptjs'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateEnrollmentDto,
  BulkEnrollmentDto,
  UpdateEnrollmentStatusDto,
  UpdateEnrollmentAdaptationDto,
  CreateStudentEnrollmentDto,
  BulkCreateStudentsDto,
} from '../../application/dtos/enrollment.dto'

const LIST_INCLUDE = {
  student: {
    select: {
      id: true,
      profile: {
        select: {
          firstName: true,
          lastName: true,
          dni: true,
          birthDate: true,
          phone: true,
        },
      },
    },
  },
  parallel: { include: { level: true } },
  academicYear: { select: { id: true, name: true, isActive: true } },
} as const

const LIST_ORDER = [
  { student: { profile: { lastName: 'asc' } } },
  { student: { profile: { firstName: 'asc' } } },
] as const

export class PrismaEnrollmentRepository {
  async list(institutionId: string, parallelId?: string, yearId?: string) {
    return prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        ...(parallelId && { parallelId }),
        ...(yearId && { academicYearId: yearId }),
      },
      include: LIST_INCLUDE,
      orderBy: LIST_ORDER as any,
    })
  }

  /** Matrículas restringidas a un conjunto de paralelos (alcance del docente). */
  async listForTeacher(institutionId: string, parallelIds: string[], yearId?: string) {
    return prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        parallelId: { in: parallelIds },
        ...(yearId && { academicYearId: yearId }),
      },
      include: LIST_INCLUDE,
      orderBy: LIST_ORDER as any,
    })
  }

  /** Buscador de estudiantes (rol student) para el selector de matrícula. */
  async searchStudents(institutionId: string, search?: string, parallelIds?: string[]) {
    const term = search?.trim()
    const users = await prisma.user.findMany({
      where: {
        institutionId,
        userRoles: { some: { role: { name: 'student' } } },
        // Scope para docentes: solo estudiantes matriculados en sus paralelos
        ...(parallelIds && {
          studentEnrollments: { some: { parallelId: { in: parallelIds } } },
        }),
        ...(term && {
          OR: [
            { profile: { firstName: { contains: term, mode: 'insensitive' } } },
            { profile: { lastName: { contains: term, mode: 'insensitive' } } },
            { profile: { dni: { contains: term, mode: 'insensitive' } } },
          ],
        }),
      },
      select: { id: true, email: true, profile: { select: { firstName: true, lastName: true, dni: true } } },
      orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }],
      take: 500,
    })
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: `${u.profile?.firstName ?? ''} ${u.profile?.lastName ?? ''}`.trim(),
      dni: u.profile?.dni ?? null,
    }))
  }

  /**
   * Crea un estudiante nuevo (rol student) y lo matricula en una sola
   * transacción. Email y contraseña se autogeneran (el admin puede resetear
   * la contraseña luego). La cédula debe ser única en la institución.
   */
  async createStudentAndEnroll(institutionId: string, dto: CreateStudentEnrollmentDto) {
    const [parallel, year] = await Promise.all([
      prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
    ])
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    if (!year) throw new NotFoundError('Año académico no encontrado')

    // Cédula única dentro de la institución.
    const dniTaken = await prisma.profile.findFirst({
      where: { dni: dto.dni, user: { institutionId } },
      select: { id: true },
    })
    if (dniTaken) throw new ConflictError('Ya existe un estudiante con esa cédula')

    const studentRole = await prisma.role.findFirst({
      where: { institutionId, name: 'student' },
      select: { id: true },
    })
    if (!studentRole) throw new NotFoundError('Rol de estudiante no configurado')

    // El alumno se identifica por su cédula (sin correo). La cédula se guarda
    // como identificador de inicio de sesión y como contraseña por defecto.
    const email = dto.dni
    const emailTaken = await prisma.user.findUnique({
      where: { institutionId_email: { institutionId, email } },
      select: { id: true },
    })
    if (emailTaken) throw new ConflictError('Ya existe un estudiante con esa cédula')
    // Contraseña por defecto = cédula.
    const passwordHash = await bcrypt.hash(dto.dni, 12)

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          institutionId,
          email,
          passwordHash,
          profile: {
            create: {
              firstName: dto.firstName.trim(),
              lastName: dto.lastName.trim(),
              dni: dto.dni,
              birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            },
          },
          userRoles: { create: { roleId: studentRole.id } },
        },
      })

      return tx.studentEnrollment.create({
        data: {
          institutionId,
          studentId: user.id,
          parallelId: dto.parallelId,
          academicYearId: dto.academicYearId,
        },
        include: LIST_INCLUDE,
      })
    })
  }

  async create(institutionId: string, dto: CreateEnrollmentDto) {
    const existing = await prisma.studentEnrollment.findFirst({
      where: {
        institutionId,
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
      },
    })
    if (existing) {
      throw new ConflictError('El estudiante ya está matriculado en este año académico')
    }

    const [student, parallel, year] = await Promise.all([
      prisma.user.findFirst({ where: { id: dto.studentId, institutionId } }),
      prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
    ])

    if (!student) throw new NotFoundError('Estudiante no encontrado')
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    if (!year) throw new NotFoundError('Año académico no encontrado')

    return prisma.studentEnrollment.create({
      data: {
        institutionId,
        studentId: dto.studentId,
        parallelId: dto.parallelId,
        academicYearId: dto.academicYearId,
        status: 'active',
      },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
        parallel: { include: { level: true } },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
    })
  }

  async bulkCreate(institutionId: string, dto: BulkEnrollmentDto) {
    const [parallel, year] = await Promise.all([
      prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
    ])
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    if (!year) throw new NotFoundError('Año académico no encontrado')

    // Find already enrolled students for this year
    const alreadyEnrolled = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        academicYearId: dto.academicYearId,
        studentId: { in: dto.studentIds },
      },
      select: { studentId: true },
    })
    const enrolledSet = new Set(alreadyEnrolled.map((e) => e.studentId))
    const newStudentIds = dto.studentIds.filter((id) => !enrolledSet.has(id))

    if (newStudentIds.length === 0) {
      return { created: 0, skipped: dto.studentIds.length, enrollments: [] }
    }

    await prisma.studentEnrollment.createMany({
      data: newStudentIds.map((studentId) => ({
        institutionId,
        studentId,
        parallelId: dto.parallelId,
        academicYearId: dto.academicYearId,
        status: 'active',
      })),
    })

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        academicYearId: dto.academicYearId,
        studentId: { in: newStudentIds },
      },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })

    return {
      created: newStudentIds.length,
      skipped: enrolledSet.size,
      enrollments,
    }
  }

  async bulkCreateStudents(institutionId: string, dto: BulkCreateStudentsDto) {
    const [parallel, year] = await Promise.all([
      prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
      prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
    ])
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const studentRole = await prisma.role.findFirst({
      where: { institutionId, name: 'student' },
      select: { id: true },
    })
    if (!studentRole) throw new NotFoundError('Rol de estudiante no configurado')

    const results: Array<{ firstName: string; lastName: string; dni: string; status: 'created' | 'skipped'; reason?: string }> = []

    for (const s of dto.students) {
      const dni = s.dni?.trim()
      const firstName = s.firstName?.trim()
      const lastName = s.lastName?.trim()

      if (!firstName || !lastName) {
        results.push({ firstName: firstName ?? '', lastName: lastName ?? '', dni: dni ?? '', status: 'skipped', reason: 'Nombre incompleto' })
        continue
      }

      // Skip duplicate DNI within institution
      const existing = await prisma.profile.findFirst({
        where: { dni, user: { institutionId } },
        select: { id: true },
      })
      if (existing) {
        results.push({ firstName, lastName, dni, status: 'skipped', reason: 'Cédula ya registrada' })
        continue
      }

      try {
        const email = dni || `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${Date.now()}`
        const passwordHash = await bcrypt.hash(dni || email, 12)

        await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              institutionId,
              email,
              passwordHash,
              profile: {
                create: {
                  firstName,
                  lastName,
                  dni: dni || undefined,
                  birthDate: s.birthDate ? new Date(s.birthDate) : undefined,
                },
              },
            },
          })
          await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } })
          await tx.studentEnrollment.create({
            data: {
              institutionId,
              studentId: user.id,
              parallelId: dto.parallelId,
              academicYearId: dto.academicYearId,
              status: 'active',
            },
          })
        })
        results.push({ firstName, lastName, dni, status: 'created' })
      } catch {
        results.push({ firstName, lastName, dni, status: 'skipped', reason: 'Error al crear' })
      }
    }

    return {
      created: results.filter((r) => r.status === 'created').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    }
  }

  async findById(id: string, institutionId: string) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { id, institutionId },
      select: { id: true, parallelId: true },
    })
    if (!enrollment) throw new NotFoundError('Matrícula no encontrada')
    return enrollment
  }

  async updateStatus(id: string, institutionId: string, dto: UpdateEnrollmentStatusDto) {
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { id, institutionId } })
    if (!enrollment) throw new NotFoundError('Matrícula no encontrada')

    return prisma.studentEnrollment.update({
      where: { id },
      data: { status: dto.status },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
        parallel: { include: { level: true } },
        academicYear: { select: { id: true, name: true, isActive: true } },
      },
    })
  }

  async updateAdaptation(id: string, institutionId: string, dto: UpdateEnrollmentAdaptationDto) {
    const enrollment = await prisma.studentEnrollment.findFirst({ where: { id, institutionId } })
    if (!enrollment) throw new NotFoundError('Matrícula no encontrada')

    return prisma.studentEnrollment.update({
      where: { id },
      data: {
        hasAdaptation: dto.hasAdaptation,
        adaptationType: dto.hasAdaptation ? dto.adaptationType ?? null : null,
        adaptationNotes: dto.hasAdaptation ? dto.adaptationNotes ?? null : null,
      },
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })
  }
}
