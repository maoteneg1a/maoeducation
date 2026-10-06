import { apiClient, apiDelete, apiGet, apiPost } from '@/shared/lib/api-client'

export type AnnouncementAudience = 'all' | 'staff' | 'families' | 'parallels'

export interface Announcement {
  id: string
  title: string
  body: string
  eventAt?: string | null
  location?: string | null
  priority: 'normal' | 'important'
  audience: AnnouncementAudience
  parallelIds: string[]
  publishedAt: string
  expiresAt?: string | null
  isRead: boolean
  readAt?: string | null
  flyerName?: string | null
  flyerMimeType?: string | null
  flyerUrl?: string | null
  attachmentName?: string | null
  attachmentMimeType?: string | null
  attachmentSize?: number | null
  attachmentUrl?: string | null
  creator?: { profile?: { firstName: string; lastName: string } | null }
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  eventAt?: string | null
  location?: string | null
  priority: 'normal' | 'important'
  audience: AnnouncementAudience
  parallelIds: string[]
  expiresAt?: string | null
}

export const announcementsApi = {
  list: () => apiGet<Announcement[]>('announcements'),
  create: (data: CreateAnnouncementInput) => apiPost<Announcement>('announcements', data),
  markRead: (id: string) => apiPost(`announcements/${id}/read`),
  uploadFile: async (id: string, kind: 'flyer' | 'attachment', file: File) => {
    const form = new FormData()
    form.append('file', file)
    await apiClient.post(`announcements/${id}/files/${kind}`, { body: form })
  },
  getFile: (id: string, kind: 'flyer' | 'attachment') => apiClient.get(`announcements/${id}/${kind}`).blob(),
  remove: (id: string) => apiDelete(`announcements/${id}`),
}
