import bcrypt from 'bcryptjs'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { assertValidDni, assertDniUnique } from '../../../../shared/infrastructure/services/dni.helper'
import type {
  CreateGuardianDto,
  GuardianItemDto,
  UpdateGuardianLinkDto,
} from '../../application/dtos/guardian.dto'

export class PrismaGuardianRepository {
  async list(studentId: string, institutionId: string): Promise<GuardianItemDto[]> {
    await this.ensureStudent(studentId, institutionId)
    const links = await prisma.guardianStudent.findMany({
      where: { studentId },
      orderBy: [{ guardian: { profile: { lastName: 'asc' } } }, { guardian: { profile: { firstName: 'asc' } } }, { guardianId: 'asc' }],
      include: { guardian: { include: { profile: true } } },
    })
    return links.map((l) => ({
      guardianId: l.guardianId,
      email: l.guardian.email,
      fullName: l.guardian.profile
        ? `${l.guardian.profile.lastName} ${l.guardian.profile.firstName}`
        : l.guardian.email,
      relationship: l.relationship,
      isPrimary: l.isPrimary,
      isLegalRep: l.isLegalRep,
      livesWithStudent: l.livesWithStudent,
      isEmergencyContact: l.isEmergencyContact,
      profile: l.guardian.profile
        ? {
            dni: l.guardian.profile.dni,
            phone: l.guardian.profile.phone,
            phoneAlt: l.guardian.profile.phoneAlt,
            address: l.guardian.profile.address,
            occupation: l.guardian.profile.occupation,
          }
        : null,
    }))
  }

  async create(studentId: string, institutionId: string, dto: CreateGuardianDto): Promise<GuardianItemDto[]> {
    await this.ensureStudent(studentId, institutionId)

    const flags = {
      relationship: dto.relationship ?? 'guardian',
      isPrimary: dto.isPrimary ?? false,
      isLegalRep: dto.isLegalRep ?? false,
      livesWithStudent: dto.livesWithStudent ?? false,
      isEmergencyContact: dto.isEmergencyContact ?? false,
    }

    let guardianId = dto.existingGuardianId

    if (!guardianId) {
      // Crear nuevo usuario guardian
      if (!dto.email || !dto.firstName || !dto.lastName) {
        throw new BadRequestError('Faltan datos del representante (email, nombre y apellido)')
      }
      // Cédula obligatoria, 10 dígitos y única en la institución.
      const dni = assertValidDni(dto.dni)
      await assertDniUnique(institutionId, dni)
      const exists = await prisma.user.findUnique({
        where: { institutionId_email: { institutionId, email: dto.email } },
      })
      if (exists) throw new ConflictError('El email ya está registrado en esta institución')

      const role = await prisma.role.findUnique({
        where: { institutionId_name: { institutionId, name: 'guardian' } },
        select: { id: true },
      })
      if (!role) throw new NotFoundError('Rol guardian no encontrado')

      // Contraseña por defecto = cédula (si no se especifica una).
      const password = dto.password?.trim() ? dto.password : dni
      const passwordHash = await bcrypt.hash(password, 12)
      const guardian = await prisma.user.create({
        data: {
          institutionId,
          email: dto.email,
          passwordHash,
          profile: {
            create: {
              firstName: dto.firstName,
              lastName: dto.lastName,
              dni,
              phone: dto.phone,
              phoneAlt: dto.phoneAlt,
              address: dto.address,
              occupation: dto.occupation,
            },
          },
          userRoles: { create: { roleId: role.id } },
        },
        select: { id: true },
      })
      guardianId = guardian.id
    } else {
      const g = await prisma.user.findFirst({ where: { id: guardianId, institutionId } })
      if (!g) throw new NotFoundError('Representante no encontrado')
    }

    const already = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId, studentId } },
    })
    if (already) throw new ConflictError('Este representante ya está vinculado al estudiante')

    await prisma.guardianStudent.create({ data: { guardianId, studentId, ...flags } })
    return this.list(studentId, institutionId)
  }

  async updateLink(
    studentId: string,
    guardianId: string,
    institutionId: string,
    dto: UpdateGuardianLinkDto,
  ): Promise<GuardianItemDto[]> {
    await this.ensureStudent(studentId, institutionId)
    const link = await prisma.guardianStudent.findUnique({
      where: { guardianId_studentId: { guardianId, studentId } },
    })
    if (!link) throw new NotFoundError('Vínculo no encontrado')

    await prisma.guardianStudent.update({
      where: { guardianId_studentId: { guardianId, studentId } },
      data: {
        ...(dto.relationship !== undefined && { relationship: dto.relationship }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.isLegalRep !== undefined && { isLegalRep: dto.isLegalRep }),
        ...(dto.livesWithStudent !== undefined && { livesWithStudent: dto.livesWithStudent }),
        ...(dto.isEmergencyContact !== undefined && { isEmergencyContact: dto.isEmergencyContact }),
      },
    })
    return this.list(studentId, institutionId)
  }

  async unlink(studentId: string, guardianId: string, institutionId: string): Promise<void> {
    await this.ensureStudent(studentId, institutionId)
    await prisma.guardianStudent.delete({
      where: { guardianId_studentId: { guardianId, studentId } },
    })
  }

  private async ensureStudent(studentId: string, institutionId: string) {
    const s = await prisma.user.findFirst({ where: { id: studentId, institutionId } })
    if (!s) throw new NotFoundError('Estudiante no encontrado')
  }
}
