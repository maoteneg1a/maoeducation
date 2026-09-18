export interface LoginDto {
  email: string
  password: string
  institutionCode: string
}

export interface InstitutionBrandingDto {
  logoUrl: string | null
  primaryColor: string | null
  sidebarColor: string | null
}

export interface AuthInstitutionDto {
  id: string
  name: string
  branding: InstitutionBrandingDto
  modules: string[] | null
  /** 'personal' para cuentas de profesor autoregistradas, null para instituciones normales. */
  accountType: string | null
  /** Para cuentas personales: si ya completó el wizard de /personal/setup. */
  setupComplete: boolean
  /** Para cuentas personales: si planifica en modo multigrado (switch en /settings/mis-grados). */
  multigradeEnabled: boolean
}

export interface AuthUserDto {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  roles: string[]
  permissions: string[]
  institutionId: string
  institution: AuthInstitutionDto
  tutorParallelIds: string[]
}

export interface LoginResponseDto {
  accessToken: string
  refreshToken: string
  user: AuthUserDto
}

export interface RefreshResponseDto {
  accessToken: string
}
