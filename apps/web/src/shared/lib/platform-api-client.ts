import ky, { HTTPError } from 'ky'
import { usePlatformAuthStore } from '@/store/platformAuth.store'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

let isRefreshing = false

export const platformApiClient = ky.create({
  prefixUrl: `${API_BASE}/api/v1`,
  timeout: 30000,
  credentials: 'include',
  hooks: {
    beforeRequest: [
      (request) => {
        const token = usePlatformAuthStore.getState().accessToken
        if (token) {
          request.headers.set('Authorization', `Bearer ${token}`)
        }
      },
    ],
    afterResponse: [
      async (request, _options, response) => {
        if (response.status === 401 && !isRefreshing) {
          isRefreshing = true
          try {
            const refreshed = await ky
              .post(`${API_BASE}/api/v1/platform/refresh`, { credentials: 'include' })
              .json<{ accessToken: string }>()
            usePlatformAuthStore.getState().setAccessToken(refreshed.accessToken)
            request.headers.set('Authorization', `Bearer ${refreshed.accessToken}`)
            isRefreshing = false
            return ky(request)
          } catch {
            isRefreshing = false
            usePlatformAuthStore.getState().clearAuth()
            window.location.href = '/platform/login'
          }
        }
      },
    ],
    beforeError: [
      async (error: HTTPError) => {
        const { response } = error
        if (response?.body) {
          try {
            const body = (await response.clone().json()) as { error?: { message?: string } }
            if (body.error?.message) {
              ;(error as unknown as { message: string }).message = body.error.message
            }
          } catch {
            /* ignore */
          }
        }
        return error
      },
    ],
  },
})

export async function platformGet<T>(
  url: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const searchParams = params
    ? Object.fromEntries(
        Object.entries(params)
          .filter(([, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)]),
      )
    : undefined
  return platformApiClient.get(url, { searchParams }).json<T>()
}

export async function platformPost<T>(url: string, data?: unknown): Promise<T> {
  return platformApiClient.post(url, { json: data }).json<T>()
}

export async function platformPatch<T>(url: string, data?: unknown): Promise<T> {
  return platformApiClient.patch(url, { json: data }).json<T>()
}

export async function platformPut<T>(url: string, data?: unknown): Promise<T> {
  return platformApiClient.put(url, { json: data }).json<T>()
}
