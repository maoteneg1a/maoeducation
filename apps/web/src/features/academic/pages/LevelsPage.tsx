import * as React from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { Edit2, Plus, ToggleLeft, ToggleRight } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { type Level } from '../api/academic.api'
import { useLevels, useCreateLevel, useUpdateLevel, useToggleLevel } from '../hooks/useAcademic'

const NONE = '__none__'
const SUBNIVEL_LABEL: Record<string, string> = {
  inicial: 'Inicial',
  preparatoria: 'Preparatoria',
  elemental: 'Elemental',
  media: 'Media',
  superior: 'Superior',
  bgu: 'Bachillerato (BGU)',
}

const levelSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  code: z.string().min(1, 'El código es requerido').toUpperCase(),
  sortOrder: z.coerce.number().int().min(0, 'Debe ser un número positivo'),
  subnivel: z.string().default(NONE),
})
type LevelForm = z.infer<typeof levelSchema>

export function LevelsPage() {
  const { data: levels = [], isLoading } = useLevels()
  const createLevel = useCreateLevel()
  const updateLevel = useUpdateLevel()
  const toggleLevel = useToggleLevel()

  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Level | null>(null)

  const form = useForm<LevelForm>({
    resolver: zodResolver(levelSchema),
    defaultValues: { name: '', code: '', sortOrder: 0, subnivel: NONE },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: '', code: '', sortOrder: 0, subnivel: NONE })
    setOpen(true)
  }

  function openEdit(level: Level) {
    setEditing(level)
    form.reset({ name: level.name, code: level.code, sortOrder: level.sortOrder, subnivel: level.subnivel ?? NONE })
    setOpen(true)
  }

  function onSubmit(values: LevelForm) {
    const data = { ...values, subnivel: values.subnivel === NONE ? null : values.subnivel }
    if (editing) {
      updateLevel.mutate(
        { id: editing.id, data },
        { onSuccess: () => setOpen(false) },
      )
    } else {
      createLevel.mutate(data, { onSuccess: () => setOpen(false) })
    }
  }

  const columns: ColumnDef<Level, unknown>[] = [
    {
      accessorKey: 'name',
      header: 'Nombre',
    },
    {
      accessorKey: 'code',
      header: 'Código',
      cell: ({ row }) => (
        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
          {row.original.code}
        </span>
      ),
    },
    {
      accessorKey: 'sortOrder',
      header: 'Orden',
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.sortOrder}</span>,
    },
    {
      id: 'subnivel',
      header: 'Subnivel MINEDUC',
      cell: ({ row }) =>
        row.original.subnivel ? (
          <Badge variant="secondary">{SUBNIVEL_LABEL[row.original.subnivel] ?? row.original.subnivel}</Badge>
        ) : (
          <span className="text-xs text-destructive">Sin configurar</span>
        ),
    },
    {
      id: 'attendanceMode',
      header: 'Asistencia',
      cell: ({ row }) => (
        <Select
          value={row.original.attendanceMode ?? 'per_subject'}
          onValueChange={(value) =>
            updateLevel.mutate({ id: row.original.id, data: { attendanceMode: value as Level['attendanceMode'] } })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="per_subject" className="text-xs">Por materia</SelectItem>
            <SelectItem value="daily" className="text-xs">Diaria</SelectItem>
          </SelectContent>
        </Select>
      ),
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
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => openEdit(row.original)}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toggleLevel.mutate(row.original.id)}
            loading={toggleLevel.isPending}
          >
            {row.original.isActive ? (
              <ToggleRight className="h-4 w-4 text-green-600" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      ),
    },
  ]

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Niveles Educativos</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona los niveles educativos de la institución
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo Nivel
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={levels}
        emptyMessage="No hay niveles registrados"
        emptyDescription="Crea un nivel educativo para comenzar"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Nivel' : 'Nuevo Nivel'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" {...form.register('name')} placeholder="Ej: Básica Elemental" />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                {...form.register('code')}
                placeholder="Ej: BE"
                className="uppercase"
                onChange={(e) => form.setValue('code', e.target.value.toUpperCase())}
              />
              {form.formState.errors.code && (
                <p className="text-xs text-destructive">{form.formState.errors.code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Orden</Label>
              <Input
                id="sortOrder"
                type="number"
                {...form.register('sortOrder')}
                placeholder="0"
              />
              {form.formState.errors.sortOrder && (
                <p className="text-xs text-destructive">{form.formState.errors.sortOrder.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Subnivel MINEDUC</Label>
              <Select value={form.watch('subnivel')} onValueChange={(v) => form.setValue('subnivel', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin configurar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin configurar</SelectItem>
                  {Object.entries(SUBNIVEL_LABEL).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Determina qué banco curricular (destrezas o competencias) se ofrece a los docentes de este nivel.
                Sin configurar, el selector de planificación queda vacío.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={createLevel.isPending || updateLevel.isPending}
              >
                {editing ? 'Guardar cambios' : 'Crear nivel'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
