import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { actaTemplateApi } from '../api/acta-template.api'

export function useActaTemplate() {
  const institutionId = useAuthStore((state) => state.user?.institutionId)
  return useQuery({ queryKey: ['acta-template', institutionId], queryFn: actaTemplateApi.get, enabled: !!institutionId })
}
