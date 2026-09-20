import * as React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, NotebookPen, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { DynamicForm } from '@/shared/components/form/DynamicForm'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import {
  usePlan,
  useUpdatePlan,
  useSituations,
  useCreateSituation,
  useDeleteSituation,
} from '../hooks/usePlanning'
import { DistributionWizard } from '../components/DistributionWizard'
import { AiTokenTipModal } from '@/features/ai-assistant/components/AiTokenTipModal'
import type { SituationStatus } from '../api/planning.api'

// Sin flujo de aprobación por terceros para la Situación de Aprendizaje — solo "Borrador"/"Listo".
const SITUATION_STATUS_LABEL: Record<SituationStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  listo: { label: 'Listo', variant: 'success' },
}

export function PlanningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'
  // TIGA no tiene un nivel de "plan anual" para el modelo por competencias — todo
  // cuelga directamente de la Situación de Aprendizaje (fechas, contexto, competencia).
  // El "PCA" con objetivos/metodología/bibliografía es terminología exclusiva del
  // modelo por destrezas, calcada del formato oficial del Currículo Priorizado.
  const planLabel = isCompetencyModel ? 'Planificación por Competencias' : 'PCA'

  const { data: plan, isLoading } = usePlan(id)
  const updatePlan = useUpdatePlan(id!)

  const { data: situations = [] } = useSituations(id)
  const createSituation = useCreateSituation(id!)
  const deleteSituation = useDeleteSituation(id!)

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  React.useEffect(() => {
    if (plan) setFormData(plan.data ?? {})
  }, [plan?.id])

  const { data: periods = [] } = usePeriods(plan?.courseAssignment?.academicYearId ?? '')

  const [newTitle, setNewTitle] = React.useState('')
  const [newPeriodId, setNewPeriodId] = React.useState('')

  if (isLoading) return <PageLoader />
  if (!plan) return <EmptyState icon={NotebookPen} title="Planificación no encontrada" />

  // El plan padre (PCA/Planificación por Competencias) ya no tiene flujo de
  // aprobación propio — siempre es editable. La única señal de completitud
  // real vive en cada LearningSituation (borrador/listo, ver más abajo).
  // NOTA: esta creación manual (título+periodo) solo aplica al modelo por
  // DESTREZAS. En competencias, la situación se crea desde DistributionWizard
  // (confirm-distribution) — el docente ya no elige competencia a mano.
  const canCreateSituation = !!newTitle.trim() && !!newPeriodId

  const handleCreateSituation = () => {
    if (!canCreateSituation) return
    createSituation.mutate(
      { planId: plan.id, academicPeriodId: newPeriodId, title: newTitle.trim() },
      {
        onSuccess: (situation) => {
          setNewTitle('')
          navigate(`/planning/situations/${situation.id}`)
        },
      },
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <AiTokenTipModal />
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/planning" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Planificaciones
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            {planLabel} — {plan.courseAssignment?.subject.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {plan.courseAssignment?.parallel.level.name} {plan.courseAssignment?.parallel.name}
          </p>
        </div>
      </div>

      {/* Refuerzo/adaptaciones se muestra solo en su propia sección (Refuerzo y
          Adaptaciones), no aquí — mezclaba conceptos con la planificación. */}

      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        {isCompetencyModel ? (
          <>
            La Planificación por Competencias (CNC) no tiene un plan anual de texto libre — elige el periodo y
            cuántas semanas dura más abajo, y el sistema sugiere qué competencias y saberes corresponden a cada
            semana antes de generar el resto.
          </>
        ) : (
          <>
            Este es el plan anual general (PCA) — se llena una sola vez con lo básico. Lo que usarás cada semana
            (destrezas, saberes, actividades con IA) está más abajo, en <strong>"Situaciones de aprendizaje"</strong>.
          </>
        )}
      </div>

      <Card className="p-4 sm:p-6">
        {!isCompetencyModel && plan.template?.schema && (
          <DynamicForm
            schema={plan.template.schema}
            values={formData}
            onChange={(key, value) => setFormData((prev) => ({ ...prev, [key]: value }))}
          />
        )}
        {isCompetencyModel && (
          <p className="text-sm text-muted-foreground">
            Nada que llenar aquí — define las situaciones de aprendizaje más abajo.
          </p>
        )}

        {!isCompetencyModel && (
          <div className="mt-4 flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => updatePlan.mutate({ data: formData })} loading={updatePlan.isPending}>
              Guardar
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            {isCompetencyModel ? 'Planificaciones por periodo' : 'Situaciones de aprendizaje (Planificación Microcurricular)'}
          </h2>
        </div>

        {isCompetencyModel ? (
          plan.courseAssignment?.academicYearId && (
            <DistributionWizard
              courseAssignmentId={plan.courseAssignmentId}
              academicYearId={plan.courseAssignment.academicYearId}
              subjectId={plan.courseAssignment.subject.id}
              subnivel={plan.courseAssignment.parallel.level.subnivel ?? undefined}
              gradeCode={plan.courseAssignment.parallel.level.code}
            />
          )
        ) : (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">Título de la situación de aprendizaje</label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ej: Voces del mundo digital" />
            </div>
            <div className="sm:w-48">
              <label className="mb-1 block text-xs font-medium">Trimestre / periodo</label>
              <Select value={newPeriodId} onValueChange={setNewPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Periodo" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCreateSituation} disabled={!canCreateSituation} loading={createSituation.isPending}>
              <Plus className="h-4 w-4" />
              Crear
            </Button>
          </Card>
        )}

        {situations.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title={isCompetencyModel ? 'Sin planificaciones todavía' : 'Sin situaciones de aprendizaje'}
            description={
              isCompetencyModel
                ? 'Usa el formulario de arriba para generar la primera planificación del periodo.'
                : 'Crea la primera situación de aprendizaje del trimestre.'
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {situations.map((situation) => (
              <Card
                key={situation.id}
                className="cursor-pointer p-4 transition hover:border-primary/50 hover:shadow-sm"
                onClick={() => navigate(`/planning/situations/${situation.id}`)}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{situation.title}</p>
                  <div className="flex items-center gap-1">
                    <Badge variant={SITUATION_STATUS_LABEL[situation.status].variant}>
                      {SITUATION_STATUS_LABEL[situation.status].label}
                    </Badge>
                    {situation.status === 'borrador' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        loading={deleteSituation.isPending && deleteSituation.variables === situation.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (confirm(`¿Eliminar la situación de aprendizaje "${situation.title}"? Esto borra también sus semanas.`)) {
                            deleteSituation.mutate(situation.id)
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {situation.academicPeriod?.name} · {situation._count?.weeks ?? 0} semana(s)
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
