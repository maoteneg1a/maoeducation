import { useQuery } from '@tanstack/react-query'
import { curricularInsertionApi } from '../api/curricular-insertion.api'

export function useCurricularInsertionCandidates(codes: string[]) {
  return useQuery({
    queryKey: ['curricular-insertion-candidates', ...codes.slice().sort()],
    queryFn: () => curricularInsertionApi.findCandidatesForCodes(codes),
    enabled: codes.length > 0,
  })
}
