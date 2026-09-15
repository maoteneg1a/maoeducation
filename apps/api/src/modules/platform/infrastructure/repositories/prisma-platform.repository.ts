import bcrypt from 'bcryptjs'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { IPlatformRepository, PlatformAdminRecord } from '../../domain/repositories/platform.repository.interface'
import {
  CreateInstitutionAdminInput,
  CreateInstitutionDto,
  InstitutionAdminDto,
  InstitutionListItemDto,
  UpdateInstitutionAdminDto,
} from '../../application/dtos/platform.dto'
import { bootstrapInstitution } from '../../application/services/institution-bootstrap'

function toAdminDto(u: {
  id: string
  email: string
  isActive: boolean
  lastLoginAt: Date | null
  profile: { firstName: string; lastName: string } | null
}): InstitutionAdminDto {
  return {
    id: u.id,
    email: u.email,
    firstName: u.profile?.firstName ?? '',
    lastName: u.profile?.lastName ?? '',
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt,
  }
}

const ADMIN_USER_SELECT = {
  id: true,
  email: true,
  isActive: true,
  lastLoginAt: true,
  profile: { select: { firstName: true, lastName: true } },
} as const

export class PrismaPlatformRepository implements IPlatformRepository {
  async findAdminByEmail(email: string): Promise<PlatformAdminRecord | null> {
    return prisma.platformAdmin.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true, isActive: true },
    })
  }

  async findAdminById(id: string): Promise<PlatformAdminRecord | null> {
    return prisma.platformAdmin.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, passwordHash: true, isActive: true },
    })
  }

  async updateAdminLastLogin(id: string): Promise<void> {
    await prisma.platformAdmin.update({ where: { id }, data: { lastLoginAt: new Date() } })
  }

  async institutionCodeExists(code: string): Promise<boolean> {
    const found = await prisma.institution.findUnique({ where: { code }, select: { id: true } })
    return found !== null
  }

  async createInstitution(dto: CreateInstitutionDto): Promise<{ institutionId: string; adminUserId: string }> {
    // bootstrapInstitution siembra centenares de filas (banco curricular, banco de
    // competencias, catálogos DUA/evaluación/inserción por institución) con creates
    // secuenciales — el timeout default de Prisma para transacciones interactivas
    // (5s) se queda corto contra la latencia real de red en producción y la
    // transacción se cierra a medias (P2028 "Transaction not found").
    return prisma.$transaction(
      (tx) => bootstrapInstitution(tx, { name: dto.name, code: dto.code }, dto.admin, dto.regime),
      { timeout: 60_000 },
    )
  }

  async listInstitutions(): Promise<InstitutionListItemDto[]> {
    const institutions = await prisma.institution.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        settings: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    })
    return institutions.map((i) => {
      const settings = (i.settings ?? {}) as { isTestInstitution?: boolean }
      return {
        id: i.id,
        name: i.name,
        code: i.code,
        isActive: i.isActive,
        settings: i.settings,
        userCount: i._count.users,
        createdAt: i.createdAt,
        isTestInstitution: settings.isTestInstitution ?? false,
      }
    })
  }

  async findInstitutionById(id: string): Promise<{ id: string; isActive: boolean } | null> {
    return prisma.institution.findUnique({ where: { id }, select: { id: true, isActive: true } })
  }

  async setInstitutionActive(id: string, isActive: boolean): Promise<InstitutionListItemDto> {
    const i = await prisma.institution.update({
      where: { id },
      data: { isActive },
      select: {
        id: true,
        name: true,
        code: true,
        isActive: true,
        settings: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    })
    const settings = (i.settings ?? {}) as { isTestInstitution?: boolean }
    return {
      id: i.id,
      name: i.name,
      code: i.code,
      isActive: i.isActive,
      userCount: i._count.users,
      createdAt: i.createdAt,
      isTestInstitution: settings.isTestInstitution ?? false,
    }
  }

  async listInstitutionAdmins(institutionId: string): Promise<InstitutionAdminDto[]> {
    const users = await prisma.user.findMany({
      where: {
        institutionId,
        userRoles: { some: { role: { name: 'admin' } } },
      },
      orderBy: { createdAt: 'asc' },
      select: ADMIN_USER_SELECT,
    })
    return users.map(toAdminDto)
  }

  async emailExistsInInstitution(
    institutionId: string,
    email: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    const found = await prisma.user.findFirst({
      where: {
        institutionId,
        email,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    })
    return found !== null
  }

  async createInstitutionAdmin(
    institutionId: string,
    dto: CreateInstitutionAdminInput,
  ): Promise<InstitutionAdminDto> {
    const adminRole = await prisma.role.findUnique({
      where: { institutionId_name: { institutionId, name: 'admin' } },
      select: { id: true },
    })
    if (!adminRole) throw new NotFoundError('Rol admin no encontrado en la institución')

    const passwordHash = await bcrypt.hash(dto.password, 12)
    const user = await prisma.user.create({
      data: {
        institutionId,
        email: dto.email,
        passwordHash,
        profile: { create: { firstName: dto.firstName, lastName: dto.lastName } },
        userRoles: { create: { roleId: adminRole.id } },
      },
      select: ADMIN_USER_SELECT,
    })
    return toAdminDto(user)
  }

  async findInstitutionAdmin(institutionId: string, userId: string): Promise<InstitutionAdminDto | null> {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        institutionId,
        userRoles: { some: { role: { name: 'admin' } } },
      },
      select: ADMIN_USER_SELECT,
    })
    return user ? toAdminDto(user) : null
  }

  async updateInstitutionAdmin(userId: string, dto: UpdateInstitutionAdminDto): Promise<InstitutionAdminDto> {
    const passwordHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined
    const profileUpdate =
      dto.firstName !== undefined || dto.lastName !== undefined
        ? {
            update: {
              ...(dto.firstName !== undefined ? { firstName: dto.firstName } : {}),
              ...(dto.lastName !== undefined ? { lastName: dto.lastName } : {}),
            },
          }
        : undefined

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.email !== undefined ? { email: dto.email } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        ...(profileUpdate ? { profile: profileUpdate } : {}),
      },
      select: ADMIN_USER_SELECT,
    })
    return toAdminDto(user)
  }
}
