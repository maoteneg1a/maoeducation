import { IPlatformRepository } from '../../domain/repositories/platform.repository.interface'
import { TokenService } from '../../../../shared/infrastructure/services/token.service'
import { UnauthorizedError } from '../../../../shared/domain/errors/app.errors'

export class PlatformRefreshUseCase {
  constructor(
    private readonly repo: IPlatformRepository,
    private readonly tokenService: TokenService,
  ) {}

  async execute(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.tokenService.verifyRefresh(refreshToken)

    const admin = await this.repo.findAdminById(payload.sub)
    if (!admin || !admin.isActive) {
      throw new UnauthorizedError()
    }

    const accessToken = this.tokenService.signPlatformAccess({ sub: admin.id, role: admin.role })
    return { accessToken }
  }
}
