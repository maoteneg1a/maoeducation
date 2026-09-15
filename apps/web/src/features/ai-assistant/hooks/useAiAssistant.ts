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

export function useDraftProject() {
  return useMutation({
    mutationFn: aiAssistantApi.draftProject,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
