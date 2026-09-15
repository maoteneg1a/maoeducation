export interface PlatformLoginDto {
  email: string
  password: string
}

export interface PlatformLoginResponseDto {
  accessToken: string
  refreshToken: string
  admin: { id: string; email: string; name: string }
}

export interface CreateInstitutionAdminInput {
  email: string
  firstName: string
  lastName: string
  password: string
}

export interface CreateInstitutionDto {
  name: string
  code: string
  admin: CreateInstitutionAdminInput
  /** Régimen académico ecuatoriano — determina las fechas del año lectivo y sus 3 trimestres creados automáticamente. */
  regime?: 'SIERRA_AMAZONIA' | 'COSTA_GALAPAGOS'
}

export interface InstitutionListItemDto {
  id: string
  name: string
  code: string
  isActive: boolean
  userCount: number
  createdAt: Date
  /** Habilita el botón "Sembrar datos de prueba" en la UI — true por defecto al crear, el admin lo apaga cuando ya es una escuela real. */
  isTestInstitution: boolean
}

export interface InstitutionAdminDto {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  lastLoginAt: Date | null
}

export interface UpdateInstitutionAdminDto {
  email?: string
  firstName?: string
  lastName?: string
  isActive?: boolean
  password?: string
}
