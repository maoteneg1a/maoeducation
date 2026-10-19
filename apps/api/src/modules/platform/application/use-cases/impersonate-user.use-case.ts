import { IAuthUserRepository } from '../../../auth/domain/repositories/user.repository.interface'
import { TokenService } from '../../../../shared/infrastructure/services/token.service'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { buildAuthInstitution } from '../../../auth/application/services/auth-institution.mapper'
import { LoginResponseDto } from '../../../auth/application/dtos/auth.dto'

export const IMPERSONATION_TTL = '30m'

export class ImpersonateUserUseCase {
  constructor(
    private readonly userRepo: IAuthUserRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Token de suplantación: lleva `impersonatedBy`, dura 30 min y NO emite
   * refresh token — al vencer, la sesión suplantada termina sola.
   */
  async execute(targetUserId: string, platformAdminId: string): Promise<Omit<LoginResponseDto, 'refreshToken'>> {
    const user = await this.userRepo.getWithPermissions(targetUserId)
    if (!user || !user.isActive) throw new NotFoundError('Usuario no encontrado')

    const institution = await prisma.institution.findUnique({
      where: { id: user.institutionId },
      select: { id: true, name: true, settings: true },
    })
    if (!institution) throw new NotFoundError('Usuario no encontrado')

    const accessToken = this.tokenService.signAccess({
      sub: user.id,
      institutionId: user.institutionId,
      roles: user.roles,
      permissions: user.permissions,
      impersonatedBy: platformAdminId,
    }, { expiresIn: IMPERSONATION_TTL })

    const tutoredParallels = await prisma.parallel.findMany({
      where: { tutorId: user.id },
      select: { id: true },
    })

    const fullName = user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : user.email

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        fullName,
        avatarUrl: user.profile?.avatarUrl ?? null,
        roles: user.roles,
        permissions: user.permissions,
        institutionId: user.institutionId,
        institution: buildAuthInstitution(institution),
        tutorParallelIds: tutoredParallels.map((p) => p.id),
      },
    }
  }
}
