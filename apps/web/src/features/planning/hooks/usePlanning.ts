import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { planningApi, type PlanningTemplateType } from '../api/planning.api'

export function usePlanningTemplates(type?: PlanningTemplateType) {
  return useQuery({
    queryKey: ['planning-templates', type],
    queryFn: () => planningApi.listTemplates(type),
  })
}

export function usePlans(courseAssignmentIds?: string[]) {
  return useQuery({
    queryKey: ['planning-plans', courseAssignmentIds],
    queryFn: () => planningApi.listPlans(courseAssignmentIds),
  })
}

export function usePlan(id: string | undefined) {
  return useQuery({
    queryKey: ['planning-plan', id],
    queryFn: () => planningApi.getPlan(id!),
    enabled: !!id,
  })
}

export function useCreatePlan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: planningApi.createPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-plans'] })
      toast.success('PCA creado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdatePlan(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { data: Record<string, unknown> }) => planningApi.updatePlan(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-plan', id] })
      toast.success('PCA guardado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSubmitPlan(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => planningApi.submitPlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-plan', id] })
      qc.invalidateQueries({ queryKey: ['planning-plans'] })
      toast.success('PCA enviado para aprobación')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useApprovePlan(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => planningApi.approvePlan(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-plan', id] })
      qc.invalidateQueries({ queryKey: ['planning-plans'] })
      toast.success('PCA aprobado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ─── Situaciones de aprendizaje ─────────────────────────────────────────────

export function useSituations(planId: string | undefined) {
  return useQuery({
    queryKey: ['planning-situations', planId],
    queryFn: () => planningApi.listSituations(planId!),
    enabled: !!planId,
  })
}

export function useSituation(id: string | undefined) {
  return useQuery({
    queryKey: ['planning-situation', id],
    queryFn: () => planningApi.getSituation(id!),
    enabled: !!id,
  })
}

export function useCreateSituation(planId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: planningApi.createSituation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      qc.invalidateQueries({ queryKey: ['planning-plan', planId] })
      toast.success('Situación de aprendizaje creada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateSituation(id: string, planId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof planningApi.updateSituation>[1]) => planningApi.updateSituation(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situation', id] })
      if (planId) qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      toast.success('Situación guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSubmitSituation(id: string, planId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => planningApi.submitSituation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situation', id] })
      if (planId) qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      toast.success('Enviado para revisión')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useReviewSituation(id: string, planId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => planningApi.reviewSituation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situation', id] })
      if (planId) qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      toast.success('Marcado como revisado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useApproveSituation(id: string, planId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => planningApi.approveSituation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situation', id] })
      if (planId) qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      toast.success('Situación aprobada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

/** A diferencia de useSubmitSituation/useApproveSituation, el id se pasa a mutate() en vez de fijo al montar — se usa desde la lista (PlanningDetailPage), donde cada tarjeta comparte el mismo hook. */
export function useDeleteSituation(planId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (situationId: string) => planningApi.deleteSituation(situationId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-situations', planId] })
      toast.success('Situación de aprendizaje eliminada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ─── Semanas ─────────────────────────────────────────────────────────────

export function useWeeks(situationId: string | undefined) {
  return useQuery({
    queryKey: ['planning-weeks', situationId],
    queryFn: () => planningApi.listWeeks(situationId!),
    enabled: !!situationId,
  })
}

export function useWeek(id: string | undefined) {
  return useQuery({
    queryKey: ['planning-week', id],
    queryFn: () => planningApi.getWeek(id!),
    enabled: !!id,
  })
}

export function useCreateWeek(situationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: planningApi.createWeek,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-weeks', situationId] })
      qc.invalidateQueries({ queryKey: ['planning-situation', situationId] })
      toast.success('Semana creada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateWeek(id: string, situationId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof planningApi.updateWeek>[1]) => planningApi.updateWeek(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-week', id] })
      if (situationId) qc.invalidateQueries({ queryKey: ['planning-weeks', situationId] })
      toast.success('Semana guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDeleteWeek(situationId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: planningApi.deleteWeek,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planning-weeks', situationId] })
      toast.success('Semana eliminada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

/** Destrezas ya planificadas para este curso+periodo — reemplaza al banco completo en selectores de otros módulos. */
export function usePlannedSkills(courseAssignmentId: string | undefined, academicPeriodId: string | undefined) {
  return useQuery({
    queryKey: ['planned-skills', courseAssignmentId, academicPeriodId],
    queryFn: () => planningApi.listPlannedSkills(courseAssignmentId!, academicPeriodId!),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })
}

/** Igual que usePlannedSkills pero para el modelo por competencias. */
export function usePlannedCompetencies(courseAssignmentId: string | undefined, academicPeriodId: string | undefined) {
  return useQuery({
    queryKey: ['planned-competencies', courseAssignmentId, academicPeriodId],
    queryFn: () => planningApi.listPlannedCompetencies(courseAssignmentId!, academicPeriodId!),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })
}
