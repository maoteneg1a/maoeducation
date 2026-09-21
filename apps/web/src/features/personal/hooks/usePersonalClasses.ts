import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { personalApi, type SavePersonalClassesDto } from '../api/personal.api'

export const personalClassesKeys = {
  classes: ['personal-classes'] as const,
}

/** GET /personal/classes rechaza con 403 si la cuenta no es personal — nunca
 * dispararlo para docentes de instituciones normales (ej. desde PlanningListPage,
 * que lo usa para detectar si debe agrupar tarjetas de un aula multigrado). */
export function usePersonalClasses() {
  const isPersonalAccount = useAuthStore((s) => s.user?.institution?.accountType === 'personal')
  return useQuery({
    queryKey: personalClassesKeys.classes,
    queryFn: personalApi.getClasses,
    enabled: isPersonalAccount,
  })
}

export function useSavePersonalClasses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (dto: SavePersonalClassesDto) => personalApi.saveClasses(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalClassesKeys.classes })
    },
  })
}

export function useUpdatePlanningModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (planningModel: 'destrezas' | 'competencias') => personalApi.updatePlanningModel(planningModel),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: personalClassesKeys.classes })
    },
  })
}
