import { platformGet, platformPost, platformPatch } from '@/shared/lib/platform-api-client'
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

  getStatsOverview: () => platformGet<StatsOverview>('platform/stats/overview'),
  getPlatformUsers: (params: { page?: number; limit?: number; search?: string }) =>
    platformGet<{ data: PlatformUser[]; total: number }>('platform/users', params),
  impersonateUser: (userId: string) =>
    platformPost<{ accessToken: string; user: AuthUser }>(`platform/users/${userId}/impersonate`),
}
