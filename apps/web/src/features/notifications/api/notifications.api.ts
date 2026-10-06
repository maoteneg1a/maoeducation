import { apiGet, apiPatch } from '@/shared/lib/api-client'

export interface UserNotification {
  id: string
  title: string
  body: string
  url?: string | null
  readAt?: string | null
  createdAt: string
}

export const notificationsApi = {
  list: () => apiGet<{ items: UserNotification[]; unread: number }>('notifications'),
  markRead: (id: string) => apiPatch<{ ok: boolean }>(`notifications/${id}/read`),
  markAllRead: () => apiPatch<{ ok: boolean }>('notifications/read-all'),
}
