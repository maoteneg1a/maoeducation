export interface Lead {
  id: string
  name: string
  email: string
  phone: string | null
  institutionName: string | null
  city: string | null
  role: string | null
  studentsCount: number | null
  message: string | null
  source: string
  status: string
  notes: string | null
  ownerAdminId: string | null
  nextFollowUpAt: Date | null
  convertedInstitutionId: string | null
  createdAt: Date
}

export const LEAD_STATUSES = ['new', 'contacted', 'demo_scheduled', 'closed_won', 'closed_lost'] as const
