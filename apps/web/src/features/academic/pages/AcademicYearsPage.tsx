import * as React from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, Check, ChevronDown, ChevronRight, CalendarDays, CalendarPlus, Lock, LockOpen, Pencil } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { formatDate } from '@/shared/lib/utils'
import { type AcademicYear, type AcademicPeriod } from '../api/academic.api'
import { YearRolloverDialog } from '../components/YearRolloverDialog'
import {
  useAcademicYears,
  useCreateYear,
  useActivateYear,
  usePeriods,
  useCreatePeriod,
  useUpdatePeriod,
  useActivatePeriod,
  useSetPeriodClosure,
} from '../hooks/useAcademic'

// ─── Period sub-panel ─────────────────────────────────────────────────────────

const periodSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  order: z.coerce.number().int().min(1),
  startDate: z.string().min(1, 'Requerido'),
  endDate: z.string().min(1, 'Requerido'),
})
type PeriodForm = z.infer<typeof periodSchema>

function PeriodsPanel({ yearId }: { yearId: string }) {
  const { data: periods = [], isLoading } = usePeriods(yearId)
  const createPeriod = useCreatePeriod(yearId)
  const updatePeriod = useUpdatePeriod(yearId)
  const activatePeriod = useActivatePeriod(yearId)
  const setClosure = useSetPeriodClosure(yearId)
  const [open, setOpen] = React.useState(false)
  const [editingPeriod, setEditingPeriod] = React.useState<AcademicPeriod | null>(null)

  const form = useForm<PeriodForm>({
    resolver: zodResolver(periodSchema),
    defaultValues: {
      name: '',
      order: periods.length + 1,
      startDate: '',
      endDate: '',
    },
  })

  const editForm = useForm<PeriodForm>({
    resolver: zodResolver(periodSchema),
    defaultValues: { name: '', order: 1, startDate: '', endDate: '' },
  })

  React.useEffect(() => {
    if (open) form.setValue('order', periods.length + 1)
  }, [open, periods.length, form])

  function onSubmit(values: PeriodForm) {
    createPeriod.mutate(values, { onSuccess: () => { setOpen(false); form.reset() } })
  }

  function openEdit(period: AcademicPeriod) {
    editForm.reset({
      name: period.name,
      order: period.periodNumber,
      startDate: period.startDate.slice(0, 10),
      endDate: period.endDate.slice(0, 10),
    })
    setEditingPeriod(period)
  }

  function onEditSubmit(values: PeriodForm) {
    if (!editingPeriod) return
    updatePeriod.mutate(
      { periodId: editingPeriod.id, data: values },
      { onSuccess: () => setEditingPeriod(null) },
    )
  }

  const columns: ColumnDef<AcademicPeriod, unknown>[] = [
    {
      accessorKey: 'periodNumber',
      header: '#',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.original.periodNumber}</span>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Período',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'startDate',
      header: 'Inicio',
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: 'endDate',
      header: 'Fin',
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
            {row.original.isActive ? 'Activo' : 'Inactivo'}
          </Badge>
          {!row.original.isActive && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={activatePeriod.isPending}
              onClick={() => activatePeriod.mutate(row.original.id)}
              title="Activar período (desactiva los demás del año)"
            >
              Activar
            </Button>
          )}
        </div>
      ),
    },
    {
      id: 'closure',
      header: 'Cierre',
      cell: ({ row }) => {
        const closed = row.original.isClosed
        return (
          <div className="flex items-center gap-2">
            {closed && <Badge variant="warning">Cerrado</Badge>}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => openEdit(row.original)}
              title="Editar período"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={setClosure.isPending}
              onClick={() => setClosure.mutate({ periodId: row.original.id, isClosed: !closed })}
              title={closed ? 'Reabrir período' : 'Cerrar período (bloquea notas y comportamiento)'}
            >
              {closed ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              {closed ? 'Reabrir' : 'Cerrar'}
            </Button>
          </div>
        )
      },
    },
  ]

  return (
    <div className="px-4 pb-4 pt-2 bg-muted/30 border-t space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Períodos académicos ({periods.length})
        </p>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" />
          Agregar período
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground py-2">Cargando…</p>
      ) : periods.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hay períodos. Agrega el primer período con el nombre y las fechas que necesites.
        </p>
      ) : (
        <DataTable columns={columns} data={periods} emptyMessage="Sin períodos" />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Período Académico</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                {...form.register('name')}
                placeholder="Ej: Primer Trimestre, Quimestre 1"
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Número de orden</Label>
              <Input type="number" {...form.register('order')} min={1} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input type="date" {...form.register('startDate')} />
                {form.formState.errors.startDate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.startDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <Input type="date" {...form.register('endDate')} />
                {form.formState.errors.endDate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.endDate.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createPeriod.isPending}>
                Crear período
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingPeriod} onOpenChange={(v) => !v && setEditingPeriod(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Período Académico</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                {...editForm.register('name')}
                placeholder="Ej: Primer Trimestre, Quimestre 1"
              />
              {editForm.formState.errors.name && (
                <p className="text-xs text-destructive">{editForm.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Número de orden</Label>
              <Input type="number" {...editForm.register('order')} min={1} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha inicio</Label>
                <Input type="date" {...editForm.register('startDate')} />
                {editForm.formState.errors.startDate && (
                  <p className="text-xs text-destructive">
                    {editForm.formState.errors.startDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Fecha fin</Label>
                <Input type="date" {...editForm.register('endDate')} />
                {editForm.formState.errors.endDate && (
                  <p className="text-xs text-destructive">
                    {editForm.formState.errors.endDate.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingPeriod(null)}>
                Cancelar
              </Button>
              <Button type="submit" loading={updatePeriod.isPending}>
                Guardar cambios
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const yearSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  startDate: z.string().min(1, 'La fecha de inicio es requerida'),
  endDate: z.string().min(1, 'La fecha de fin es requerida'),
})
type YearForm = z.infer<typeof yearSchema>

export function AcademicYearsPage() {
  const isPersonalAccount = useAuthStore((s) => s.user?.institution?.accountType === 'personal')
  const { data: years = [], isLoading } = useAcademicYears()
  const createYear = useCreateYear()
  const activateYear = useActivateYear()
  const [open, setOpen] = React.useState(false)
  const [expandedYearId, setExpandedYearId] = React.useState<string | null>(null)
  const [rolloverYear, setRolloverYear] = React.useState<AcademicYear | null>(null)

  const form = useForm<YearForm>({
    resolver: zodResolver(yearSchema),
    defaultValues: { name: '', startDate: '', endDate: '' },
  })

  // Auto-expand active year
  React.useEffect(() => {
    const active = years.find((y) => y.isActive)
    if (active && expandedYearId === null) setExpandedYearId(active.id)
  }, [years, expandedYearId])

  function onSubmit(values: YearForm) {
    createYear.mutate(values, { onSuccess: () => { setOpen(false); form.reset() } })
  }

  const columns: ColumnDef<AcademicYear, unknown>[] = [
    {
      id: 'expand',
      header: '',
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() =>
            setExpandedYearId((prev) => (prev === row.original.id ? null : row.original.id))
          }
        >
          {expandedYearId === row.original.id ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      ),
    },
    {
      accessorKey: 'name',
      header: 'Nombre',
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'startDate',
      header: 'Inicio',
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: 'endDate',
      header: 'Fin',
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) =>
        !row.original.isActive ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => activateYear.mutate(row.original.id)}
            loading={activateYear.isPending}
          >
            <Check className="h-3.5 w-3.5" />
            Activar
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">Año actual</span>
        ),
    },
  ]

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Años Académicos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isPersonalAccount ? 'Crea tu calendario con los nombres y fechas de tu país.' : 'Gestiona los años y sus períodos académicos'}
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          Nuevo Año
        </Button>
      </div>

      {isPersonalAccount && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <p>Crea un año, agrega sus períodos y actívalo cuando quieras usarlo. Cada año tiene sus propios grados y materias.</p>
          <Button variant="outline" size="sm" asChild><Link to="/settings/mis-grados">Configurar materias del año activo</Link></Button>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden divide-y">
        {years.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No hay años académicos. Crea uno para comenzar.
          </div>
        ) : (
          years.map((year) => (
            <div key={year.id}>
              {/* Row */}
              <div className="flex items-center gap-3 px-4 py-3 bg-background hover:bg-muted/30 transition-colors">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setExpandedYearId((prev) => (prev === year.id ? null : year.id))
                  }
                >
                  {expandedYearId === year.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <span className="font-medium flex-1">{year.name}</span>
                <span className="text-sm text-muted-foreground w-28">
                  {formatDate(year.startDate)}
                </span>
                <span className="text-sm text-muted-foreground w-28">
                  {formatDate(year.endDate)}
                </span>
                <Badge variant={year.isActive ? 'success' : 'secondary'} className="w-20 justify-center">
                  {year.isActive ? 'Activo' : 'Inactivo'}
                </Badge>
                <div className="flex w-44 justify-end">
                  {!year.isActive ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => activateYear.mutate(year.id)}
                      loading={activateYear.isPending}
                    >
                      <Check className="h-3.5 w-3.5" />
                      Activar
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setRolloverYear(year)}>
                      <CalendarPlus className="h-3.5 w-3.5" />
                      Cerrar y abrir siguiente
                    </Button>
                  )}
                </div>
              </div>
              {/* Periods panel */}
              {expandedYearId === year.id && <PeriodsPanel yearId={year.id} />}
            </div>
          ))
        )}
      </div>

      {rolloverYear && (
        <YearRolloverDialog
          source={rolloverYear}
          open={!!rolloverYear}
          onOpenChange={(v) => !v && setRolloverYear(null)}
        />
      )}

      {/* Create Year Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo Año Académico</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input {...form.register('name')} placeholder="Ej: 2025-2026" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fecha de inicio</Label>
                <Input type="date" {...form.register('startDate')} />
                {form.formState.errors.startDate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.startDate.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Fecha de fin</Label>
                <Input type="date" {...form.register('endDate')} />
                {form.formState.errors.endDate && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.endDate.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={createYear.isPending}>
                Crear año
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
