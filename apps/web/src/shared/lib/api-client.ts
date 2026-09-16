import ky, { HTTPError } from 'ky'
import { useAuthStore } from '@/store/auth.store'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

// Shared promise so concurrent 401s await the same refresh instead of racing
let refreshPromise: Promise<string> | null = null

function doRefresh(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = ky
      .post(`${API_BASE}/api/v1/auth/refresh`, { credentials: 'include' })
      .json<{ accessToken: string }>()
      .then((r) => {
        useAuthStore.getState().setAccessToken(r.accessToken)
        return r.accessToken
      })
      .catch((err) => {
        useAuthStore.getState().clearAuth()
        window.location.href = '/login'
        throw err
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

export const apiClient = ky.create({
  prefixUrl: `${API_BASE}/api/v1`,
  credentials: 'include',
  timeout: 30000,
  hooks: {
    beforeRequest: [
      (request) => {
        const token = useAuthStore.getState().accessToken
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (request, options, response) => {
        if (response.status === 401) {
          try {
            const newToken = await doRefresh()
            request.headers.set('Authorization', `Bearer ${newToken}`)
            return ky(request)
          } catch {
            // doRefresh already redirected to /login
          }
        }
      },
    ],
    beforeError: [
      async (error: HTTPError) => {
        const { response } = error
        if (response?.body) {
          try {
            const body = await response.clone().json() as { error?: { message?: string } }
            if (body.error?.message) {
                ;(error as unknown as { message: string }).message = body.error.message
            }
          } catch { /* ignore */ }
        }
        return error
      },
    ],
  },
})

export async function apiGet<T>(url: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  const searchParams = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      )
    : undefined
  return apiClient.get(url, { searchParams }).json<T>()
}

export async function apiPost<T>(url: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
  return apiClient.post(url, { json: data, timeout: options?.timeout ?? 30000 }).json<T>()
}

export async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  return apiClient.put(url, { json: data }).json<T>()
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  return apiClient.patch(url, { json: data }).json<T>()
}

export async function apiDelete(url: string): Promise<void> {
  await apiClient.delete(url)
}
