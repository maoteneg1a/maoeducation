import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { curriculumApi } from '../api/curriculum.api'

export function useCurriculumAreas() {
  return useQuery({
    queryKey: ['curriculum-areas'],
    queryFn: curriculumApi.listAreas,
  })
}

export function useCurriculumCriteria(areaId: string | undefined, subnivel: string | undefined) {
  return useQuery({
    queryKey: ['curriculum-criteria', areaId, subnivel],
    queryFn: () => curriculumApi.listCriteria(areaId!, subnivel!),
    enabled: !!areaId && !!subnivel,
  })
}

/** Destrezas disponibles para el selector del PUD: según la materia (área vinculada) + subnivel del grado. */
export function useCurriculumSkillsForSubject(subjectId: string | undefined, subnivel: string | undefined) {
  return useQuery({
    queryKey: ['curriculum-skills-for-subject', subjectId, subnivel],
    queryFn: () => curriculumApi.listSkillsForSubject(subjectId!, subnivel!),
    enabled: !!subjectId && !!subnivel,
  })
}

/** Saberes (declarativo/procedimental/actitudinal) ya cargados para una destreza — se reusan entre docentes. */
export function useSaberesForSkill(skillId: string | undefined) {
  return useQuery({
    queryKey: ['curriculum-saberes', skillId],
    queryFn: () => curriculumApi.listSaberesForSkill(skillId!),
    enabled: !!skillId,
  })
}

export function useCreateSaber() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: curriculumApi.createSaber,
    onSuccess: (saber) => {
      qc.invalidateQueries({ queryKey: ['curriculum-saberes', saber.skillId] })
      toast.success('Saber agregado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
