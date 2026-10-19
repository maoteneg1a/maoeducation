import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type PlatformRole = 'owner' | 'support' | 'billing'

export interface PlatformAdmin {
  id: string
  email: string
  name: string
  /** Ausente en sesiones persistidas antes de existir roles: se trata como owner. */
  role?: PlatformRole
}

interface PlatformAuthState {
  admin: PlatformAdmin | null
  accessToken: string | null
  setAuth: (admin: PlatformAdmin, token: string) => void
  setAccessToken: (token: string) => void
  clearAuth: () => void
  isAuthenticated: () => boolean
}

export const usePlatformAuthStore = create<PlatformAuthState>()(
  persist(
    (set, get) => ({
      admin: null,
      accessToken: null,

      setAuth: (admin, accessToken) => set({ admin, accessToken }),

      setAccessToken: (accessToken) => set({ accessToken }),

      clearAuth: () => set({ admin: null, accessToken: null }),

      isAuthenticated: () => !!get().accessToken && !!get().admin,
    }),
    {
      name: 'mao-platform-auth',
      partialize: (s) => ({ admin: s.admin, accessToken: s.accessToken }),
    },
  ),
)
