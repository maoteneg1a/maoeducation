import {
  CreateInstitutionDto,
  CreateInstitutionAdminInput,
  InstitutionAdminDto,
  InstitutionListItemDto,
  UpdateInstitutionAdminDto,
} from '../../application/dtos/platform.dto'

export interface PlatformAdminRecord {
  id: string
  email: string
  name: string
  passwordHash: string
  isActive: boolean
  role: string
}

export interface IPlatformRepository {
  // Superadmin
  findAdminByEmail(email: string): Promise<PlatformAdminRecord | null>
  findAdminById(id: string): Promise<PlatformAdminRecord | null>
  updateAdminLastLogin(id: string): Promise<void>

  // Instituciones
  institutionCodeExists(code: string): Promise<boolean>
  createInstitution(dto: CreateInstitutionDto): Promise<{ institutionId: string; adminUserId: string }>
  listInstitutions(): Promise<InstitutionListItemDto[]>
  findInstitutionById(id: string): Promise<{ id: string; isActive: boolean } | null>
  setInstitutionActive(id: string, isActive: boolean): Promise<InstitutionListItemDto>

  // Admins de una institución
  listInstitutionAdmins(institutionId: string): Promise<InstitutionAdminDto[]>
  emailExistsInInstitution(institutionId: string, email: string, excludeUserId?: string): Promise<boolean>
  createInstitutionAdmin(institutionId: string, dto: CreateInstitutionAdminInput): Promise<InstitutionAdminDto>
  findInstitutionAdmin(institutionId: string, userId: string): Promise<InstitutionAdminDto | null>
  updateInstitutionAdmin(userId: string, dto: UpdateInstitutionAdminDto): Promise<InstitutionAdminDto>
}
