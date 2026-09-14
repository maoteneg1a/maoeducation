import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { interdisciplinaryProjectApi } from '../api/interdisciplinary-project.api'

export function useProjects(parallelId: string | undefined, academicPeriodId: string | undefined) {
  return useQuery({
    queryKey: ['interdisciplinary-projects', parallelId, academicPeriodId],
    queryFn: () => interdisciplinaryProjectApi.listProjects({ parallelId: parallelId!, academicPeriodId: academicPeriodId! }),
    enabled: !!parallelId && !!academicPeriodId,
  })
}

export function useProject(id: string | undefined) {
  return useQuery({
    queryKey: ['interdisciplinary-project', id],
    queryFn: () => interdisciplinaryProjectApi.getProject(id!),
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: interdisciplinaryProjectApi.createProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interdisciplinary-projects'] })
      toast.success('Proyecto interdisciplinario creado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof interdisciplinaryProjectApi.updateProject>[1]) =>
      interdisciplinaryProjectApi.updateProject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interdisciplinary-project', id] })
      qc.invalidateQueries({ queryKey: ['interdisciplinary-projects'] })
      toast.success('Proyecto guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useJoinProject(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (courseAssignmentId: string) => interdisciplinaryProjectApi.joinProject(projectId, courseAssignmentId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['interdisciplinary-project', projectId] })
      toast.success('Te uniste al proyecto con tu asignación')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateContribution(contributionId: string, projectId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof interdisciplinaryProjectApi.updateContribution>[1]) =>
      interdisciplinaryProjectApi.updateContribution(contributionId, data),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: ['interdisciplinary-project', projectId] })
      toast.success('Aporte guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useRemoveContribution(projectId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: interdisciplinaryProjectApi.removeContribution,
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: ['interdisciplinary-project', projectId] })
      toast.success('Te saliste del proyecto')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpsertWeekEntry(contributionId: string, projectId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof interdisciplinaryProjectApi.upsertWeekEntry>[1]) =>
      interdisciplinaryProjectApi.upsertWeekEntry(contributionId, data),
    onSuccess: () => {
      if (projectId) qc.invalidateQueries({ queryKey: ['interdisciplinary-project', projectId] })
      toast.success('Semana guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
