import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePlatformAuthStore } from '@/store/platformAuth.store'
import {
  platformApi,
  type CreateAdminPayload,
  type CreateInstitutionPayload,
  type PlatformLoginPayload,
  type UpdateAdminPayload,
  type Institution,
} from '../api/platform.api'

export const platformKeys = {
  institutions: ['platform-institutions'] as const,
  admins: (institutionId: string) => ['platform-institution-admins', institutionId] as const,
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
