import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface InstitutionBranding {
  logoUrl: string | null
  primaryColor: string | null
  sidebarColor: string | null
}

export interface AuthInstitution {
  id: string
  name: string
  branding: InstitutionBranding
  modules: string[] | null
  /** 'personal' para cuentas de profesor autoregistradas, null para instituciones normales. */
  accountType: string | null
  /** Para cuentas personales: si ya completó el wizard de /personal/setup. */
  setupComplete: boolean
  /** Para cuentas personales: si planifica en modo multigrado (switch en /settings/mis-grados). */
  multigradeEnabled: boolean
}

export interface AuthUser {
  id: string
  email: string
  fullName: string
  avatarUrl: string | null
  roles: string[]
  permissions: string[]
  institutionId: string
  institution: AuthInstitution | null
  tutorParallelIds: string[]
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  // Para representantes con más de un hijo: el alumno activo seleccionado
  guardianStudentId: string | null
  setAuth: (user: AuthUser, token: string) => void
  setAccessToken: (token: string) => void
  setInstitution: (institution: AuthInstitution) => void
  setGuardianStudentId: (id: string) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      guardianStudentId: null,

      setAuth: (user, accessToken) => set({ user, accessToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      setInstitution: (institution) => {
        const user = get().user
        if (user) set({ user: { ...user, institution } })
      },
      setGuardianStudentId: (id) => set({ guardianStudentId: id }),
      clearAuth: () => set({ user: null, accessToken: null, guardianStudentId: null }),
      isAuthenticated: () => !!get().accessToken && !!get().user,
    }),
    {
      name: 'mao-auth',
      partialize: (s) => ({ user: s.user, accessToken: s.accessToken, guardianStudentId: s.guardianStudentId }),
    },
  ),
)
