import { platformApiClient, platformGet, platformPost, platformPatch, platformPut } from '@/shared/lib/platform-api-client'
import type { PlatformAdmin } from '@/store/platformAuth.store'
import type { AuthUser } from '@/store/auth.store'

export interface PlatformLoginPayload {
  email: string
  password: string
}

export interface PlatformLoginResponse {
  accessToken: string
  admin: PlatformAdmin
}

export interface Institution {
  id: string
  name: string
  code: string
  isActive: boolean
  userCount: number
  createdAt: string
  settings?: Record<string, unknown>
  /** Habilita el botón "Sembrar datos de prueba" — true por defecto al crear, editable en el toggle. */
  isTestInstitution: boolean
}

export interface SeedTestDataResult {
  parallelName: string
  teacherEmails: string[]
  studentEmails: string[]
  password: string
}

export interface CreateInstitutionPayload {
  name: string
  code: string
  admin: {
    email: string
    firstName: string
    lastName: string
    password: string
  }
  /** Determina las fechas del año lectivo y sus 3 trimestres, creados automáticamente. */
  regime: 'SIERRA_AMAZONIA' | 'COSTA_GALAPAGOS'
}

export interface InstitutionAdmin {
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  lastLoginAt: string | null
}

export interface CreateAdminPayload {
  email: string
  firstName: string
  lastName: string
  password: string
}

export interface UpdateAdminPayload {
  email?: string
  firstName?: string
  lastName?: string
  isActive?: boolean
  password?: string
}

export interface StatsOverview {
  institutions: { total: number; personal: number; schools: number }
  users: { total: number }
  leads: { total: number; byStatus: { status: string; count: number }[] }
  signups: {
    institutions: { date: string; count: number }[]
    users: { date: string; count: number }[]
  }
  pageViews: {
    total30d: number
    series: { date: string; count: number }[]
    topPages: { path: string; count: number }[]
  }
}

export interface PlatformUser {
  id: string
  email: string
  isActive: boolean
  fullName: string
  roles: string[]
  institutionId: string
  institutionName: string
  accountType: 'personal' | 'school'
  createdAt: string
}

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
  createdAt: string
}

export const platformApi = {
  login: (payload: PlatformLoginPayload) => platformPost<PlatformLoginResponse>('platform/login', payload),

  getInstitutions: () => platformGet<Institution[]>('platform/institutions'),
  createInstitution: (data: CreateInstitutionPayload) =>
    platformPost<Institution>('platform/institutions', data),
  toggleInstitution: (id: string) => platformPatch<Institution>(`platform/institutions/${id}/toggle`),
  setTestFlag: (id: string, isTestInstitution: boolean) =>
    platformPatch<{ id: string; isTestInstitution: boolean }>(`platform/institutions/${id}/test-flag`, { isTestInstitution }),
  seedTestData: (id: string) => platformPost<SeedTestDataResult>(`platform/institutions/${id}/seed-test-data`),

  getInstitutionAdmins: (institutionId: string) =>
    platformGet<InstitutionAdmin[]>(`platform/institutions/${institutionId}/admins`),
  createInstitutionAdmin: (institutionId: string, data: CreateAdminPayload) =>
    platformPost<InstitutionAdmin>(`platform/institutions/${institutionId}/admins`, data),
  updateInstitutionAdmin: (institutionId: string, userId: string, data: UpdateAdminPayload) =>
    platformPatch<InstitutionAdmin>(`platform/institutions/${institutionId}/admins/${userId}`, data),

  updateInstitutionModules: (id: string, modules: string[]) =>
    platformPatch<{ id: string; modules: string[] }>(`platform/institutions/${id}/modules`, { modules }),

  getLeads: () => platformGet<Lead[]>('leads'),
  updateLeadStatus: (id: string, status: string) =>
    platformPatch<Lead>(`leads/${id}/status`, { status }),

  getSubscriptions: () => platformGet<PlatformSubscription[]>('platform/subscriptions'),
  getSubscriptionPayments: (status?: PaymentReviewStatus) =>
    platformGet<PendingPayment[]>('platform/subscription-payments', { status }),
  approvePayment: (id: string, data: ApprovePaymentPayload) =>
    platformPost<unknown>(`platform/subscription-payments/${id}/approve`, data),
  rejectPayment: (id: string, reviewNotes: string) =>
    platformPost<unknown>(`platform/subscription-payments/${id}/reject`, { reviewNotes }),
  setSubscriptionValidity: (institutionId: string, data: SetValidityPayload) =>
    platformPut<{ status: PlatformSubscriptionStatus }>(
      `platform/subscriptions/${institutionId}/validity`,
      data,
    ),
  setSubscriptionSuspended: (institutionId: string, suspended: boolean) =>
    platformPatch<{ status: PlatformSubscriptionStatus }>(
      `platform/subscriptions/${institutionId}/suspend`,
      { suspended },
    ),
  /**
   * El comprobante se baja como blob: su ruta exige el header de autorización,
   * que un <img src> no manda. Quien llame debe revocar la URL.
   */
  getReceiptUrl: async (paymentId: string): Promise<string> => {
    const blob = await platformApiClient
      .get(`platform/subscription-payments/${paymentId}/receipt`)
      .blob()
    return URL.createObjectURL(blob)
  },

  getStatsOverview: () => platformGet<StatsOverview>('platform/stats/overview'),
  getPlatformUsers: (params: { page?: number; limit?: number; search?: string }) =>
    platformGet<{ data: PlatformUser[]; total: number }>('platform/users', params),
  impersonateUser: (userId: string) =>
    platformPost<{ accessToken: string; user: AuthUser }>(`platform/users/${userId}/impersonate`),
}

// ─── Suscripciones ──────────────────────────────────────────────────────────

export type SubscriptionState = 'trial' | 'active' | 'grace' | 'readonly' | 'suspended'
export type PaymentReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PlatformSubscriptionStatus {
  state: SubscriptionState
  plan: 'trial' | 'paid'
  startsAt: string
  expiresAt: string
  graceEndsAt: string
  daysRemaining: number
  expiringSoon: boolean
  readOnly: boolean
}

export interface PlatformSubscription {
  institutionId: string
  institutionName: string
  institutionCode: string
  accountType: 'personal' | 'institution'
  userCount: number
  /** null = institución sin suscripción gestionada (no se le restringe nada). */
  status: PlatformSubscriptionStatus | null
  notes: string | null
  pendingPayments: number
  lastPaymentAt: string | null
}

export interface PendingPayment {
  id: string
  institutionId: string
  institutionName: string
  status: PaymentReviewStatus
  amount: number | null
  currency: string
  transferredAt: string | null
  reference: string | null
  notes: string | null
  fileName: string
  mimeType: string
  fileSize: number
  uploaderName: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
  currentExpiresAt: string | null
  /** Un año desde hoy o desde el vencimiento actual, el que sea mayor. */
  suggestedExpiresAt: string
}

export interface ApprovePaymentPayload {
  expiresAt: string
  amount?: number
  reviewNotes?: string
}

export interface SetValidityPayload {
  expiresAt: string
  plan?: 'trial' | 'paid'
  graceDays?: number
  notes?: string
}
