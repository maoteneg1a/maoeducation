import { platformApiClient, platformGet, platformPost, platformPatch, platformPut } from '@/shared/lib/platform-api-client'
import type { PlatformAdmin, PlatformRole } from '@/store/platformAuth.store'
import type { AuditFilters, AuditLogPage } from '@/shared/components/audit/AuditLogView'
import type { AuthUser } from '@/store/auth.store'
import type { AiConfig } from '@/features/settings/api/settings.api'
import type { Subject } from '@/features/academic/api/academic.api'

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
  /** Habilita "Sembrar datos de prueba" (solo demos/pruebas). */
  isTestInstitution?: boolean
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
  notes?: string | null
  ownerAdminId?: string | null
  nextFollowUpAt?: string | null
  convertedInstitutionId?: string | null
}

export interface UpdateLeadPayload {
  status?: string
  notes?: string
  ownerAdminId?: string | null
  nextFollowUpAt?: string | null
  convertedInstitutionId?: string
}

async function platformDelete(url: string): Promise<void> {
  await platformApiClient.delete(url)
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

  getInstitutionAiConfig: (id: string) => platformGet<AiConfig>(`platform/institutions/${id}/ai-config`),
  updateInstitutionAiConfig: (id: string, data: Partial<AiConfig>) =>
    platformPut<AiConfig>(`platform/institutions/${id}/ai-config`, data),

  getInstitutionSubjects: (id: string) => platformGet<Subject[]>(`platform/institutions/${id}/subjects`),
  createInstitutionSubject: (id: string, data: Partial<Subject>) =>
    platformPost<Subject>(`platform/institutions/${id}/subjects`, data),
  updateInstitutionSubject: (id: string, subjectId: string, data: Partial<Subject>) =>
    platformPatch<Subject>(`platform/institutions/${id}/subjects/${subjectId}`, data),
  toggleInstitutionSubject: (id: string, subjectId: string) =>
    platformPatch<Subject>(`platform/institutions/${id}/subjects/${subjectId}/toggle`),

  getCurriculumAreas: () => platformGet<{ id: string; name: string }[]>('platform/curriculum-areas'),
  getCompetencyAreas: () => platformGet<{ id: string; name: string }[]>('platform/competency-areas'),

  getLeads: () => platformGet<Lead[]>('leads'),
  updateLeadStatus: (id: string, status: string) =>
    platformPatch<Lead>(`leads/${id}/status`, { status }),
  updateLead: (id: string, data: UpdateLeadPayload) => platformPatch<Lead>(`leads/${id}`, data),

  getInstitutionOverview: (id: string) =>
    platformGet<InstitutionOverview>(`platform/institutions/${id}/overview`),
  addInstitutionNote: (id: string, body: string) =>
    platformPost<unknown>(`platform/institutions/${id}/notes`, { body }),
  deleteInstitutionNote: (id: string, noteId: string) =>
    platformDelete(`platform/institutions/${id}/notes/${noteId}`),
  setSubscriptionLimits: (institutionId: string, data: SubscriptionLimits) =>
    platformPut<unknown>(`platform/subscriptions/${institutionId}/limits`, data),

  getTeam: () => platformGet<PlatformTeamMember[]>('platform/team'),
  createTeamMember: (data: CreateTeamMemberPayload) =>
    platformPost<PlatformTeamMember>('platform/team', data),
  updateTeamMember: (id: string, data: UpdateTeamMemberPayload) =>
    platformPatch<PlatformTeamMember>(`platform/team/${id}`, data),

  getAnnouncements: () => platformGet<PlatformAnnouncement[]>('platform/announcements'),
  createAnnouncement: (data: CreateAnnouncementPayload) =>
    platformPost<PlatformAnnouncement>('platform/announcements', data),
  deleteAnnouncement: (id: string) => platformDelete(`platform/announcements/${id}`),

  getAlerts: () => platformGet<PlatformAlerts>('platform/alerts'),
  getAuditLogs: (filters: AuditFilters) =>
    platformGet<AuditLogPage>('platform/audit-logs', filters),

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
    platformPost<{ accessToken: string; user: AuthUser; impersonation: { expiresIn: string } }>(
      `platform/users/${userId}/impersonate`,
    ),
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
  /** La suscripción real — si el asistente IA está activado para esta institución. */
  aiEnabled: boolean
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

// ─── Ficha 360° de institución ──────────────────────────────────────────────

export interface SubscriptionLimits {
  maxStudents: number | null
  maxTeachers: number | null
}

export interface InstitutionOverview {
  institution: {
    id: string
    name: string
    code: string
    isActive: boolean
    createdAt: string
    accountType: 'school' | 'personal'
    isTestInstitution: boolean
    modules: string[] | null
  }
  usage: {
    activeYear: string | null
    students: number
    teachers: number
    totalUsers: number
    activeUsers30d: number
    lastActivityAt: string | null
    parallels: number
    grades30d: number
    attendance30d: number
  }
  subscription:
    | (Omit<PlatformSubscriptionStatus, 'plan'> & {
        plan: string
        notes: string | null
        maxStudents: number | null
        maxTeachers: number | null
      })
    | null
  payments: {
    id: string
    status: PaymentReviewStatus
    amount: number | null
    createdAt: string
    reviewedAt: string | null
    reviewNotes: string | null
    reference: string | null
  }[]
  admins: { id: string; email: string; isActive: boolean; lastLoginAt: string | null; fullName: string }[]
  notes: { id: string; body: string; createdAt: string; author: string | null }[]
  recentActivity: {
    id: string
    action: string
    createdAt: string
    userId: string | null
    platformAdminId: string | null
  }[]
}

// ─── Equipo de plataforma ───────────────────────────────────────────────────

export interface PlatformTeamMember {
  id: string
  email: string
  name: string
  role: PlatformRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

export interface CreateTeamMemberPayload {
  email: string
  name: string
  role: PlatformRole
  password: string
}

export interface UpdateTeamMemberPayload {
  role?: PlatformRole
  isActive?: boolean
  name?: string
}

// ─── Avisos globales ────────────────────────────────────────────────────────

export type AnnouncementLevel = 'info' | 'warning' | 'critical'
export type AnnouncementAudience = 'all' | 'admins'

export interface PlatformAnnouncement {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  audience: AnnouncementAudience
  startsAt: string
  endsAt: string | null
  createdBy: string | null
  createdAt: string
}

export interface CreateAnnouncementPayload {
  title: string
  body: string
  level?: AnnouncementLevel
  audience?: AnnouncementAudience
  startsAt?: string
  endsAt?: string | null
}

// ─── Alertas ────────────────────────────────────────────────────────────────

export interface PlatformAlerts {
  expiringSoon: { institutionId: string; name: string; expiresAt: string; plan: string }[]
  pendingPayments: number
  inactiveInstitutions: { id: string; name: string }[]
  inactiveCount: number
  leadsToFollowUp: number
}
