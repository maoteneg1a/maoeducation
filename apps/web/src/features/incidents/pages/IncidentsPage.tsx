import { StudentPicker, preventStudentPickerDialogClose } from '@/shared/components/StudentPicker'
import * as React from 'react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Plus, Edit2, Eye } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
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
import { getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import {
  listIncidents,
  createIncident,
  updateIncident,
  getReportableStudents,
  type Incident,
} from '@/features/incidents/api/incidents.api'

// ---- Labels ----

const SEVERITY_LABELS: Record<string, string> = {
  low: 'Leve',
  medium: 'Moderado',
  high: 'Grave',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

type SeverityVariant = 'secondary' | 'warning' | 'destructive'
type StatusVariant = 'destructive' | 'warning' | 'success' | 'secondary'

const SEVERITY_VARIANT: Record<string, SeverityVariant> = {
  low: 'secondary',
  medium: 'warning',
  high: 'destructive',
}

const STATUS_VARIANT: Record<string, StatusVariant> = {
  open: 'destructive',
  in_review: 'warning',
  resolved: 'success',
  closed: 'secondary',
}

const WORKFLOW_LABELS: Record<string, string> = {
  reportado: 'Reportado',
  en_revision: 'En revisión',
  derivado_dece: 'Derivado al DECE',
  medidas_definidas: 'Medidas definidas',
  acta_firmada: 'Acta firmada',
  en_seguimiento: 'En seguimiento',
  resuelto: 'Resuelto',
  cerrado: 'Cerrado',
}

const WORKFLOW_VARIANT: Record<string, StatusVariant> = {
  reportado: 'destructive',
  en_revision: 'warning',
  derivado_dece: 'warning',
  medidas_definidas: 'warning',
  acta_firmada: 'secondary',
  en_seguimiento: 'warning',
  resuelto: 'success',
  cerrado: 'secondary',
}

// ---- Zod Schemas ----

const createSchema = z.object({
  studentId: z.string().min(1, 'Selecciona un estudiante'),
  incidentDate: z.string().min(1, 'La fecha es requerida'),
  category: z.string().min(1, 'La categoría es requerida'),
  description: z.string().min(1, 'La descripción es requerida'),
  severity: z.enum(['low', 'medium', 'high']).default('low'),
})

const updateSchema = z.object({
  status: z.enum(['open', 'in_review', 'resolved', 'closed']).optional(),
  resolutionNotes: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type UpdateFormValues = z.infer<typeof updateSchema>

// ---- Main Component ----

export function IncidentsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canWrite = hasPermission('incidents:write')

  const [statusFilter, setStatusFilter] = useState('all')
  const [severityFilter, setSeverityFilter] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editIncident, setEditIncident] = useState<Incident | null>(null)

  // ---- Queries ----

  const params = React.useMemo(() => {
    const p: Record<string, string> = {}
    if (statusFilter !== 'all') p.status = statusFilter
    if (severityFilter !== 'all') p.severity = severityFilter
    return p
  }, [statusFilter, severityFilter])

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents', params],
    queryFn: () => listIncidents(params),
  })

  const { data: students = [], isLoading: studentsLoading, isError: studentsError } = useQuery({
    queryKey: ['incidents', 'reportable-students'],
    queryFn: () => getReportableStudents(),
  })

  // ---- Create mutation ----

  const createForm = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { severity: 'low' },
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateFormValues) => createIncident(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incidente registrado correctamente')
      setCreateOpen(false)
      createForm.reset({ severity: 'low' })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  // ---- Update mutation ----

  const updateForm = useForm<UpdateFormValues>({
    resolver: zodResolver(updateSchema),
  })

  const updateMutation = useMutation({
    mutationFn: (data: UpdateFormValues) =>
      updateIncident(editIncident!.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] })
      toast.success('Incidente actualizado correctamente')
      setEditIncident(null)
      updateForm.reset()
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  function handleEditOpen(incident: Incident) {
    setEditIncident(incident)
    updateForm.reset({
      status: incident.status as UpdateFormValues['status'],
      resolutionNotes: incident.resolutionNotes ?? '',
    })
  }

  // ---- Table columns ----

  const columns: ColumnDef<Incident>[] = [
    {
      accessorKey: 'student',
      header: 'Estudiante',
      cell: ({ row }) => {
        const s = row.original.student
        const name = `${s.profile.lastName} ${s.profile.firstName}`
        return (
          <div>
            <p className="font-medium text-sm">{name}</p>
            {s.profile.dni && (
              <p className="text-xs text-muted-foreground">{s.profile.dni}</p>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'category',
      header: 'Categoría',
    },
    {
      accessorKey: 'severity',
      header: 'Severidad',
      cell: ({ row }) => {
        const sev = row.original.severity
        return (
          <Badge variant={SEVERITY_VARIANT[sev] ?? 'secondary'}>
            {SEVERITY_LABELS[sev] ?? sev}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'workflowState',
      header: 'Estado del proceso',
      cell: ({ row }) => {
        const ws = row.original.workflowState
        return (
          <Badge variant={WORKFLOW_VARIANT[ws] ?? 'secondary'}>
            {WORKFLOW_LABELS[ws] ?? ws}
          </Badge>
        )
      },
    },
    {
      accessorKey: 'incidentDate',
      header: 'Fecha',
      cell: ({ row }) => {
        const date = row.original.incidentDate
        const [y, m, d] = date.slice(0, 10).split('-').map(Number)
        return new Intl.DateTimeFormat('es', { day: '2-digit', month: 'short', year: 'numeric' })
          .format(new Date(y, m - 1, d))
      },
    },
    {
      accessorKey: 'reporter',
      header: 'Reportado por',
      cell: ({ row }) => {
        const r = row.original.reporter
        return `${r.profile.lastName} ${r.profile.firstName}`
      },
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/incidents/${row.original.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canWrite && (
            <Button variant="ghost" size="sm" onClick={() => handleEditOpen(row.original)}>
              <Edit2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ]

  // ---- Render ----

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <AlertTriangle className="h-6 w-6" />
            Incidentes Disciplinarios
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Registra y gestiona los incidentes disciplinarios de los estudiantes
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nuevo Incidente
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="w-full sm:w-48">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="open">Abierto</SelectItem>
              <SelectItem value="in_review">En revisión</SelectItem>
              <SelectItem value="resolved">Resuelto</SelectItem>
              <SelectItem value="closed">Cerrado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="Severidad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las severidades</SelectItem>
              <SelectItem value="low">Leve</SelectItem>
              <SelectItem value="medium">Moderado</SelectItem>
              <SelectItem value="high">Grave</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={incidents}
        emptyMessage="No hay incidentes registrados"
        emptyDescription="Registra el primer incidente usando el botón 'Nuevo Incidente'"
      />

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent onEscapeKeyDown={preventStudentPickerDialogClose} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo Incidente Disciplinario</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={createForm.handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="studentId">Estudiante</Label>
              <StudentPicker id="studentId" students={students} value={createForm.watch('studentId') ?? ''}
                onChange={(v) => createForm.setValue('studentId', v, { shouldValidate: true, shouldDirty: true })}
                isLoading={studentsLoading} isError={studentsError} invalid={!!createForm.formState.errors.studentId} />
              {createForm.formState.errors.studentId && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.studentId.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="incidentDate">Fecha del incidente</Label>
              <input
                id="incidentDate"
                type="date"
                {...createForm.register('incidentDate')}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {createForm.formState.errors.incidentDate && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.incidentDate.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category">Categoría</Label>
              <Select
                value={createForm.watch('category') ?? ''}
                onValueChange={(v) => createForm.setValue('category', v)}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Comportamiento">Comportamiento</SelectItem>
                  <SelectItem value="Académico">Académico</SelectItem>
                  <SelectItem value="Puntualidad">Puntualidad</SelectItem>
                  <SelectItem value="Violencia">Violencia</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
              {createForm.formState.errors.category && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.category.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="severity">Severidad</Label>
              <Select
                value={createForm.watch('severity') ?? 'low'}
                onValueChange={(v) =>
                  createForm.setValue('severity', v as 'low' | 'medium' | 'high')
                }
              >
                <SelectTrigger id="severity">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Leve</SelectItem>
                  <SelectItem value="medium">Moderado</SelectItem>
                  <SelectItem value="high">Grave</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Descripción</Label>
              <textarea
                id="description"
                {...createForm.register('description')}
                rows={3}
                placeholder="Describe el incidente..."
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
              {createForm.formState.errors.description && (
                <p className="text-xs text-destructive">
                  {createForm.formState.errors.description.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false)
                  createForm.reset({ severity: 'low' })
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Registrar incidente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit/Update Dialog */}
      <Dialog
        open={!!editIncident}
        onOpenChange={(open) => {
          if (!open) {
            setEditIncident(null)
            updateForm.reset()
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Actualizar Incidente</DialogTitle>
          </DialogHeader>
          {editIncident && (
            <form
              onSubmit={updateForm.handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-4"
            >
              {/* Read-only info */}
              <div className="rounded-md bg-muted p-3 space-y-1.5 text-sm">
                <div>
                  <span className="font-medium">Estudiante: </span>
                  {editIncident.student.profile.firstName}{' '}
                  {editIncident.student.profile.lastName}
                </div>
                <div>
                  <span className="font-medium">Categoría: </span>
                  {editIncident.category}
                </div>
                <div>
                  <span className="font-medium">Severidad: </span>
                  <Badge variant={SEVERITY_VARIANT[editIncident.severity] ?? 'secondary'}>
                    {SEVERITY_LABELS[editIncident.severity]}
                  </Badge>
                </div>
                <div className="text-muted-foreground">{editIncident.description}</div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Estado</Label>
                <Select
                  value={updateForm.watch('status') ?? editIncident.status}
                  onValueChange={(v) =>
                    updateForm.setValue(
                      'status',
                      v as 'open' | 'in_review' | 'resolved' | 'closed',
                    )
                  }
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="in_review">En revisión</SelectItem>
                    <SelectItem value="resolved">Resuelto</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-resolutionNotes">Notas de resolución</Label>
                <textarea
                  id="edit-resolutionNotes"
                  {...updateForm.register('resolutionNotes')}
                  rows={3}
                  placeholder="Describe cómo se resolvió el incidente..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditIncident(null)
                    updateForm.reset()
                  }}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
