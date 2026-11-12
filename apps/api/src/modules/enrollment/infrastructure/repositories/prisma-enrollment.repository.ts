import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { normalizeStudentDocument, isValidStudentDocument, STUDENT_DOCUMENT_ERROR } from '../../../../shared/domain/student-document'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateEnrollmentDto,
  BulkEnrollmentDto,
  UpdateEnrollmentStatusDto,
  UpdateEnrollmentAdaptationDto,
  CreateStudentEnrollmentDto,
  BulkCreateStudentsDto,
  TransferEnrollmentsDto,
  EnrollmentTransferActor,
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
  async transfer(institutionId: string, dto: TransferEnrollmentsDto, actor: EnrollmentTransferActor) {
    const ids = [...new Set(dto.enrollmentIds)]
    if (!ids.length || ids.length > 500 || ids.length !== dto.enrollmentIds.length) {
      throw new BadRequestError('Selecciona entre 1 y 500 matrículas sin repetir')
    }
    if (dto.sourceParallelId === dto.targetParallelId) {
      throw new BadRequestError('Selecciona un paralelo de destino diferente al de origen')
    }

    // Serializable evita que dos cambios simultáneos excedan el cupo o muevan
    // la misma matrícula a destinos distintos. Ante conflicto se relee el estado.
    for (let attempt = 0; ; attempt++) {
      try {
        return await prisma.$transaction(async (tx) => {
          const [source, target] = await Promise.all([
            tx.parallel.findFirst({ where: { id: dto.sourceParallelId, institutionId } }),
            tx.parallel.findFirst({ where: { id: dto.targetParallelId, institutionId } }),
          ])
          if (!source || !target) throw new NotFoundError('Paralelo no encontrado')
          if (!target.isActive) throw new BadRequestError('El paralelo de destino está inactivo')
          if (source.academicYearId !== target.academicYearId || source.levelId !== target.levelId) {
            throw new BadRequestError('El destino debe ser del mismo grado y año lectivo')
          }
          if (source.educationOffer !== target.educationOffer) {
            throw new BadRequestError('El destino debe tener la misma oferta educativa')
          }
          const where = {
            institutionId, id: { in: ids }, parallelId: source.id,
            academicYearId: source.academicYearId, status: 'active',
          }
          const enrollments = await tx.studentEnrollment.findMany({
            where, select: { id: true, studentId: true },
          })
          if (enrollments.length !== ids.length) {
            throw new ConflictError('Alguna matrícula ya cambió o no está activa en el paralelo de origen. Actualiza la lista')
          }
          if (target.capacity !== null) {
            const occupied = await tx.studentEnrollment.count({
              where: { institutionId, parallelId: target.id, status: 'active' },
            })
            if (occupied + ids.length > target.capacity) {
              throw new ConflictError('El paralelo de destino no tiene cupos suficientes')
            }
          }
          // Solo cambia el paralelo: identidad, fecha, estado y NEE se conservan.
          // Las calificaciones y asistencias mantienen sus referencias originales.
          const result = await tx.studentEnrollment.updateMany({ where, data: { parallelId: target.id } })
          if (result.count !== ids.length) throw new ConflictError('Las matrículas cambiaron durante la operación. Actualiza la lista')
          await tx.auditLog.createMany({
            data: enrollments.map((enrollment) => ({
              institutionId, userId: actor.userId, impersonatorId: actor.impersonatorId ?? null,
              ipAddress: actor.ipAddress?.slice(0, 45) ?? null,
              userAgent: actor.userAgent?.slice(0, 500) ?? null,
              action: 'enrollment.parallel_transfer', resourceType: 'student_enrollment', resourceId: enrollment.id,
              oldValue: { parallelId: source.id, parallelName: source.name },
              newValue: {
                parallelId: target.id, parallelName: target.name,
                studentId: enrollment.studentId, academicYearId: source.academicYearId,
                reason: dto.reason?.trim() || 'Cambio de paralelo/jornada',
              },
            })),
          })
          return { transferred: result.count, sourceParallelId: source.id, targetParallelId: target.id }
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
          if (attempt < 2) continue
          throw new ConflictError('Otra operación está modificando estas matrículas. Actualiza la lista y vuelve a intentar')
        }
        throw error
      }
    }
  }

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
      fullName: `${u.profile?.lastName ?? ''} ${u.profile?.firstName ?? ''}`.trim(),
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
    const shouldEnroll = dto.enroll === true
    if (shouldEnroll) {
      const [parallel, year] = await Promise.all([
        prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } }),
        prisma.academicYear.findFirst({ where: { id: dto.academicYearId, institutionId } }),
      ])
      if (!parallel) throw new NotFoundError('Paralelo no encontrado')
      if (!year) throw new NotFoundError('Año académico no encontrado')
    }

    const studentRole = await prisma.role.findFirst({
      where: { institutionId, name: 'student' },
      select: { id: true },
    })
    if (!studentRole) throw new NotFoundError('Rol de estudiante no configurado')

    const results: Array<{
      firstName: string
      lastName: string
      dni: string
      status: 'created' | 'enrolled' | 'existing' | 'skipped'
      reason?: string
    }> = []
    const seenDnis = new Set<string>()

    for (const s of dto.students) {
      const dni = normalizeStudentDocument(s.dni ?? '')
      const firstName = s.firstName?.trim()
      const lastName = s.lastName?.trim()

      if (!firstName || !lastName || !isValidStudentDocument(dni)) {
        const reason = !firstName || !lastName
          ? 'Nombres y apellidos incompletos'
          : STUDENT_DOCUMENT_ERROR
        results.push({ firstName: firstName ?? '', lastName: lastName ?? '', dni: dni ?? '', status: 'skipped', reason })
        continue
      }
      if (seenDnis.has(dni!)) {
        results.push({ firstName, lastName, dni: dni!, status: 'skipped', reason: 'Cédula repetida en el archivo' })
        continue
      }
      seenDnis.add(dni!)

      const existing = await prisma.profile.findFirst({
        where: { dni, user: { institutionId } },
        select: {
          userId: true,
          user: { select: { userRoles: { select: { role: { select: { name: true } } } } } },
        },
      })
      if (existing) {
        const isStudent = existing.user.userRoles.some((ur) => ur.role.name === 'student')
        if (!isStudent) {
          results.push({ firstName, lastName, dni: dni!, status: 'skipped', reason: 'La cédula pertenece a otro tipo de usuario' })
          continue
        }
        if (!shouldEnroll) {
          results.push({ firstName, lastName, dni: dni!, status: 'existing', reason: 'Estudiante ya registrado' })
          continue
        }
        const alreadyEnrolled = await prisma.studentEnrollment.findFirst({
          where: { institutionId, studentId: existing.userId, academicYearId: dto.academicYearId! },
        })
        if (alreadyEnrolled) {
          results.push({ firstName, lastName, dni: dni!, status: 'existing', reason: 'Ya está matriculado en este año lectivo' })
          continue
        }
        await prisma.studentEnrollment.create({
          data: {
            institutionId,
            studentId: existing.userId,
            parallelId: dto.parallelId!,
            academicYearId: dto.academicYearId!,
            status: 'active',
          },
        })
        results.push({ firstName, lastName, dni: dni!, status: 'enrolled' })
        continue
      }

      try {
        const email = dni!
        const passwordHash = await bcrypt.hash(dni!, 12)

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
                  dni,
                  birthDate: s.birthDate ? new Date(s.birthDate) : undefined,
                },
              },
            },
          })
          await tx.userRole.create({ data: { userId: user.id, roleId: studentRole.id } })
          if (shouldEnroll) {
            await tx.studentEnrollment.create({
              data: {
                institutionId,
                studentId: user.id,
                parallelId: dto.parallelId!,
                academicYearId: dto.academicYearId!,
                status: 'active',
              },
            })
          }
        })
        results.push({ firstName, lastName, dni: dni!, status: 'created' })
      } catch {
        results.push({ firstName, lastName, dni, status: 'skipped', reason: 'Error al crear' })
      }
    }

    return {
      created: results.filter((r) => r.status === 'created').length,
      enrolled: results.filter((r) => r.status === 'enrolled').length + (shouldEnroll ? results.filter((r) => r.status === 'created').length : 0),
      existing: results.filter((r) => r.status === 'existing').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results,
    }
  }

  async findById(id: string, institutionId: string) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { id, institutionId },
      select: { id: true, parallelId: true, status: true },
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
