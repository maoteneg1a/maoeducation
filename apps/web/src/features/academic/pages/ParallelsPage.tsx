import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Edit2, Plus, UserIcon } from 'lucide-react'
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
import { type Parallel } from '../api/academic.api'
import {
  useParallels,
  useCreateParallel,
  useUpdateParallel,
  useLevels,
  useAcademicYears,
} from '../hooks/useAcademic'
import { apiGet } from '@/shared/lib/api-client'
import { useQuery } from '@tanstack/react-query'

interface TeacherUser {
  id: string
  fullName: string
  email: string
}

function useTeachers() {
  return useQuery({
    queryKey: ['users', { role: 'teacher' }],
    queryFn: () =>
      apiGet<{ data: TeacherUser[]; total: number }>('users', { role: 'teacher' }).then(
        (r) => r.data,
      ),
  })
}

const parallelSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  levelId: z.string().min(1, 'El nivel es requerido'),
  academicYearId: z.string().min(1, 'El año académico es requerido'),
  capacity: z.coerce.number().int().min(1).optional(),
  tutorId: z.string().optional(),
  educationOffer: z.string().optional(),
})
type ParallelForm = z.infer<typeof parallelSchema>

export function ParallelsPage() {
  const { data: years = [] } = useAcademicYears()
  const { data: levels = [] } = useLevels()
  const { data: teachers = [] } = useTeachers()

  const [selectedYearId, setSelectedYearId] = React.useState<string>('')
  const { data: parallels = [], isLoading } = useParallels(selectedYearId || undefined)
  const createParallel = useCreateParallel()
  const updateParallel = useUpdateParallel()

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Parallel | null>(null)

  const form = useForm<ParallelForm>({
    resolver: zodResolver(parallelSchema),
    defaultValues: { name: '', levelId: '', academicYearId: '', capacity: undefined, tutorId: undefined, educationOffer: undefined },
  })

  const selectedLevel = levels.find((l) => l.id === form.watch('levelId'))
  const isBgu = selectedLevel?.subnivel === 'bgu'

  // Default to active year
  React.useEffect(() => {
    const activeYear = years.find((y) => y.isActive)
    if (activeYear && !selectedYearId) {
      setSelectedYearId(activeYear.id)
    }
  }, [years, selectedYearId])

  function openCreate() {
    setEditing(null)
    form.reset({
      name: '',
      levelId: '',
      academicYearId: selectedYearId,
      capacity: undefined,
      tutorId: undefined,
      educationOffer: undefined,
    })
    setOpen(true)
  }

  function openEdit(parallel: Parallel) {
    setEditing(parallel)
    form.reset({
      name: parallel.name,
      levelId: parallel.levelId,
      academicYearId: parallel.academicYearId,
      capacity: parallel.capacity,
      tutorId: parallel.tutorId ?? undefined,
      educationOffer: parallel.educationOffer ?? undefined,
    })
    setOpen(true)
  }

  function onSubmit(values: ParallelForm) {
    const payload = {
      name: values.name,
      levelId: values.levelId,
      academicYearId: values.academicYearId,
      capacity: values.capacity,
      tutorId: values.tutorId || null,
      educationOffer: values.educationOffer || null,
    }
    if (editing) {
      updateParallel.mutate(
        { id: editing.id, data: payload },
        { onSuccess: () => setOpen(false) },
      )
    } else {
      createParallel.mutate(payload, { onSuccess: () => setOpen(false) })
    }
  }

  const columns: ColumnDef<Parallel, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Paralelo',
      cell: ({ row }) => (
        <span className="font-semibold text-primary">{row.original.name}</span>
      ),
    },
    {
      header: 'Nivel',
      cell: ({ row }) => row.original.level?.name ?? '—',
    },
    {
      header: 'Tutor',
      cell: ({ row }) => {
        const t = row.original.tutor
        if (!t) return <span className="text-muted-foreground text-sm">Sin tutor</span>
        return (
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
              <UserIcon className="h-3 w-3 text-primary" />
            </div>
            <span className="text-sm">{t.profile.firstName} {t.profile.lastName}</span>
          </div>
        )
      },
    },
    {
      accessorKey: 'capacity',
      header: 'Capacidad',
      cell: ({ row }) =>
        row.original.capacity != null ? (
          <span>{row.original.capacity} est.</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      header: 'Matrícula',
      cell: ({ row }) => {
        const count = row.original._count?.enrollments ?? 0
        return <Badge variant="secondary">{count} alumnos</Badge>
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'destructive'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}>
          <Edit2 className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Paralelos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona los paralelos por año académico
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo Paralelo
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="w-full sm:w-56">
          <Select value={selectedYearId} onValueChange={setSelectedYearId}>
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
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <DataTable
          columns={columns}
          data={parallels}
          emptyMessage="No hay paralelos"
          emptyDescription={
            selectedYearId
              ? 'No hay paralelos para este año académico'
              : 'Selecciona un año académico para ver los paralelos'
          }
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Paralelo' : 'Nuevo Paralelo'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nivel</Label>
              <Select
                value={form.watch('levelId')}
                onValueChange={(v) => form.setValue('levelId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar nivel" />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.levelId && (
                <p className="text-xs text-destructive">{form.formState.errors.levelId.message}</p>
              )}
            </div>
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
              <Label>Paralelo (nombre)</Label>
              <Input {...form.register('name')} placeholder="Ej: A, B, C" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            {isBgu && (
              <div className="space-y-2">
                <Label>Oferta de Bachillerato</Label>
                <Select
                  value={form.watch('educationOffer') || '__none__'}
                  onValueChange={(v) => form.setValue('educationOffer', v === '__none__' ? undefined : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar oferta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin definir</SelectItem>
                    <SelectItem value="BACHILLERATO_CIENCIAS">Bachillerato en Ciencias</SelectItem>
                    <SelectItem value="BACHILLERATO_TECNICO">Bachillerato Técnico</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Determina qué tabla de carga horaria oficial aplica a este paralelo.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Tutor / Director de grupo</Label>
              <Select
                value={form.watch('tutorId') || '__none__'}
                onValueChange={(v) => form.setValue('tutorId', v === '__none__' ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin tutor asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin tutor</SelectItem>
                  {teachers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Capacidad (opcional)</Label>
              <Input
                type="number"
                {...form.register('capacity')}
                placeholder="Ej: 30"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={createParallel.isPending || updateParallel.isPending}
              >
                {editing ? 'Guardar cambios' : 'Crear paralelo'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
