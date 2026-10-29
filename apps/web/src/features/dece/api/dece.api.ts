import { useQuery } from '@tanstack/react-query'
import { apiGet, apiPatch, apiPost, apiPut } from '@/shared/lib/api-client'
import { useAuthStore } from '@/store/auth.store'

export const STATE_LABELS: Record<string, string> = {
  received: 'Alerta recibida',
  protection: 'Protección y atención',
  follow_up: 'En seguimiento',
  internal_closed: 'Cierre administrativo interno',
}
export const ACTION_LABELS: Record<string, string> = {
  note: 'Nota de seguimiento',
  protection: 'Medida de protección',
  referral: 'Derivación documentada',
  follow_up: 'Seguimiento',
  status_changed: 'Cambio de estado',
  access_granted: 'Acceso autorizado',
  access_revoked: 'Acceso revocado',
  conflict_excluded: 'Exclusión por conflicto de interés',
  backup_activated: 'Suplencia activada',
}
export const CONCERN_LABELS: Record<string, string> = {
  violence: 'Violencia',
  wellbeing: 'Bienestar',
  missing: 'Desaparición',
  accident: 'Accidente',
  other: 'Otro / no sé',
}
export interface Staff {
  id: string
  name: string
  roles: string[]
}
export interface DeceConfig {
  enabled: boolean
  visibleRoles: string[]
  reporterRoles: string[]
  primaryReceiverId: string | null
  alternateReceiverId: string | null
  alternativeContact: string
}
export interface SettingsResponse extends DeceConfig {
  platformEnabled: boolean
  roles: Array<{ name: string; label: string }>
  staff: Staff[]
}
export interface Context {
  enabled: boolean
  platformEnabled: boolean
  visible: boolean
  hasAssignments: boolean
  canReport: boolean
  canConfigure: boolean
  alternativeContact: string
}
export interface ReportInput {
  requestId: string
  concern: string
  immediateDanger: string
  affectedPerson: string
  narrative: string
  occurredOn?: string
  location: string
  safeContact: string
  excludedUserIds: string[]
  privacyAcknowledged: boolean
}
export interface Receipt {
  id: string
  createdAt: string
}
export interface CaseSummary extends Receipt {
  status: string
  urgency?: string
  updatedAt: string
}
export interface CaseDetail extends CaseSummary {
  access: 'manager' | 'viewer'
  report: Omit<ReportInput, 'requestId' | 'excludedUserIds'> & { reporterName: string }
  actions: Array<{
    id: string
    type: string
    createdAt: string
    actorName: string
    description: string
  }>
}
export interface CaseAccess {
  members: Array<{ userId: string; name: string; access: string }>
  exclusions: Array<{ userId: string; name: string }>
  candidates: Staff[]
}
export interface AuditEntry {
  id: string
  action: string
  createdAt: string
  actor: { id: string; profile: { firstName: string; lastName: string } | null }
}
export const deceApi = {
  context: () => apiGet<Context>('dece/context'),
  settings: () => apiGet<SettingsResponse>('dece/settings'),
  saveSettings: (input: DeceConfig) => apiPut<DeceConfig>('dece/settings', input),
  contacts: () => apiGet<Staff[]>('dece/reporting-contacts'),
  report: (input: ReportInput) => apiPost<Receipt>('dece/reports', input),
  receipts: () => apiGet<Receipt[]>('dece/receipts'),
  cases: () => apiGet<CaseSummary[]>('dece/cases'),
  detail: (id: string) => apiGet<CaseDetail>(`dece/cases/${id}`),
  action: (id: string, input: { type: string; description: string }) =>
    apiPost(`dece/cases/${id}/actions`, input),
  status: (id: string, input: { status: string; reason: string }) =>
    apiPatch(`dece/cases/${id}/status`, input),
  access: (id: string) => apiGet<CaseAccess>(`dece/cases/${id}/access`),
  grant: (id: string, input: { userId: string; access: string; reason: string }) =>
    apiPost(`dece/cases/${id}/access`, input),
  revoke: (id: string, input: { userId: string; reason: string }, exclude = false) =>
    apiPost(`dece/cases/${id}/${exclude ? 'exclusions' : 'revoke'}`, input),
  audit: (id: string) => apiGet<AuditEntry[]>(`dece/cases/${id}/audit`),
}
export function useDeceContext() {
  const user = useAuthStore((s) => s.user)
  return useQuery({
    queryKey: ['dece', user?.institutionId, user?.id, 'context'],
    queryFn: deceApi.context,
    enabled: !!user,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    retry: false,
  })
}
export function useDeceIdentity() {
  return useAuthStore((s) => `${s.user?.institutionId}:${s.user?.id}`)
}
export const protectedQuery = {
  staleTime: 0,
  gcTime: 0,
  retry: false,
  refetchOnWindowFocus: true,
} as const
export const formatDate = (value: string) =>
  new Date(value).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })
