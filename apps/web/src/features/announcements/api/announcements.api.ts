import { apiClient, apiDelete, apiGet, apiPost } from '@/shared/lib/api-client'

export type AnnouncementAudience = 'all' | 'staff' | 'authorities' | 'teachers' | 'families' | 'parallels'
export type CommunicationType = 'announcement' | 'meeting' | 'convocation' | 'socialization' | 'training' | 'circular'

export interface Announcement {
  id: string
  title: string
  body: string
  communicationType: CommunicationType
  eventAt?: string | null
  location?: string | null
  priority: 'normal' | 'important'
  audience: AnnouncementAudience
  parallelIds: string[]
  publishedAt: string
  expiresAt?: string | null
  isRead: boolean
  myResponse?: 'confirmed' | 'declined' | null
  myResponseAt?: string | null
  tracking?: AnnouncementTracking
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

export interface AnnouncementTracking {
  recipientCount: number
  readCount: number
  readPercent: number
  confirmedCount: number
  declinedCount: number
  responsePercent: number
}

export interface AnnouncementRecipientTracking {
  id: string
  name: string
  readAt: string | null
  response: 'confirmed' | 'declined' | null
  respondedAt: string | null
}

export interface CreateAnnouncementInput {
  title: string
  body: string
  communicationType: CommunicationType
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
  rsvp: (id: string, response: 'confirmed' | 'declined') => apiPost(`announcements/${id}/rsvp`, { response }),
  tracking: (id: string) => apiGet<AnnouncementTracking & { recipients: AnnouncementRecipientTracking[] }>(`announcements/${id}/tracking`),
  uploadFile: async (id: string, kind: 'flyer' | 'attachment', file: File) => {
    const form = new FormData()
    form.append('file', file)
    await apiClient.post(`announcements/${id}/files/${kind}`, { body: form })
  },
  getFile: (id: string, kind: 'flyer' | 'attachment') => apiClient.get(`announcements/${id}/${kind}`).blob(),
  remove: (id: string) => apiDelete(`announcements/${id}`),
}
