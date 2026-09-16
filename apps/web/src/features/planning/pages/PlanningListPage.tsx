import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { NotebookPen, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { usePlans, useCreatePlan } from '../hooks/usePlanning'
import type { CurriculumPlan } from '../api/planning.api'

/**
 * Indicador de completitud del plan — SIEMPRE derivado del estado real de sus
 * LearningSituation hijas (nunca de CurriculumPlan.status, que quedaba
 * desconectado y mostraba "Aprobado" con situaciones en "Borrador" — el bug
 * reportado). "Completo" solo si hay al menos una situación y TODAS están
 * "listo"; "En progreso" si hay mezcla de listas/borrador; "Sin empezar" si no
 * hay ninguna o todas están en borrador.
 */
type PlanProgress = 'sin-empezar' | 'en-progreso' | 'completo'

const PROGRESS_LABEL: Record<PlanProgress, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  'sin-empezar': { label: 'Sin empezar', variant: 'secondary' },
  'en-progreso': { label: 'En progreso', variant: 'warning' },
  completo: { label: 'Completo', variant: 'success' },
}

function getPlanProgress(plan: CurriculumPlan): { progress: PlanProgress; ready: number; total: number } {
  const total = plan._count?.situations ?? 0
  const ready = plan.situations?.filter((s) => s.status === 'listo').length ?? 0
  if (total === 0) return { progress: 'sin-empezar', ready, total }
  if (ready === total) return { progress: 'completo', ready, total }
  if (ready === 0) return { progress: 'sin-empezar', ready, total }
  return { progress: 'en-progreso', ready, total }
}

export function PlanningListPage() {
  const navigate = useNavigate()
  const { assignments, defaultAssignmentId } = useTeacherDefaults()
  const assignmentIds = React.useMemo(() => assignments.map((a) => a.id), [assignments])
  const { data: planningModel } = usePlanningModel()
  // "PCA" es terminología del modelo por destrezas (Currículo Priorizado MINEDUC).
  // El modelo por competencias (CNC) no usa ese nombre — TIGA lo llama directamente
  // "Planificación por Competencias".
  const planLabel = planningModel === 'competencias' ? 'Planificación por Competencias' : 'PCA'

  const { data: plans = [], isLoading } = usePlans(assignmentIds)
  const createPlan = useCreatePlan()

  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState(defaultAssignmentId)
  React.useEffect(() => {
    if (!selectedAssignmentId && defaultAssignmentId) setSelectedAssignmentId(defaultAssignmentId)
  }, [defaultAssignmentId])

  const assignmentsWithoutPlan = assignments.filter(
    (a) => !plans.some((p) => p.courseAssignmentId === a.id),
  )

  const handleCreate = () => {
    if (!selectedAssignmentId) return
    createPlan.mutate(
      { courseAssignmentId: selectedAssignmentId },
      { onSuccess: (plan) => navigate(`/planning/${plan.id}`) },
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Planificaciones</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {planningModel === 'competencias'
              ? 'Planificación por Competencias (CNC) por asignación de curso, con sus situaciones de aprendizaje'
              : 'PCA (Planificación Curricular Anual) por asignación de curso, con sus unidades PUD'}
          </p>
        </div>
      </div>

      {assignmentsWithoutPlan.length > 0 && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 sm:max-w-xs">
            <label className="mb-1 block text-xs font-medium">Crear {planLabel} para</label>
            <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona una asignación" />
              </SelectTrigger>
              <SelectContent>
                {assignmentsWithoutPlan.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.subject?.name ?? a.subjectName} — {a.parallel?.level.name} {a.parallel?.name ?? a.parallelName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCreate} disabled={!selectedAssignmentId} loading={createPlan.isPending}>
            <Plus className="h-4 w-4" />
            Crear {planLabel}
          </Button>
        </Card>
      )}

      {isLoading ? (
        <PageLoader />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Sin planificaciones"
          description={`Crea el ${planLabel} de una de tus asignaciones para empezar.`}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => {
            const { progress, ready, total } = getPlanProgress(plan)
            return (
              <Card
                key={plan.id}
                className="cursor-pointer p-4 transition hover:border-primary/50 hover:shadow-sm"
                onClick={() => navigate(`/planning/${plan.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{plan.courseAssignment?.subject.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {plan.courseAssignment?.parallel.level.name} {plan.courseAssignment?.parallel.name}
                    </p>
                  </div>
                  <Badge variant={PROGRESS_LABEL[progress].variant}>{PROGRESS_LABEL[progress].label}</Badge>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  {total === 0 ? 'Sin situaciones de aprendizaje' : `${ready} de ${total} situación(es) lista(s)`}
                </p>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
