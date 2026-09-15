import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { competencyCurriculumApi } from '../api/competency-curriculum.api'

export function useCompetencyAreas() {
  return useQuery({
    queryKey: ['competency-areas'],
    queryFn: competencyCurriculumApi.listAreas,
  })
}

export function useCompetencies(areaId: string | undefined, subnivel: string | undefined) {
  return useQuery({
    queryKey: ['competencies', areaId, subnivel],
    queryFn: () => competencyCurriculumApi.listCompetencies(areaId!, subnivel!),
    enabled: !!areaId && !!subnivel,
  })
}

/** Competencias disponibles para el selector del PUD: según la materia (área vinculada) + subnivel del grado. */
export function useCompetenciesForSubject(subjectId: string | undefined, subnivel: string | undefined) {
  return useQuery({
    queryKey: ['competencies-for-subject', subjectId, subnivel],
    queryFn: () => competencyCurriculumApi.listCompetenciesForSubject(subjectId!, subnivel!),
    enabled: !!subjectId && !!subnivel,
  })
}

/** Saberes (declarativo/procedimental/actitudinal) ya cargados para una competencia. */
export function useSaberesForCompetency(competencyId: string | undefined) {
  return useQuery({
    queryKey: ['competency-saberes', competencyId],
    queryFn: () => competencyCurriculumApi.listSaberesForCompetency(competencyId!),
    enabled: !!competencyId,
  })
}

export function useKeyCompetencies() {
  return useQuery({
    queryKey: ['key-competencies'],
    queryFn: competencyCurriculumApi.listKeyCompetencies,
    staleTime: Infinity, // catálogo fijo global, nunca cambia en runtime
  })
}

export function useCreateCompetencySaber() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: competencyCurriculumApi.createSaber,
    onSuccess: (saber) => {
      qc.invalidateQueries({ queryKey: ['competency-saberes', saber.competencyId] })
      toast.success('Saber agregado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
