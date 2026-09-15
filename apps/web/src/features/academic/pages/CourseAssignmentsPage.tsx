import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Trash2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
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
import { Badge } from '@/shared/components/ui/badge'
import { apiGet } from '@/shared/lib/api-client'
import { type CourseAssignment } from '../api/academic.api'
import {
  useCourseAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useSubjects,
  useParallels,
  useAcademicYears,
  useAssignmentWorkload,
  useUpdateWeeklyPeriodsOverride,
} from '../hooks/useAcademic'

function WorkloadCell({ assignmentId }: { assignmentId: string }) {
  const { data: workload, isLoading } = useAssignmentWorkload(assignmentId)
  const updateOverride = useUpdateWeeklyPeriodsOverride()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState('')

  if (isLoading || !workload) return <span className="text-xs text-muted-foreground">—</span>

  if (workload.status === 'NOT_APPLICABLE') {
    return <span className="text-xs text-muted-foreground">Sin carga oficial vinculada</span>
  }

  if (workload.status === 'MISSING') {
    return <span className="text-xs text-muted-foreground">No hay tabla oficial para este grado</span>
  }

  if (workload.status === 'INSTITUTIONAL_CONFIGURATION_REQUIRED') {
    if (editing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={1}
            max={workload.groupWeeklyPeriods ?? 40}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-7 w-16"
            autoFocus
          />
          <Button
            size="sm"
            className="h-7"
            loading={updateOverride.isPending}
            onClick={() =>
              updateOverride.mutate(
                { id: assignmentId, weeklyPeriodsOverride: Number(value) || null },
                { onSuccess: () => setEditing(false) },
              )
            }
          >
            OK
          </Button>
        </div>
      )
    }
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-xs text-amber-700 underline decoration-dotted hover:text-amber-900"
        title={`Bloque agrupado oficial: ${workload.groupWeeklyPeriods} períodos/semana — reparte cuántos le tocan a esta materia`}
      >
        Definir reparto ({workload.groupWeeklyPeriods} periodos del bloque)
      </button>
    )
  }

  return (
    <Badge variant={workload.effectiveSource === 'INSTITUTIONAL' ? 'secondary' : 'success'}>
      {workload.weeklyPeriods} periodos/sem
    </Badge>
  )
}

interface Teacher {
  id: string
  fullName: string
  email: string
}

interface AssignmentRaw {
  subject?: { name: string }
  parallel?: { name: string; level?: { name: string } }
  teacher?: { profile: { firstName: string; lastName: string } }
}

const assignmentSchema = z.object({
  parallelId: z.string().min(1, 'El paralelo es requerido'),
  subjectId: z.string().min(1, 'La materia es requerida'),
  teacherId: z.string().min(1, 'El docente es requerido'),
  academicYearId: z.string().min(1, 'El año académico es requerido'),
})
type AssignmentForm = z.infer<typeof assignmentSchema>

export function CourseAssignmentsPage() {
  const { data: years = [] } = useAcademicYears()
  const { data: subjects = [] } = useSubjects()
  const [selectedYearId, setSelectedYearId] = React.useState<string>('')
  const [selectedParallelId, setSelectedParallelId] = React.useState<string>('')

  const { data: parallels = [] } = useParallels(selectedYearId || undefined)
  const { data: assignments = [], isLoading } = useCourseAssignments(
    selectedYearId ? { academicYearId: selectedYearId, ...(selectedParallelId ? { parallelId: selectedParallelId } : {}) } : undefined,
  )
  const createAssignment = useCreateAssignment()
  const deleteAssignment = useDeleteAssignment()

  const { data: teachers = [] } = useQuery({
    queryKey: ['users', { role: 'teacher' }],
    queryFn: () =>
      apiGet<{ data: Teacher[]; total: number }>('users', { role: 'teacher' }).then((r) => r.data),
  })

  const [open, setOpen] = React.useState(false)

  const form = useForm<AssignmentForm>({
    resolver: zodResolver(assignmentSchema),
    defaultValues: {
      parallelId: '',
      subjectId: '',
      teacherId: '',
      academicYearId: '',
    },
  })

  React.useEffect(() => {
    const active = years.find((y) => y.isActive)
    if (active && !selectedYearId) {
      setSelectedYearId(active.id)
    }
  }, [years, selectedYearId])

  React.useEffect(() => {
    setSelectedParallelId('')
  }, [selectedYearId])

  function openCreate() {
    form.reset({
      parallelId: selectedParallelId,
      subjectId: '',
      teacherId: '',
      academicYearId: selectedYearId,
    })
    setOpen(true)
  }

  function onSubmit(values: AssignmentForm) {
    createAssignment.mutate(values, { onSuccess: () => setOpen(false) })
  }

  function handleDelete(id: string) {
    if (confirm('¿Eliminar esta asignación?')) {
      deleteAssignment.mutate(id)
    }
  }

  const columns: ColumnDef<CourseAssignment, unknown>[] = [
    {
      header: 'Materia',
      cell: ({ row }) => {
        const a = row.original as unknown as AssignmentRaw
        return a.subject?.name ?? row.original.subjectId
      },
    },
    {
      header: 'Paralelo',
      cell: ({ row }) => {
        const a = row.original as unknown as AssignmentRaw
        if (a.parallel) return `${a.parallel.level?.name ?? ''} ${a.parallel.name}`.trim()
        return row.original.parallelId
      },
    },
    {
      header: 'Docente',
      cell: ({ row }) => {
        const a = row.original as unknown as AssignmentRaw
        if (a.teacher?.profile) return `${a.teacher.profile.firstName} ${a.teacher.profile.lastName}`
        return row.original.teacherId
      },
    },
    {
      id: 'workload',
      header: 'Carga horaria',
      cell: ({ row }) => <WorkloadCell assignmentId={row.original.id} />,
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          onClick={() => handleDelete(row.original.id)}
          loading={deleteAssignment.isPending}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asignaciones de Curso</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Asigna docentes a materias en cada paralelo
          </p>
        </div>
        <Button onClick={openCreate} disabled={!selectedYearId}>
          <Plus className="h-4 w-4" />
          Nueva Asignación
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-48">
          <Select value={selectedYearId} onValueChange={setSelectedYearId}>
            <SelectTrigger>
              <SelectValue placeholder="Año académico" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={selectedParallelId || '__all__'}
            onValueChange={(v) => setSelectedParallelId(v === '__all__' ? '' : v)}
            disabled={!selectedYearId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Todos los paralelos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos los paralelos</SelectItem>
              {parallels.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.level?.name} {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={assignments}
          emptyMessage="No hay asignaciones"
          emptyDescription="Crea una asignación para asociar docentes a materias"
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva Asignación</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Año Académico</Label>
              <Select
                value={form.watch('academicYearId')}
                onValueChange={(v) => form.setValue('academicYearId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año" />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.academicYearId && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.academicYearId.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Paralelo</Label>
              <Select
                value={form.watch('parallelId')}
                onValueChange={(v) => form.setValue('parallelId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar paralelo" />
                </SelectTrigger>
                <SelectContent>
                  {parallels.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.level?.name} {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.parallelId && (
                <p className="text-xs text-destructive">{form.formState.errors.parallelId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Materia</Label>
              <Select
                value={form.watch('subjectId')}
                onValueChange={(v) => form.setValue('subjectId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar materia" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.subjectId && (
                <p className="text-xs text-destructive">{form.formState.errors.subjectId.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Docente</Label>
              <Select
                value={form.watch('teacherId')}
                onValueChange={(v) => form.setValue('teacherId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar docente" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.teacherId && (
                <p className="text-xs text-destructive">{form.formState.errors.teacherId.message}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createAssignment.isPending}>
                Crear asignación
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
