import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Check, ChevronsUpDown, Edit2, Plus, Search, UserIcon, X } from 'lucide-react'
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
    queryFn: async () => {
      const limit = 200
      const first = await apiGet<{ data: TeacherUser[]; total: number }>('users', { role: 'teacher', page: 1, limit })
      if (first.data.length >= first.total) return first.data
      const pages = Math.ceil(first.total / limit)
      const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) =>
        apiGet<{ data: TeacherUser[]; total: number }>('users', { role: 'teacher', page: index + 2, limit })))
      return [first, ...remaining].flatMap((response) => response.data)
    },
  })
}

function TutorPicker({ teachers, value, onChange }: { teachers: TeacherUser[]; value?: string; onChange: (value?: string) => void }) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState('')
  const trigger = React.useRef<HTMLButtonElement>(null)
  const results = React.useRef<HTMLDivElement>(null)
  const selected = teachers.find((teacher) => teacher.id === value)
  const term = search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  const matches = teachers.filter((teacher) => !term || `${teacher.fullName} ${teacher.email}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(term))
  const choose = (next?: string) => { onChange(next); setOpen(false); setSearch(''); trigger.current?.focus() }

  return <div className="space-y-2" onKeyDown={(event) => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <Button ref={trigger} type="button" variant="outline" aria-expanded={open} className="h-10 w-full justify-between px-3 font-normal" onClick={() => setOpen((current) => !current)}>
      <span className={selected ? '' : 'text-muted-foreground'}>{selected?.fullName ?? 'Sin tutor'}</span><ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
    </Button>
    {open && <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o correo…" className="pr-9 pl-9" onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); results.current?.querySelector<HTMLButtonElement>('button')?.focus() }
        }} />
        {search && <button type="button" aria-label="Limpiar búsqueda" className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted" onClick={() => setSearch('')}><X className="h-4 w-4" /></button>}
      </div>
      <div ref={results} className="mt-2 max-h-48 space-y-1 overflow-y-auto overscroll-contain" onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))
        event.preventDefault(); buttons[next]?.focus()
      }}>
        <button type="button" className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none" onClick={() => choose()}><span className="text-muted-foreground">Sin tutor</span>{!value && <Check className="h-4 w-4 text-primary" />}</button>
        {!matches.length ? <p className="px-2 py-3 text-sm text-muted-foreground">No hay docentes que coincidan.</p> : matches.slice(0, 50).map((teacher) => <button key={teacher.id} type="button" className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-muted focus:bg-muted focus:outline-none" onClick={() => choose(teacher.id)}>
          <span className="min-w-0"><span className="block text-sm font-medium">{teacher.fullName}</span><span className="block truncate text-xs text-muted-foreground">{teacher.email}</span></span>{value === teacher.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
        </button>)}
      </div>
      <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">{matches.length} docente{matches.length === 1 ? '' : 's'}{matches.length > 50 ? ' · Escribe para afinar la búsqueda.' : ''}</p>
    </div>}
  </div>
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
            <span className="text-sm">{t.profile.lastName} {t.profile.firstName}</span>
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
              <TutorPicker teachers={teachers} value={form.watch('tutorId')} onChange={(value) => form.setValue('tutorId', value, { shouldDirty: true })} />
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
