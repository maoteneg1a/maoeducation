import * as React from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Send, CheckCircle2, NotebookPen } from 'lucide-react'
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
import { usePermissions } from '@/shared/hooks/usePermissions'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { SkillReinforcementPanel } from '@/features/pedagogic-recovery/components/SkillReinforcementPanel'
import { ReinforcementPlansList } from '@/features/pedagogic-recovery/components/ReinforcementPlansList'
import {
  usePlan,
  useUpdatePlan,
  useSubmitPlan,
  useApprovePlan,
  useSituations,
  useCreateSituation,
} from '../hooks/usePlanning'
import type { ApprovalStatus, SituationStatus } from '../api/planning.api'

const PCA_STATUS_LABEL: Record<ApprovalStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'Enviado', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'success' },
}

const SITUATION_STATUS_LABEL: Record<SituationStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'Enviado', variant: 'warning' },
  revisado: { label: 'Revisado', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'success' },
}

export function PlanningDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canApprove = hasPermission('planning:manage')

  const { data: plan, isLoading } = usePlan(id)
  const updatePlan = useUpdatePlan(id!)
  const submitPlan = useSubmitPlan(id!)
  const approvePlan = useApprovePlan(id!)

  const { data: situations = [] } = useSituations(id)
  const createSituation = useCreateSituation(id!)

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  React.useEffect(() => {
    if (plan) setFormData(plan.data ?? {})
  }, [plan?.id])

  const { data: periods = [] } = usePeriods(plan?.courseAssignment?.academicYearId ?? '')
  const activePeriod = periods.find((p) => p.isActive) ?? periods[0]

  const [newTitle, setNewTitle] = React.useState('')
  const [newPeriodId, setNewPeriodId] = React.useState('')

  if (isLoading) return <PageLoader />
  if (!plan) return <EmptyState icon={NotebookPen} title="PCA no encontrado" />

  const isEditable = plan.status === 'borrador'

  const handleCreateSituation = () => {
    if (!newTitle.trim() || !newPeriodId) return
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/planning" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Planificaciones
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            PCA — {plan.courseAssignment?.subject.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {plan.courseAssignment?.parallel.level.name} {plan.courseAssignment?.parallel.name}
          </p>
        </div>
        <Badge variant={PCA_STATUS_LABEL[plan.status].variant}>{PCA_STATUS_LABEL[plan.status].label}</Badge>
      </div>

      {activePeriod && (
        <>
          <SkillReinforcementPanel courseAssignmentId={plan.courseAssignmentId} academicPeriodId={activePeriod.id} />
          <ReinforcementPlansList
            courseAssignmentId={plan.courseAssignmentId}
            academicPeriodId={activePeriod.id}
            parallelId={plan.courseAssignment?.parallel.id}
          />
        </>
      )}

      <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        Este es el plan anual general (PCA) — se llena una sola vez con lo básico. Lo que usarás cada semana
        (destrezas, saberes, actividades con IA) está más abajo, en <strong>"Situaciones de aprendizaje"</strong>.
      </div>

      <Card className="p-4 sm:p-6">
        {plan.template?.schema ? (
          <DynamicForm
            schema={plan.template.schema}
            values={formData}
            onChange={(key, value) => setFormData((prev) => ({ ...prev, [key]: value }))}
            disabled={!isEditable}
          />
        ) : null}

        {isEditable && (
          <div className="mt-4 flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => updatePlan.mutate({ data: formData })} loading={updatePlan.isPending}>
              Guardar borrador
            </Button>
            <Button onClick={() => submitPlan.mutate()} loading={submitPlan.isPending}>
              <Send className="h-4 w-4" />
              Enviar para aprobación
            </Button>
          </div>
        )}
        {plan.status === 'enviado' && canApprove && (
          <div className="mt-4 flex justify-end border-t pt-4">
            <Button onClick={() => approvePlan.mutate()} loading={approvePlan.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Aprobar PCA
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Situaciones de aprendizaje (Planificación Microcurricular)</h2>
        </div>

        {isEditable && (
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
            <Button onClick={handleCreateSituation} disabled={!newTitle.trim() || !newPeriodId} loading={createSituation.isPending}>
              <Plus className="h-4 w-4" />
              Crear
            </Button>
          </Card>
        )}

        {situations.length === 0 ? (
          <EmptyState
            icon={NotebookPen}
            title="Sin situaciones de aprendizaje"
            description="Crea la primera situación de aprendizaje del trimestre."
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
                  <Badge variant={SITUATION_STATUS_LABEL[situation.status].variant}>
                    {SITUATION_STATUS_LABEL[situation.status].label}
                  </Badge>
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
