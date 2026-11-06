import { apiGet } from '@/shared/lib/api-client'

export interface RosterTeacher {
  id: string
  fullName: string
  email: string
  dni?: string
  phone?: string
  isActive: boolean
}

export const rostersApi = {
  teachers: () => apiGet<{ data: RosterTeacher[]; total: number }>('users', { role: 'teacher', limit: 200 }),
}
