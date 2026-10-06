import { apiDelete, apiGet, apiPost } from '@/shared/lib/api-client'

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
  remove: (id: string) => apiDelete(`announcements/${id}`),
}
