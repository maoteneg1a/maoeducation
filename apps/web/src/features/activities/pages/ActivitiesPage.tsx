import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import {
  Plus,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  BookOpen,
  MoreHorizontal,
  ChevronRight,
  Layers,
  GraduationCap,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/shared/components/ui/dropdown-menu'
import { TeacherInsumoDialog } from '../components/TeacherInsumoDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { formatDate, getErrorMessage, todayLocalISO } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { activitiesApi, type Activity, type ActivityType, type Insumo } from '../api/activities.api'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { usePlannedSkills, usePlannedCompetencies } from '@/features/planning/hooks/usePlanning'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { useGradingConfig } from '@/features/settings/hooks/useSettings'

// ---- Query keys ----
const activityKeys = {
  types: ['activity-types'] as const,
  insumos: (cid: string, pid: string) => ['insumos', cid, pid] as const,
  activities: (cid: string, pid: string) => ['activities', cid, pid] as const,
}

// ---- Hooks ----
function useActivityTypes() {
  return useQuery({ queryKey: activityKeys.types, queryFn: activitiesApi.getTypes })
}

function useInsumos(courseAssignmentId: string, periodId: string) {
  return useQuery({
    queryKey: activityKeys.insumos(courseAssignmentId, periodId),
    queryFn: () => activitiesApi.getInsumos(courseAssignmentId, periodId),
    enabled: !!courseAssignmentId && !!periodId,
  })
}

function useActivities(courseAssignmentId: string, periodId: string) {
  return useQuery({
    queryKey: activityKeys.activities(courseAssignmentId, periodId),
    queryFn: () => activitiesApi.getActivities({ courseAssignmentId, periodId }),
    enabled: !!courseAssignmentId && !!periodId,
  })
}

function useCreateActivity(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: activitiesApi.createActivity,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.activities(courseAssignmentId, periodId) })
      qc.invalidateQueries({ queryKey: ['grades-grid', courseAssignmentId, periodId] })
      toast.success('Actividad creada correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useUpdateActivity(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof activitiesApi.updateActivity>[1] }) =>
      activitiesApi.updateActivity(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.activities(courseAssignmentId, periodId) })
      qc.invalidateQueries({ queryKey: ['grades-grid', courseAssignmentId, periodId] })
      toast.success('Actividad actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function usePublishActivity(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) =>
      activitiesApi.publishActivity(id, isPublished),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.activities(courseAssignmentId, periodId) })
      qc.invalidateQueries({ queryKey: ['grades-grid', courseAssignmentId, periodId] })
      toast.success('Estado de publicación actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useDeleteActivity(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activitiesApi.deleteActivity(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.activities(courseAssignmentId, periodId) })
      toast.success('Actividad eliminada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useCreateInsumo(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: activitiesApi.createInsumo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.insumos(courseAssignmentId, periodId) })
      toast.success('Insumo creado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useUpdateInsumo(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof activitiesApi.updateInsumo>[1] }) =>
      activitiesApi.updateInsumo(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.insumos(courseAssignmentId, periodId) })
      toast.success('Insumo actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useDeleteInsumo(courseAssignmentId: string, periodId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => activitiesApi.deleteInsumo(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: activityKeys.insumos(courseAssignmentId, periodId) })
      qc.invalidateQueries({ queryKey: activityKeys.activities(courseAssignmentId, periodId) })
      toast.success('Insumo eliminado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Schemas ----

const activitySchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  activityTypeId: z.string().min(1, 'El tipo es requerido'),
  insumoId: z.string().optional(),
  curriculumSkillId: z.string().optional(),
  competencyId: z.string().optional(),
  maxScore: z.coerce.number().min(0, 'Debe ser un número positivo'),
  activityDate: z.string().min(1, 'La fecha es requerida'),
  description: z.string().optional(),
})
type ActivityFormValues = z.infer<typeof activitySchema>

const insumoSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  weight: z.coerce.number().min(0).max(100).optional(),
  sortOrder: z.coerce.number().min(0).optional(),
})
type InsumoFormValues = z.infer<typeof insumoSchema>

// ---- Insumo Manager ----

interface InsumoManagerProps {
  insumos: Insumo[]
  courseAssignmentId: string
  periodId: string
  canWrite: boolean
}

function InsumoManager({ insumos, courseAssignmentId, periodId, canWrite }: InsumoManagerProps) {
  const createInsumo = useCreateInsumo(courseAssignmentId, periodId)
  const updateInsumo = useUpdateInsumo(courseAssignmentId, periodId)
  const deleteInsumo = useDeleteInsumo(courseAssignmentId, periodId)

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Insumo | null>(null)

  const form = useForm<InsumoFormValues>({
    resolver: zodResolver(insumoSchema),
    defaultValues: { name: '', weight: undefined, sortOrder: insumos.length },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', weight: undefined, sortOrder: insumos.length })
    setOpen(true)
  }

  function openEdit(insumo: Insumo) {
    setEditing(insumo)
    form.reset({ name: insumo.name, weight: insumo.weight ?? undefined, sortOrder: insumo.sortOrder })
    setOpen(true)
  }

  function onSubmit(values: InsumoFormValues) {
    const payload = {
      name: values.name,
      weight: values.weight ?? null,
      sortOrder: values.sortOrder ?? insumos.length,
      courseAssignmentId,
      academicPeriodId: periodId,
    }
    if (editing) {
      updateInsumo.mutate({ id: editing.id, data: { ...payload, weight: payload.weight ?? undefined } }, { onSuccess: () => setOpen(false) })
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createInsumo.mutate(payload as any, { onSuccess: () => setOpen(false) })
    }
  }

  async function handleDelete(insumo: Insumo) {
    const ok = await confirmDialog({
      title: `¿Eliminar el insumo "${insumo.name}"?`,
      description: 'Solo se puede eliminar si no tiene actividades asignadas. Si las tiene, primero muévelas a otro insumo.',
      confirmText: 'Eliminar',
      destructive: true,
    })
    if (ok) deleteInsumo.mutate(insumo.id)
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Insumos del período</span>
          <span className="text-xs text-muted-foreground">{insumos.length} configurados</span>
        </div>
        {canWrite && (
          <Button size="sm" variant="outline" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Agregar insumo
          </Button>
        )}
      </div>

      {insumos.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">
          {canWrite
            ? 'Sin insumos configurados. Ve a Configuración → Insumos por paralelo para definirlos.'
            : 'Sin insumos configurados para este período. Contacta al administrador.'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {insumos.map((ins) => (
            <div
              key={ins.id}
              className="flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-xs"
            >
              <span className="font-medium">{ins.name}</span>
              {ins.weight != null && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {ins.weight}%
                </Badge>
              )}
              {canWrite && (
                <>
                  <button
                    type="button"
                    onClick={() => openEdit(ins)}
                    className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(ins)}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar insumo' : 'Nuevo insumo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input {...form.register('name')} placeholder="Ej: Deberes, Lecciones, Trabajos..." />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Peso % (opcional)</Label>
                <Input type="number" min={0} max={100} {...form.register('weight')} placeholder="Ej: 40" />
                {form.formState.errors.weight && (
                  <p className="text-xs text-destructive">{form.formState.errors.weight.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Orden</Label>
                <Input type="number" min={0} {...form.register('sortOrder')} placeholder="0" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" loading={createInsumo.isPending || updateInsumo.isPending}>
                {editing ? 'Guardar' : 'Crear'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---- Compact activity row ----
interface ActivityRowProps {
  activity: Activity
  types: ActivityType[]
  onEdit: (activity: Activity) => void
  onTogglePublish: (id: string, isPublished: boolean) => void
  onDelete: (id: string) => void
  isPublishing: boolean
  isDeleting: boolean
}

function ActivityRow({ activity, types, onEdit, onTogglePublish, onDelete, isPublishing, isDeleting }: ActivityRowProps) {
  const type = types.find((entry) => entry.id === activity.activityTypeId)
  const busy = isPublishing || isDeleting
  return <div className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/20 sm:flex-nowrap">
    <div className="min-w-0 flex-1 basis-40">
      <p className="break-words text-sm font-medium">{activity.name}</p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {type && <span>{type.name}</span>}<span>{formatDate(activity.activityDate)}</span><span>Sobre {activity.maxScore}</span>
        <span>{activity._count?.grades ?? 0} calificaciones</span>
      </div>
    </div>
    <Badge variant={activity.isPublished ? 'success' : 'secondary'}>{activity.isPublished ? 'Publicado' : 'Borrador'}</Badge>
    <Button asChild size="sm" variant="outline"><Link to={`/grades?assignmentId=${activity.courseAssignmentId}&periodId=${activity.academicPeriodId}&activityId=${activity.id}`}><GraduationCap className="h-4 w-4" />Calificar</Link></Button>
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busy} aria-label={`Opciones de ${activity.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={() => onEdit(activity)}><Edit2 />Editar actividad</DropdownMenuItem>
      <DropdownMenuItem disabled={busy} onSelect={() => onTogglePublish(activity.id, !activity.isPublished)}>{activity.isPublished ? <EyeOff /> : <Eye />}{activity.isPublished ? 'Ocultar a estudiantes' : 'Publicar a estudiantes'}</DropdownMenuItem>
      <DropdownMenuSeparator /><DropdownMenuItem disabled={busy} className="text-destructive focus:text-destructive" onSelect={() => onDelete(activity.id)}><Trash2 />Eliminar actividad</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
  </div>
}

// ---- Main Page ----

export function ActivitiesPage() {
  const isPersonalAccount = useAuthStore((s) => s.user?.institution?.accountType === 'personal')
  const { hasPermission } = usePermissions()
  // El profesor gestiona los insumos de SUS materias (insumos:write:own);
  // el admin también (insumos:write:all / academic_config:manage).
  const canWriteInsumos = hasPermission('insumos:write') || hasPermission('academic_config:manage')

  const { assignments, periods, defaultAssignmentId, defaultPeriodId } = useTeacherDefaults()

  const userId = useAuthStore((state) => state.user?.id)
  const ownAssignments = assignments.filter((assignment) => assignment.teacherId === userId && assignment.isActive)
  const [bulkInsumos, setBulkInsumos] = React.useState(false)
  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState('')
  const [selectedPeriodId, setSelectedPeriodId] = React.useState('')

  // Apply defaults once they're available
  React.useEffect(() => {
    if (defaultAssignmentId && !selectedAssignmentId) setSelectedAssignmentId(defaultAssignmentId)
  }, [defaultAssignmentId])

  React.useEffect(() => {
    if (defaultPeriodId && selectedAssignmentId && !selectedPeriodId) setSelectedPeriodId(defaultPeriodId)
  }, [defaultPeriodId, selectedAssignmentId])
  const { data: types = [] } = useActivityTypes()
  const { data: insumos = [] } = useInsumos(selectedAssignmentId, selectedPeriodId)
  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId)
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'
  const { data: plannedSkills = [] } = usePlannedSkills(selectedAssignmentId, selectedPeriodId)
  const { data: plannedCompetencies = [] } = usePlannedCompetencies(selectedAssignmentId, selectedPeriodId)
  const { data: activities = [], isLoading: activitiesLoading } = useActivities(
    selectedAssignmentId,
    selectedPeriodId,
  )
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10

  const createActivity = useCreateActivity(selectedAssignmentId, selectedPeriodId)
  const updateActivity = useUpdateActivity(selectedAssignmentId, selectedPeriodId)
  const publishActivity = usePublishActivity(selectedAssignmentId, selectedPeriodId)
  const deleteActivity = useDeleteActivity(selectedAssignmentId, selectedPeriodId)

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Activity | null>(null)

  const form = useForm<ActivityFormValues>({
    resolver: zodResolver(activitySchema),
    defaultValues: {
      name: '',
      activityTypeId: '',
      insumoId: '',
      curriculumSkillId: '',
      competencyId: '',
      maxScore: gradingScaleMax,
      activityDate: todayLocalISO(),
      description: '',
    },
  })

  function openCreate(insumoId = '') {
    setEditing(null)
    form.reset({
      name: '',
      activityTypeId: '',
      insumoId,
      curriculumSkillId: '',
      competencyId: '',
      maxScore: gradingScaleMax,
      activityDate: todayLocalISO(),
      description: '',
    })
    setOpen(true)
  }

  function openEdit(activity: Activity) {
    setEditing(activity)
    form.reset({
      name: activity.name,
      activityTypeId: activity.activityTypeId,
      insumoId: activity.insumoId ?? '',
      curriculumSkillId: activity.curriculumSkillId ?? '',
      competencyId: activity.competencyId ?? '',
      maxScore: activity.maxScore,
      activityDate: activity.activityDate,
      description: activity.description ?? '',
    })
    setOpen(true)
  }

  function onSubmit(values: ActivityFormValues) {
    const payload = {
      ...values,
      insumoId: values.insumoId || undefined,
      curriculumSkillId: values.curriculumSkillId || undefined,
      competencyId: values.competencyId || undefined,
      courseAssignmentId: selectedAssignmentId,
      academicPeriodId: selectedPeriodId,
    }
    if (editing) {
      updateActivity.mutate({ id: editing.id, data: payload }, { onSuccess: () => setOpen(false) })
    } else {
      createActivity.mutate(payload, { onSuccess: () => setOpen(false) })
    }
  }

  async function handleDelete(id: string) {
    const ok = await confirmDialog({
      title: '¿Eliminar esta actividad?',
      description: 'Solo se puede eliminar si todavía no tiene notas registradas. Esta acción no se puede deshacer.',
      confirmText: 'Eliminar',
      destructive: true,
    })
    if (ok) deleteActivity.mutate(id)
  }

  // Group activities by insumo
  const grouped = React.useMemo(() => {
    const map = new Map<string, Activity[]>()
    const noInsumo: Activity[] = []
    for (const act of activities) {
      if (act.insumoId && insumos.some((insumo) => insumo.id === act.insumoId)) {
        const arr = map.get(act.insumoId) ?? []
        arr.push(act)
        map.set(act.insumoId, arr)
      } else {
        noInsumo.push(act)
      }
    }
    return { map, noInsumo }
  }, [activities, insumos])

  const canCreate = !!selectedAssignmentId && !!selectedPeriodId

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Insumos</h1>
          <p className="text-muted-foreground text-sm mt-1">Organiza tus insumos de evaluación. Cada insumo puede contener una o varias actividades.</p>
        </div>
        <div className="flex flex-wrap gap-2">{canWriteInsumos && ownAssignments.length > 0 && <Button variant="outline" onClick={() => setBulkInsumos(true)}>Crear insumos en mis materias</Button>}<Button onClick={() => openCreate()} disabled={!canCreate}>
          <Plus className="h-4 w-4" />
          Nueva actividad
        </Button></div>
      </div>

      {isPersonalAccount && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">Personaliza tus clases, incluso fuera de la malla curricular.</p>
          <Button variant="outline" size="sm" asChild><Link to="/settings/mis-grados">Crear materias y grados</Link></Button>
          <Button variant="outline" size="sm" asChild><Link to="/academic/years">Años lectivos y períodos</Link></Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-64">
          <Select value={selectedAssignmentId} onValueChange={(v) => { setSelectedAssignmentId(v); setSelectedPeriodId('') }}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar asignación" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.subject?.name ?? a.subjectName ?? a.subjectId} — {a.parallel?.level?.name ? `${a.parallel.level.name} ${a.parallel.name}` : (a.parallelName ?? a.parallelId)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={selectedPeriodId}
            onValueChange={setSelectedPeriodId}
            disabled={!selectedAssignmentId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar período" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!canCreate ? (
        <EmptyState
          icon={BookOpen}
          title="Selecciona una asignación y período"
          description="Para ver y gestionar actividades, selecciona la asignación y el período académico"
        />
      ) : (
        <div className="space-y-4">
          {canWriteInsumos && <details className="rounded-lg border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">Configurar categorías (insumos)</summary><InsumoManager insumos={insumos} courseAssignmentId={selectedAssignmentId} periodId={selectedPeriodId} canWrite={canWriteInsumos} /></details>}
          {activitiesLoading ? <PageLoader /> : <div className="space-y-4">
            {[...insumos.map((insumo) => ({ id: insumo.id, name: insumo.name, activities: grouped.map.get(insumo.id) ?? [] })),
              ...(grouped.noInsumo.length || !insumos.length ? [{ id: '', name: 'Sin categoría asignada', activities: grouped.noInsumo }] : [])].map((group) => <details key={group.id || 'none'} open={group.activities.length > 0} className="group overflow-hidden rounded-xl border border-blue-100 dark:border-blue-900/50">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-3 bg-blue-50/70 px-4 py-3 [&::-webkit-details-marker]:hidden dark:bg-blue-950/20">
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" /><Layers className="h-4 w-4 text-primary" />
                <span className="font-semibold">{group.name}</span><span className="text-xs text-muted-foreground">{group.activities.length} actividades</span>
                <Button size="sm" variant="outline" className="ml-auto" onClick={(event) => { event.preventDefault(); event.stopPropagation(); openCreate(group.id) }}><Plus className="h-3.5 w-3.5" />Nueva actividad</Button>
              </summary>
              <div className="divide-y border-t">{group.activities.length ? group.activities.map((activity) => <ActivityRow key={activity.id} activity={activity} types={types} onEdit={openEdit} onTogglePublish={(id, isPublished) => publishActivity.mutate({ id, isPublished })} onDelete={handleDelete} isPublishing={publishActivity.isPending} isDeleting={deleteActivity.isPending} />) : <p className="px-4 py-5 text-sm text-muted-foreground">Sin actividades. Crea la primera desde esta categoría.</p>}</div>
            </details>)}
          </div>}
        </div>
      )}

      {bulkInsumos && <TeacherInsumoDialog assignments={ownAssignments} periods={periods} initialPeriodId={selectedPeriodId || defaultPeriodId} initialNames={insumos.map((insumo) => insumo.name)} onClose={() => setBulkInsumos(false)} />}

      {/* Activity Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Actividad' : 'Nueva Actividad'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input {...form.register('name')} placeholder="Ej: Prueba de diagnóstico" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de actividad</Label>
                <Select
                  value={form.watch('activityTypeId')}
                  onValueChange={(v) => form.setValue('activityTypeId', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.filter((t) => t.isActive).map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Examen y Proyecto se calculan en la evaluación sumativa. Los demás tipos se calculan en la formativa; para un avance de proyecto, elige el tipo formativo correspondiente.</p>
                {form.formState.errors.activityTypeId && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.activityTypeId.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Puntaje máximo</Label>
                <Input type="number" {...form.register('maxScore')} placeholder="10" />
                {form.formState.errors.maxScore && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.maxScore.message}
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" {...form.register('activityDate')} />
                {form.formState.errors.activityDate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.activityDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Categoría (insumo)</Label>
                <Select
                  value={form.watch('insumoId') ?? ''}
                  onValueChange={(v) => form.setValue('insumoId', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguno" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguno</SelectItem>
                    {insumos.map((ins) => (
                      <SelectItem key={ins.id} value={ins.id}>
                        {ins.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {isCompetencyModel ? (
              <div className="space-y-2">
                <Label>Competencia planificada (opcional)</Label>
                <Select
                  value={form.watch('competencyId') ?? ''}
                  onValueChange={(v) => form.setValue('competencyId', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {plannedCompetencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.text.slice(0, 60)}
                        {c.text.length > 60 ? '…' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {plannedCompetencies.length === 0
                    ? 'Aún no hay competencias planificadas para este curso y periodo — ve a Planificación y agrega semanas primero.'
                    : 'Vincula esta actividad a una competencia planificada para habilitar la detección automática de refuerzo.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Destreza planificada (opcional)</Label>
                <Select
                  value={form.watch('curriculumSkillId') ?? ''}
                  onValueChange={(v) => form.setValue('curriculumSkillId', v === 'none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Ninguna" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Ninguna</SelectItem>
                    {plannedSkills.map((skill) => (
                      <SelectItem key={skill.id} value={skill.id}>
                        {skill.code} — {skill.description.slice(0, 60)}
                        {skill.description.length > 60 ? '…' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {plannedSkills.length === 0
                    ? 'Aún no hay destrezas planificadas para este curso y periodo — ve a Planificación y agrega semanas primero.'
                    : 'Vincula esta actividad a una destreza planificada para habilitar la detección automática de refuerzo.'}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input {...form.register('description')} placeholder="Descripción de la actividad" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={createActivity.isPending || updateActivity.isPending}
              >
                {editing ? 'Guardar cambios' : 'Crear actividad'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
