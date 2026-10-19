import bcrypt from 'bcryptjs'
import { IPlatformRepository } from '../../domain/repositories/platform.repository.interface'
import { TokenService } from '../../../../shared/infrastructure/services/token.service'
import { UnauthorizedError } from '../../../../shared/domain/errors/app.errors'
import { PlatformLoginDto, PlatformLoginResponseDto } from '../dtos/platform.dto'

export class PlatformLoginUseCase {
  constructor(
    private readonly repo: IPlatformRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(dto: PlatformLoginDto): Promise<PlatformLoginResponseDto> {
    const admin = await this.repo.findAdminByEmail(dto.email)
    if (!admin || !admin.isActive) {
      throw new UnauthorizedError('Credenciales inválidas')
    }

    const valid = await bcrypt.compare(dto.password, admin.passwordHash)
    if (!valid) {
      throw new UnauthorizedError('Credenciales inválidas')
    }

    const accessToken = this.tokenService.signPlatformAccess({ sub: admin.id, role: admin.role })
    const refreshToken = this.tokenService.signRefresh({ sub: admin.id })

    await this.repo.updateAdminLastLogin(admin.id)

    return {
      accessToken,
      refreshToken,
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    }
  }
}
