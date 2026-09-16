import { AuthInstitutionDto } from '../dtos/auth.dto'

/** Construye el objeto institution (con branding) para la respuesta de auth. */
export function buildAuthInstitution(institution: {
  id: string
  name: string
  settings: unknown
}): AuthInstitutionDto {
  const settings = (institution.settings ?? {}) as Record<string, unknown>
  const branding = (settings.branding ?? {}) as Record<string, unknown>
  return {
    id: institution.id,
    name: institution.name,
    branding: {
      logoUrl: (branding.logoUrl as string | undefined) ?? null,
      primaryColor: (branding.primaryColor as string | undefined) ?? null,
      sidebarColor: (branding.sidebarColor as string | undefined) ?? null,
    },
    modules: (settings.modules as string[] | undefined) ?? null,
    accountType: (settings.accountType as string | undefined) ?? null,
    setupComplete: (settings.setupComplete as boolean | undefined) ?? true,
  }
}
