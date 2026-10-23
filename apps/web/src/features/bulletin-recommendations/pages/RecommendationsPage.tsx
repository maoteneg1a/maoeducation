import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MessageSquareText, Save } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Card } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { apiGet, apiPut } from '@/shared/lib/api-client'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { useAcademicYears, useCourseAssignments, useParallels, usePeriods } from '@/features/academic/hooks/useAcademic'

interface RecommendationRow {
  studentId: string
  name: string
  text: string
  updatedAt: string | null
}

const GENERAL = 'general'

/**
 * Recomendaciones del informe de aprendizajes por parcial (Acuerdo 2026-00082-A, art. 39).
 * El tutor registra la recomendación general; cada docente, la de su asignatura.
 */
export function RecommendationsPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { hasAnyRole } = usePermissions()
  const isAuthority = hasAnyRole('admin', 'rector')

  const { data: years = [] } = useAcademicYears()
  const [yearId, setYearId] = React.useState('')
  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [years, yearId])

  const { data: allParallels = [] } = useParallels(yearId || undefined)
  const { data: periods = [] } = usePeriods(yearId)
  const { data: yearAssignments = [] } = useCourseAssignments(yearId ? { yearId } : undefined)

  const parallels = React.useMemo(() => {
    if (isAuthority) return allParallels
    const taught = new Set(yearAssignments.filter((a) => a.teacherId === user?.id).map((a) => a.parallelId))
    return allParallels.filter((p) => p.tutorId === user?.id || taught.has(p.id))
  }, [allParallels, yearAssignments, isAuthority, user])

  const [parallelId, setParallelId] = React.useState('')
  const [periodId, setPeriodId] = React.useState('')
  const [scopeKey, setScopeKey] = React.useState('')
  React.useEffect(() => { setParallelId(''); setPeriodId(''); setScopeKey('') }, [yearId])
  React.useEffect(() => {
    if (!periodId && periods.length) setPeriodId(periods.find((p) => p.isActive)?.id ?? periods[0].id)
  }, [periods, periodId])

  const parallel = parallels.find((p) => p.id === parallelId)
  const scopes = React.useMemo(() => {
    if (!parallel) return []
    const list: Array<{ value: string; label: string }> = []
    if (isAuthority || parallel.tutorId === user?.id) list.push({ value: GENERAL, label: 'Recomendación general (tutor)' })
    for (const a of yearAssignments.filter((x) => x.parallelId === parallel.id)) {
      if (isAuthority || a.teacherId === user?.id) {
        list.push({ value: a.id, label: a.subject?.name ?? a.subjectName ?? 'Asignatura' })
      }
    }
    return list
  }, [parallel, yearAssignments, isAuthority, user])
  React.useEffect(() => {
    if (scopes.length && !scopes.some((s) => s.value === scopeKey)) setScopeKey(scopes[0].value)
    if (!scopes.length) setScopeKey('')
  }, [scopes, scopeKey])

  const canLoad = !!parallelId && !!periodId && !!scopeKey
  const queryKey = ['bulletin-recommendations', parallelId, periodId, scopeKey]
  const { data: rows, isLoading } = useQuery({
    queryKey,
    queryFn: () => apiGet<RecommendationRow[]>('bulletin-recommendations', { parallelId, periodId, scopeKey }),
    enabled: canLoad,
  })

  const [texts, setTexts] = React.useState<Record<string, string>>({})
  React.useEffect(() => {
    setTexts(Object.fromEntries((rows ?? []).map((r) => [r.studentId, r.text])))
  }, [rows])
  const dirty = (rows ?? []).some((r) => (texts[r.studentId] ?? '') !== r.text)

  const save = useMutation({
    mutationFn: () =>
      apiPut<RecommendationRow[]>('bulletin-recommendations', {
        parallelId,
        periodId,
        scopeKey,
        items: (rows ?? []).map((r) => ({ studentId: r.studentId, text: texts[r.studentId] ?? '' })),
      }),
    onSuccess: (res) => {
      qc.setQueryData(queryKey, res)
      toast.success('Recomendaciones guardadas')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Recomendaciones del informe de aprendizajes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Art. 39 del Acuerdo 2026-00082-A: el informe de cada parcial incluye recomendaciones para promover los aprendizajes y el bienestar integral.
          Se imprimen en la boleta del estudiante.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Año lectivo</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger>
            <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Paralelo</Label>
          <Select value={parallelId} onValueChange={setParallelId}>
            <SelectTrigger><SelectValue placeholder="Paralelo" /></SelectTrigger>
            <SelectContent>
              {parallels.map((p) => <SelectItem key={p.id} value={p.id}>{p.level?.name ?? ''} {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Periodo</Label>
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger><SelectValue placeholder="Periodo" /></SelectTrigger>
            <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Recomendación</Label>
          <Select value={scopeKey} onValueChange={setScopeKey} disabled={!scopes.length}>
            <SelectTrigger><SelectValue placeholder="Alcance" /></SelectTrigger>
            <SelectContent>{scopes.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {!canLoad ? (
        <EmptyState
          icon={MessageSquareText}
          title="Selecciona los filtros"
          description={parallelId && !scopes.length ? 'No eres tutor ni docente de este paralelo.' : 'Elige año, paralelo, periodo y alcance.'}
        />
      ) : isLoading ? (
        <PageLoader />
      ) : !rows?.length ? (
        <EmptyState icon={MessageSquareText} title="Sin estudiantes" description="No hay estudiantes matriculados en este paralelo." />
      ) : (
        <Card className="divide-y">
          {rows.map((r) => (
            <div key={r.studentId} className="grid gap-2 p-3 md:grid-cols-[220px_1fr]">
              <div className="text-sm font-medium">{r.name}</div>
              <Textarea
                rows={2}
                maxLength={2000}
                placeholder="Recomendación para el estudiante y su familia…"
                value={texts[r.studentId] ?? ''}
                onChange={(e) => setTexts((t) => ({ ...t, [r.studentId]: e.target.value }))}
              />
            </div>
          ))}
          <div className="sticky bottom-0 flex items-center justify-end gap-2 bg-background/95 p-3">
            {dirty && <span className="text-xs text-amber-700">Hay cambios sin guardar</span>}
            <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending} loading={save.isPending}>
              <Save className="h-4 w-4" />Guardar recomendaciones
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
