import { IPlatformRepository } from '../../domain/repositories/platform.repository.interface'
import { ConflictError } from '../../../../shared/domain/errors/app.errors'
import { CreateInstitutionDto, InstitutionListItemDto } from '../dtos/platform.dto'

export class CreateInstitutionUseCase {
  constructor(private readonly repo: IPlatformRepository) {}

  async execute(dto: CreateInstitutionDto): Promise<InstitutionListItemDto> {
    const code = dto.code.trim().toUpperCase()

    if (await this.repo.institutionCodeExists(code)) {
      throw new ConflictError(`Ya existe una institución con el código "${code}"`)
    }

    const { institutionId } = await this.repo.createInstitution({
      ...dto,
      code,
      admin: { ...dto.admin, email: dto.admin.email.trim().toLowerCase() },
    })

    const institutions = await this.repo.listInstitutions()
    const created = institutions.find((i) => i.id === institutionId)
    // El listado lo trae siempre (acabamos de crearlo); fallback defensivo.
    return (
      created ?? {
        id: institutionId,
        name: dto.name,
        code,
        isActive: true,
        userCount: 1,
        createdAt: new Date(),
        isTestInstitution: true,
      }
    )
  }
}
