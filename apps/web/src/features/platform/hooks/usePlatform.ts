import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePlatformAuthStore } from '@/store/platformAuth.store'
import type { AiConfig } from '@/features/settings/api/settings.api'
import type { Subject } from '@/features/academic/api/academic.api'
import {
  platformApi,
  type CreateAdminPayload,
  type CreateInstitutionPayload,
  type PlatformLoginPayload,
  type UpdateAdminPayload,
  type Institution,
  type ApprovePaymentPayload,
  type PaymentReviewStatus,
  type SetValidityPayload,
} from '../api/platform.api'

export const platformKeys = {
  institutions: ['platform-institutions'] as const,
  admins: (institutionId: string) => ['platform-institution-admins', institutionId] as const,
  aiConfig: (institutionId: string) => ['platform-institution-ai-config', institutionId] as const,
  subjects: (institutionId: string) => ['platform-institution-subjects', institutionId] as const,
}

export function usePlatformLogin() {
  const { setAuth } = usePlatformAuthStore()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: (payload: PlatformLoginPayload) => platformApi.login(payload),
    onSuccess: (data) => {
      setAuth(data.admin, data.accessToken)
      navigate('/platform', { replace: true })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useInstitutions() {
  return useQuery({
    queryKey: platformKeys.institutions,
    queryFn: platformApi.getInstitutions,
  })
}

export function useCreateInstitution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateInstitutionPayload) => platformApi.createInstitution(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.institutions })
      toast.success('Institución creada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useToggleInstitution() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => platformApi.toggleInstitution(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.institutions })
      toast.success('Estado de la institución actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSetTestFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isTestInstitution }: { id: string; isTestInstitution: boolean }) =>
      platformApi.setTestFlag(id, isTestInstitution),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.institutions })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSeedTestData() {
  return useMutation({
    mutationFn: (id: string) => platformApi.seedTestData(id),
    onSuccess: () => toast.success('Datos de prueba sembrados correctamente'),
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useInstitutionAdmins(institutionId: string) {
  return useQuery({
    queryKey: platformKeys.admins(institutionId),
    queryFn: () => platformApi.getInstitutionAdmins(institutionId),
    enabled: !!institutionId,
  })
}

export function useCreateInstitutionAdmin(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: CreateAdminPayload) => platformApi.createInstitutionAdmin(institutionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.admins(institutionId) })
      toast.success('Administrador creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateInstitutionAdmin(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateAdminPayload }) =>
      platformApi.updateInstitutionAdmin(institutionId, userId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.admins(institutionId) })
      toast.success('Administrador actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateInstitutionModules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, modules }: { id: string; modules: string[] }) =>
      platformApi.updateInstitutionModules(id, modules),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.institutions })
      toast.success('Módulos actualizados')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useInstitutionModules(institution: Institution | null) {
  const settings = institution?.settings as Record<string, unknown> | undefined
  const modules = settings?.modules as string[] | undefined
  return modules ?? null
}

// ─── Configuración de IA por institución ───────────────────────────────────
// Único lugar que puede escribir esto — la institución solo lee (GET
// /institution/ai-config), ver institution.routes.ts.

export function useInstitutionAiConfig(institutionId: string) {
  return useQuery({
    queryKey: platformKeys.aiConfig(institutionId),
    queryFn: () => platformApi.getInstitutionAiConfig(institutionId),
    enabled: !!institutionId,
  })
}

export function useUpdateInstitutionAiConfig(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<AiConfig>) => platformApi.updateInstitutionAiConfig(institutionId, data),
    onSuccess: (config) => {
      qc.setQueryData(platformKeys.aiConfig(institutionId), config)
      toast.success('Configuración de IA actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ─── Materias por institución ───────────────────────────────────────────────
// Crear/editar/activar materias es control de plataforma — el catálogo de
// cada institución se gestiona desde aquí, no desde /academic/subjects.

export function useInstitutionSubjects(institutionId: string) {
  return useQuery({
    queryKey: platformKeys.subjects(institutionId),
    queryFn: () => platformApi.getInstitutionSubjects(institutionId),
    enabled: !!institutionId,
  })
}

export function useCreateInstitutionSubject(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Subject>) => platformApi.createInstitutionSubject(institutionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.subjects(institutionId) })
      toast.success('Materia creada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateInstitutionSubject(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ subjectId, data }: { subjectId: string; data: Partial<Subject> }) =>
      platformApi.updateInstitutionSubject(institutionId, subjectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.subjects(institutionId) })
      toast.success('Materia actualizada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useToggleInstitutionSubject(institutionId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (subjectId: string) => platformApi.toggleInstitutionSubject(institutionId, subjectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: platformKeys.subjects(institutionId) })
      toast.success('Estado de la materia actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function usePlatformCurriculumAreas() {
  return useQuery({ queryKey: ['platform-curriculum-areas'], queryFn: platformApi.getCurriculumAreas })
}

export function usePlatformCompetencyAreas() {
  return useQuery({ queryKey: ['platform-competency-areas'], queryFn: platformApi.getCompetencyAreas })
}

// ─── Suscripciones ──────────────────────────────────────────────────────────

export const subscriptionKeys = {
  subscriptions: ['platform-subscriptions'] as const,
  payments: (status?: PaymentReviewStatus) => ['platform-subscription-payments', status] as const,
}

export function usePlatformSubscriptions() {
  return useQuery({
    queryKey: subscriptionKeys.subscriptions,
    queryFn: platformApi.getSubscriptions,
  })
}

export function useSubscriptionPayments(status?: PaymentReviewStatus) {
  return useQuery({
    queryKey: subscriptionKeys.payments(status),
    queryFn: () => platformApi.getSubscriptionPayments(status),
  })
}

/** Invalida todo lo que cambia al revisar un pago o mover una vigencia. */
function useRefreshSubscriptions() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: subscriptionKeys.subscriptions })
    queryClient.invalidateQueries({ queryKey: ['platform-subscription-payments'] })
  }
}

export function useApprovePayment() {
  const refresh = useRefreshSubscriptions()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ApprovePaymentPayload }) =>
      platformApi.approvePayment(id, data),
    onSuccess: () => {
      refresh()
      toast.success('Pago aprobado y vigencia actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useRejectPayment() {
  const refresh = useRefreshSubscriptions()
  return useMutation({
    mutationFn: ({ id, reviewNotes }: { id: string; reviewNotes: string }) =>
      platformApi.rejectPayment(id, reviewNotes),
    onSuccess: () => {
      refresh()
      toast.success('Comprobante rechazado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSetSubscriptionValidity() {
  const refresh = useRefreshSubscriptions()
  return useMutation({
    mutationFn: ({ institutionId, data }: { institutionId: string; data: SetValidityPayload }) =>
      platformApi.setSubscriptionValidity(institutionId, data),
    onSuccess: () => {
      refresh()
      toast.success('Vigencia actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSetSubscriptionSuspended() {
  const refresh = useRefreshSubscriptions()
  return useMutation({
    mutationFn: ({ institutionId, suspended }: { institutionId: string; suspended: boolean }) =>
      platformApi.setSubscriptionSuspended(institutionId, suspended),
    onSuccess: (_data, vars) => {
      refresh()
      toast.success(vars.suspended ? 'Cuenta suspendida' : 'Cuenta reactivada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
