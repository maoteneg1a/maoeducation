import { apiClient, apiPost } from '@/shared/lib/api-client'
import { Capacitor } from '@capacitor/core'
import type { AuthUser } from '@/store/auth.store'

export interface LoginPayload {
  email: string
  password: string
  institutionCode: string
}

export interface LoginResponse {
  accessToken: string
  user: AuthUser
}

export const authApi = {
  login: (payload: LoginPayload) => apiPost<LoginResponse>('auth/login', payload),
  logout: async () => { await apiClient.post('auth/logout', Capacitor.isNativePlatform() ? { json: {} } : undefined) },
  me: () => apiPost<AuthUser>('auth/me'),
}
