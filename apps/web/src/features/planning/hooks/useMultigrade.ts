import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { planningApi } from '../api/planning.api'
import { aiAssistantApi } from '@/features/ai-assistant/api/ai-assistant.api'

export function useMultigradeGroup(groupId: string | undefined) {
  return useQuery({
    queryKey: ['multigrade-group', groupId],
    queryFn: () => planningApi.getMultigradeGroup(groupId!),
    enabled: !!groupId,
  })
}

export function useSuggestMultigradeWeek() {
  return useMutation({
    mutationFn: aiAssistantApi.suggestMultigradeWeek,
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDraftMultigradeWeek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: aiAssistantApi.draftMultigradeWeek,
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ['multigrade-group', vars.groupId] })
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
