import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  settingsApi,
  type AiConfig,
  type GradingConfig,
  type InstitutionSettings,
  type MicrocurricularTemplateConfig,
  type PlanningModel,
} from '../api/settings.api'
import type { InstitutionBranding } from '@/store/auth.store'

export const settingsKeys = {
  institution: ['institution-settings'] as const,
  gradingConfig: ['grading-config'] as const,
  aiConfig: ['ai-config'] as const,
  planningModel: ['planning-model'] as const,
  microcurricularTemplate: ['microcurricular-template'] as const,
}

function syncStore(settings: InstitutionSettings) {
  // Preserva accountType/setupComplete/modules ya cargados en el store — este
  // endpoint solo devuelve id/name/branding, así que sobreescribir el objeto
  // completo perdería el estado del gate de cuentas personales (PrivateRoute).
  const current = useAuthStore.getState().user?.institution
  useAuthStore.getState().setInstitution({
    id: settings.id,
    name: settings.name,
    branding: settings.branding,
    modules: current?.modules ?? null,
    accountType: current?.accountType ?? null,
    setupComplete: current?.setupComplete ?? true,
  })
}

export function useInstitutionSettings() {
  return useQuery({
    queryKey: settingsKeys.institution,
    queryFn: settingsApi.getSettings,
  })
}

export function useUpdateBranding() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { name?: string; branding?: Partial<InstitutionBranding> }) =>
      settingsApi.updateSettings(data),
    onSuccess: (settings) => {
      qc.setQueryData(settingsKeys.institution, settings)
      syncStore(settings)
      toast.success('Configuración actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUploadLogo() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadLogo(file),
    onSuccess: async () => {
      // Releer settings para tener el logoUrl persistido y sincronizar el store
      const settings = await settingsApi.getSettings()
      qc.setQueryData(settingsKeys.institution, settings)
      syncStore(settings)
      toast.success('Logo actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useGradingConfig() {
  return useQuery({
    queryKey: settingsKeys.gradingConfig,
    queryFn: settingsApi.getGradingConfig,
  })
}

export function useUpdateGradingConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: GradingConfig) => settingsApi.updateGradingConfig(data),
    onSuccess: (config) => {
      qc.setQueryData(settingsKeys.gradingConfig, config)
      toast.success('Configuración de calificación guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useMicrocurricularTemplate() {
  return useQuery({
    queryKey: settingsKeys.microcurricularTemplate,
    queryFn: settingsApi.getMicrocurricularTemplate,
  })
}

export function useUpdateMicrocurricularTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<MicrocurricularTemplateConfig>) => settingsApi.updateMicrocurricularTemplate(data),
    onSuccess: (config) => {
      qc.setQueryData(settingsKeys.microcurricularTemplate, config)
      toast.success('Formato de planificación guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUploadHeaderBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => settingsApi.uploadHeaderBanner(file),
    onSuccess: ({ template }) => {
      qc.setQueryData(settingsKeys.microcurricularTemplate, template)
      toast.success('Banner de encabezado actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useRemoveHeaderBanner() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => settingsApi.removeHeaderBanner(),
    onSuccess: ({ template }) => {
      qc.setQueryData(settingsKeys.microcurricularTemplate, template)
      toast.success('Banner de encabezado eliminado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useAiConfig() {
  return useQuery({
    queryKey: settingsKeys.aiConfig,
    queryFn: settingsApi.getAiConfig,
  })
}

export function useUpdateAiConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<AiConfig>) => settingsApi.updateAiConfig(data),
    onSuccess: (config) => {
      qc.setQueryData(settingsKeys.aiConfig, config)
      toast.success('Configuración del asistente IA guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

/** Modelo de planificación activo (destrezas | competencias) — decide qué selector se muestra en toda la app. */
export function usePlanningModel() {
  return useQuery({
    queryKey: settingsKeys.planningModel,
    queryFn: settingsApi.getPlanningModel,
    staleTime: 30 * 1000,
    select: (data) => data.planningModel,
  })
}

export function useUpdatePlanningModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planningModel: PlanningModel) => settingsApi.updatePlanningModel(planningModel),
    onSuccess: (data) => {
      qc.setQueryData(settingsKeys.planningModel, data)
      toast.success('Modelo de planificación actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
