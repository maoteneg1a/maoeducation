import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { academicApi } from '../api/academic.api'

export const academicKeys = {
  levels: ['levels'] as const,
  subjects: ['subjects'] as const,
  years: ['academic-years'] as const,
  periods: (yearId: string) => ['academic-periods', yearId] as const,
  parallels: (yearId?: string) => ['parallels', yearId] as const,
  assignments: (params?: object) => ['course-assignments', params] as const,
  schemes: ['period-schemes'] as const,
}

// ---- Levels ----

export function useLevels() {
  return useQuery({
    queryKey: academicKeys.levels,
    queryFn: academicApi.getLevels,
  })
}

export function useCreateLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: academicApi.createLevel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.levels })
      toast.success('Nivel creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof academicApi.updateLevel>[1] }) =>
      academicApi.updateLevel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.levels })
      toast.success('Nivel actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useToggleLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => academicApi.toggleLevel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.levels })
      toast.success('Estado del nivel actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Subjects ----

export function useSubjects() {
  return useQuery({
    queryKey: academicKeys.subjects,
    queryFn: academicApi.getSubjects,
  })
}

export function useCreateSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: academicApi.createSubject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.subjects })
      toast.success('Materia creada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateSubject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof academicApi.updateSubject>[1] }) =>
      academicApi.updateSubject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.subjects })
      toast.success('Materia actualizada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Academic Years ----

export function useAcademicYears() {
  return useQuery({
    queryKey: academicKeys.years,
    queryFn: academicApi.getYears,
  })
}

export function useCreateYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: academicApi.createYear,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.years })
      toast.success('Año académico creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useActivateYear() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => academicApi.activateYear(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.years })
      toast.success('Año académico activado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Periods ----

export function usePeriods(yearId: string) {
  return useQuery({
    queryKey: academicKeys.periods(yearId),
    queryFn: () => academicApi.getPeriods(yearId),
    enabled: !!yearId,
  })
}

export function useCreatePeriod(yearId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Parameters<typeof academicApi.createPeriod>[1]) =>
      academicApi.createPeriod(yearId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.periods(yearId) })
      toast.success('Período creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdatePeriod(yearId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ periodId, data }: { periodId: string; data: Parameters<typeof academicApi.updatePeriod>[1] }) =>
      academicApi.updatePeriod(periodId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.periods(yearId) })
      toast.success('Período actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useActivatePeriod(yearId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (periodId: string) => academicApi.activatePeriod(periodId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: academicKeys.periods(yearId) })
      toast.success('Período activado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useSetPeriodClosure(yearId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ periodId, isClosed }: { periodId: string; isClosed: boolean }) =>
      academicApi.setPeriodClosure(periodId, isClosed),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: academicKeys.periods(yearId) })
      toast.success(vars.isClosed ? 'Período cerrado' : 'Período reabierto')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Parallels ----

export function useParallels(yearId?: string) {
  return useQuery({
    queryKey: academicKeys.parallels(yearId),
    queryFn: () => academicApi.getParallels(yearId),
  })
}

export function useCreateParallel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: academicApi.createParallel,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parallels'] })
      toast.success('Paralelo creado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useUpdateParallel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof academicApi.updateParallel>[1] }) =>
      academicApi.updateParallel(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parallels'] })
      toast.success('Paralelo actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Course Assignments ----

export function useCourseAssignments(params?: Record<string, string>) {
  return useQuery({
    queryKey: academicKeys.assignments(params),
    queryFn: () => academicApi.getAssignments(params),
  })
}

export function useCreateAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: academicApi.createAssignment,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-assignments'] })
      toast.success('Asignación creada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useDeleteAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => academicApi.deleteAssignment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course-assignments'] })
      toast.success('Asignación eliminada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

export function useAssignmentWorkload(assignmentId: string | undefined) {
  return useQuery({
    queryKey: ['course-assignment-workload', assignmentId],
    queryFn: () => academicApi.getAssignmentWorkload(assignmentId!),
    enabled: !!assignmentId,
  })
}

export function useUpdateWeeklyPeriodsOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, weeklyPeriodsOverride }: { id: string; weeklyPeriodsOverride: number | null }) =>
      academicApi.updateWeeklyPeriodsOverride(id, weeklyPeriodsOverride),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ['course-assignment-workload', id] })
      toast.success('Carga horaria institucional actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Period Schemes ----

export function usePeriodSchemes() {
  return useQuery({
    queryKey: academicKeys.schemes,
    queryFn: academicApi.getSchemes,
  })
}
