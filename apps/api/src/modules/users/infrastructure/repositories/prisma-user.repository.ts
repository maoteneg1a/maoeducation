import bcrypt from 'bcryptjs'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from '../../application/dtos/user.dto'
import { UserDetail, UserListItem } from '../../domain/entities/user.entity'
import { ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { assertValidDni, assertDniUnique } from '../../../../shared/infrastructure/services/dni.helper'
import type { ProfileFieldsDto } from '../../application/dtos/user.dto'

const EXTRA_FIELDS: (keyof ProfileFieldsDto)[] = [
  'phoneAlt', 'address', 'occupation', 'nationality', 'placeOfBirth',
  'bloodType', 'gender', 'emergencyContactName', 'emergencyContactPhone',
]

/** Mapea (solo definidos) los campos extra del perfil para un create. */
function extraCreate(dto: ProfileFieldsDto): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {}
  for (const f of EXTRA_FIELDS) if (dto[f] !== undefined) out[f] = dto[f]
  return out
}

/** Mapea (solo definidos) los campos extra del perfil para un update. */
function extraUpdate(dto: ProfileFieldsDto): Record<string, string | null> {
  const out: Record<string, string | null> = {}
  for (const f of EXTRA_FIELDS) if (dto[f] !== undefined) out[f] = dto[f] ?? null
  return out
}

function mapProfile(p: {
  firstName: string; lastName: string; dni: string | null; phone: string | null; birthDate: Date | null
  phoneAlt: string | null; address: string | null; occupation: string | null; nationality: string | null
  placeOfBirth: string | null; bloodType: string | null; gender: string | null
  emergencyContactName: string | null; emergencyContactPhone: string | null
}) {
  return {
    firstName: p.firstName, lastName: p.lastName, dni: p.dni, phone: p.phone, birthDate: p.birthDate,
    phoneAlt: p.phoneAlt, address: p.address, occupation: p.occupation, nationality: p.nationality,
    placeOfBirth: p.placeOfBirth, bloodType: p.bloodType, gender: p.gender,
    emergencyContactName: p.emergencyContactName, emergencyContactPhone: p.emergencyContactPhone,
  }
}

export class PrismaUserRepository {
  async list(
    institutionId: string,
    query: ListUsersQueryDto,
  ): Promise<{ data: UserListItem[]; total: number }> {
    const page  = query.page  ?? 1
    const limit = query.limit ?? 20
    const skip  = (page - 1) * limit

    const where = {
      institutionId,
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: 'insensitive' as const } },
              { profile: { firstName: { contains: query.search, mode: 'insensitive' as const } } },
              { profile: { lastName:  { contains: query.search, mode: 'insensitive' as const } } },
            ],
          }
        : {}),
      ...(query.role
        ? { userRoles: { some: { role: { name: query.role } } } }
        : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
        include: {
          profile: true,
          userRoles: { include: { role: true } },
        },
      }),
      prisma.user.count({ where }),
    ])

    return {
      data: users.map((u) => ({
        id: u.id,
        email: u.email,
        isActive: u.isActive,
        roles: u.userRoles.map((ur) => ur.role.name),
        firstName: u.profile?.firstName ?? '',
        lastName: u.profile?.lastName ?? '',
        dni: u.profile?.dni ?? null,
        phone: u.profile?.phone ?? null,
        fullName: u.profile ? `${u.profile.lastName} ${u.profile.firstName}` : u.email,
        avatarUrl: u.profile?.avatarUrl ?? null,
        createdAt: u.createdAt,
      })),
      total,
    }
  }

  async findById(id: string, institutionId: string): Promise<UserDetail | null> {
    const u = await prisma.user.findFirst({
      where: { id, institutionId },
      include: {
        profile: true,
        userRoles: { include: { role: true } },
      },
    })
    if (!u) return null

    return {
      id: u.id,
      email: u.email,
      isActive: u.isActive,
      institutionId: u.institutionId,
      roles: u.userRoles.map((ur) => ur.role.name),
      firstName: u.profile?.firstName ?? '',
      lastName: u.profile?.lastName ?? '',
      dni: u.profile?.dni ?? null,
      phone: u.profile?.phone ?? null,
      fullName: u.profile ? `${u.profile.lastName} ${u.profile.firstName}` : u.email,
      avatarUrl: u.profile?.avatarUrl ?? null,
      createdAt: u.createdAt,
      profile: u.profile ? mapProfile(u.profile) : null,
    }
  }

  async create(institutionId: string, dto: CreateUserDto): Promise<UserDetail> {
    const exists = await prisma.user.findUnique({
      where: { institutionId_email: { institutionId, email: dto.email } },
    })
    if (exists) throw new ConflictError('El email ya está registrado en esta institución')

    // Cédula obligatoria, 10 dígitos y única en la institución.
    const dni = assertValidDni(dto.dni)
    await assertDniUnique(institutionId, dni)

    const roles = await prisma.role.findMany({
      where: { institutionId, name: { in: dto.roleNames } },
    })

    // Contraseña por defecto = cédula (si no se especifica una).
    const password = dto.password?.trim() ? dto.password : dni
    const passwordHash = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        institutionId,
        email: dto.email,
        passwordHash,
        profile: {
          create: {
            firstName: dto.firstName,
            lastName:  dto.lastName,
            dni,
            phone:     dto.phone,
            birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
            ...extraCreate(dto),
          },
        },
        userRoles: {
          create: roles.map((r) => ({ roleId: r.id })),
        },
      },
      include: {
        profile: true,
        userRoles: { include: { role: true } },
      },
    })

    return {
      id: user.id,
      email: user.email,
      isActive: user.isActive,
      institutionId: user.institutionId,
      roles: user.userRoles.map((ur) => ur.role.name),
      firstName: user.profile!.firstName,
      lastName: user.profile!.lastName,
      dni: user.profile!.dni,
      phone: user.profile!.phone,
      fullName: `${user.profile!.lastName} ${user.profile!.firstName}`,
      avatarUrl: null,
      createdAt: user.createdAt,
      profile: mapProfile(user.profile!),
    }
  }

  async update(id: string, institutionId: string, dto: UpdateUserDto): Promise<UserDetail> {
    const user = await prisma.user.findFirst({ where: { id, institutionId } })
    if (!user) throw new NotFoundError('Usuario no encontrado')

    // Si cambia la cédula, validar formato y que no se duplique.
    if (dto.dni !== undefined) {
      const dni = assertValidDni(dto.dni)
      await assertDniUnique(institutionId, dni, id)
      dto.dni = dni
    }

    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined

    await prisma.user.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        ...(passwordHash ? { passwordHash } : {}),
        profile: {
          update: {
            ...(dto.firstName  !== undefined && { firstName: dto.firstName }),
            ...(dto.lastName   !== undefined && { lastName:  dto.lastName }),
            ...(dto.dni        !== undefined && { dni:       dto.dni }),
            ...(dto.phone      !== undefined && { phone:     dto.phone }),
            ...(dto.birthDate  !== undefined && { birthDate: dto.birthDate ? new Date(dto.birthDate) : null }),
            ...extraUpdate(dto),
          },
        },
      },
    })

    return (await this.findById(id, institutionId))!
  }

  async deactivate(id: string, institutionId: string): Promise<void> {
    const user = await prisma.user.findFirst({ where: { id, institutionId } })
    if (!user) throw new NotFoundError('Usuario no encontrado')
    await prisma.user.update({ where: { id }, data: { isActive: false } })
  }
}
