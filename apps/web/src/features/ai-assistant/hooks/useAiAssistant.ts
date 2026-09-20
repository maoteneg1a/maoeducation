import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { aiAssistantApi } from '../api/ai-assistant.api'

/** true si el admin activó el asistente para esta institución — controla si se muestra el botón. */
export function useAiEnabled() {
  const { data } = useQuery({
    queryKey: ['ai-config'],
    queryFn: aiAssistantApi.getAiConfig,
    staleTime: 30 * 1000,
  })
  return data?.enabled ?? false
}

/**
 * Uso real de tokens de hoy/mes contra los topes configurados — aviso
 * preventivo antes de que el docente choque contra el límite (antes solo se
 * enteraba vía el toast de error de useDraftWeek/useDraftCompetencyWeek/etc.
 * cuando ya era tarde). refetchInterval corto porque el consumo cambia con
 * cada generación de cualquier docente de la institución, no solo la propia.
 */
export function useAiBudgetUsage() {
  const aiEnabled = useAiEnabled()
  return useQuery({
    queryKey: ['ai-budget-usage'],
    queryFn: aiAssistantApi.getAiUsage,
    enabled: aiEnabled,
    staleTime: 20 * 1000,
    refetchInterval: 30 * 1000,
  })
}

export function useDraftWeek() {
  return useMutation({
    mutationFn: aiAssistantApi.draftWeek,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDraftCompetencyWeek() {
  return useMutation({
    mutationFn: aiAssistantApi.draftCompetencyWeek,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDraftSituationBlock() {
  return useMutation({
    mutationFn: aiAssistantApi.draftSituationBlock,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDraftProject() {
  return useMutation({
    mutationFn: aiAssistantApi.draftProject,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
