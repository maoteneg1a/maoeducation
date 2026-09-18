import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { personalApi, type SavePersonalClassesDto } from '../api/personal.api'

export const personalClassesKeys = {
  classes: ['personal-classes'] as const,
}

export function usePersonalClasses() {
  return useQuery({
    queryKey: personalClassesKeys.classes,
    queryFn: personalApi.getClasses,
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
