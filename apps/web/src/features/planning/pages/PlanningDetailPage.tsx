import * as React from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Send, CheckCircle2, NotebookPen, Search, Trash2 } from 'lucide-react'
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
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { useCompetenciesForSubject } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { SkillReinforcementPanel } from '@/features/pedagogic-recovery/components/SkillReinforcementPanel'
import { ReinforcementPlansList } from '@/features/pedagogic-recovery/components/ReinforcementPlansList'
import { cn } from '@/shared/lib/utils'
import {
  usePlan,
  useUpdatePlan,
  useSubmitPlan,
  useApprovePlan,
  useSituations,
  useCreateSituation,
  useDeleteSituation,
} from '../hooks/usePlanning'
import type { ApprovalStatus, SituationStatus } from '../api/planning.api'

function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

interface Competency {
  id: string
  code: string
  text: string
}

/**
 * Selección única con buscador — evita desplazarse por listas largas del banco CNC
 * (puede tener 30+ competencias por grado/materia). El panel se renderiza en un portal
 * sobre document.body, posicionado por coordenadas — evita que quede "sobremontado"
 * por tarjetas hermanas que crean su propio stacking context (no basta con z-index
 * cuando el dropdown es position:absolute dentro de un contenedor normal).
 */
function SearchableCompetencyPicker({
  competencies,
  value,
  onChange,
}: {
  competencies: Competency[]
  value: string
  onChange: (id: string) => void
}) {
  const [search, setSearch] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [rect, setRect] = React.useState<{ top: number; left: number; width: number } | null>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const openPanel = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setRect({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width })
    setOpen(true)
  }

  const selected = competencies.find((c) => c.id === value)
  const filtered = React.useMemo(() => {
    const query = normalizeSearch(search.trim())
    if (!query) return competencies
    return competencies.filter((c) => normalizeSearch(c.code).includes(query) || normalizeSearch(c.text).includes(query))
  }, [competencies, search])

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {selected ? (
          <span className="truncate">
            <span className="font-mono text-xs text-muted-foreground">{selected.code}</span> {selected.text}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {competencies.length ? 'Elige la competencia' : 'No hay competencias para este grado'}
          </span>
        )}
      </button>
      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'absolute', top: rect.top, left: rect.left, width: Math.max(rect.width, 320) }}
            className="z-[100] rounded-md border bg-popover p-2 shadow-lg"
          >
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código o texto..."
                className="h-8 pl-7 text-sm"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {filtered.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">Ninguna competencia coincide con la búsqueda.</p>
              )}
              {filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    onChange(c.id)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm transition',
                    c.id === value ? 'bg-primary/10' : 'hover:bg-muted/50',
                  )}
                >
                  <span>
                    <span className="font-mono text-xs text-muted-foreground">{c.code}</span> {c.text}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

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
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'
  // TIGA no tiene un nivel de "plan anual" para el modelo por competencias — todo
  // cuelga directamente de la Situación de Aprendizaje (fechas, contexto, competencia).
  // El "PCA" con objetivos/metodología/bibliografía es terminología exclusiva del
  // modelo por destrezas, calcada del formato oficial del Currículo Priorizado.
  const planLabel = isCompetencyModel ? 'Planificación por Competencias' : 'PCA'

  const { data: plan, isLoading } = usePlan(id)
  const updatePlan = useUpdatePlan(id!)
  const submitPlan = useSubmitPlan(id!)
  const approvePlan = useApprovePlan(id!)

  const { data: situations = [] } = useSituations(id)
  const createSituation = useCreateSituation(id!)
  const deleteSituation = useDeleteSituation(id!)

  const [formData, setFormData] = React.useState<Record<string, unknown>>({})
  React.useEffect(() => {
    if (plan) setFormData(plan.data ?? {})
  }, [plan?.id])

  const { data: periods = [] } = usePeriods(plan?.courseAssignment?.academicYearId ?? '')
  const activePeriod = periods.find((p) => p.isActive) ?? periods[0]

  const [newTitle, setNewTitle] = React.useState('')
  const [newPeriodId, setNewPeriodId] = React.useState('')
  const [newCompetencyId, setNewCompetencyId] = React.useState('')

  // Competencias de la materia del plan — en el modelo CNC el docente solo elige
  // periodo y competencia, y el título/fechas los deriva el backend.
  const subjectId = plan?.courseAssignment?.subject.id
  const subnivel = plan?.courseAssignment?.parallel.level.subnivel ?? undefined
  const { data: competencies = [] } = useCompetenciesForSubject(
    isCompetencyModel ? subjectId : undefined,
    isCompetencyModel ? subnivel : undefined,
  )

  if (isLoading) return <PageLoader />
  if (!plan) return <EmptyState icon={NotebookPen} title="Planificación no encontrada" />

  const isEditable = plan.status === 'borrador'

  // En competencias basta periodo + competencia; en destrezas sigue pidiendo título.
  const canCreateSituation = isCompetencyModel
    ? !!newPeriodId && !!newCompetencyId
    : !!newTitle.trim() && !!newPeriodId

  const handleCreateSituation = () => {
    if (!canCreateSituation) return
    createSituation.mutate(
      {
        planId: plan.id,
        academicPeriodId: newPeriodId,
        // Sin título: el backend lo deriva de la competencia. Mandar '' lo
        // dejaría vacío en vez de disparar la derivación.
        ...(isCompetencyModel
          ? { competencyIds: [newCompetencyId] }
          : { title: newTitle.trim() }),
      },
      {
        onSuccess: (situation) => {
          setNewTitle('')
          setNewCompetencyId('')
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
            {planLabel} — {plan.courseAssignment?.subject.name}
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
        {isCompetencyModel ? (
          <>
            La Planificación por Competencias (CNC) no tiene un plan anual de texto libre — cada bloque de
            trabajo se define directamente en <strong>"Situaciones de aprendizaje"</strong> más abajo, con su
            competencia, fechas y semanas.
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
            disabled={!isEditable}
          />
        )}
        {isCompetencyModel && (
          <p className="text-sm text-muted-foreground">
            Nada que llenar aquí — usa el botón de abajo para enviar este bloque a aprobación cuando tengas listas
            sus situaciones de aprendizaje.
          </p>
        )}

        {isEditable && (
          <div className={isCompetencyModel ? 'mt-4 flex justify-end gap-2' : 'mt-4 flex justify-end gap-2 border-t pt-4'}>
            {!isCompetencyModel && (
              <Button variant="outline" onClick={() => updatePlan.mutate({ data: formData })} loading={updatePlan.isPending}>
                Guardar borrador
              </Button>
            )}
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
              Aprobar {planLabel}
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
            {isCompetencyModel ? (
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-xs font-medium">Competencia específica</label>
                <SearchableCompetencyPicker
                  competencies={competencies}
                  value={newCompetencyId}
                  onChange={setNewCompetencyId}
                />
              </div>
            ) : (
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium">Título de la situación de aprendizaje</label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ej: Voces del mundo digital" />
              </div>
            )}
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
