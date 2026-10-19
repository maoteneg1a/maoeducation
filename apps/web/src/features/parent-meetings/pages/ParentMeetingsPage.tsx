import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { type ColumnDef } from '@tanstack/react-table'
import { useNavigate } from 'react-router-dom'
import { HeartHandshake, Plus, Eye } from 'lucide-react'
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
import { usePermissions } from '@/shared/hooks/usePermissions'
import {
  useParentMeetings,
  useMeetingStudents,
  useCreateParentMeeting,
} from '../hooks/useParentMeetings'
import type { ParentMeeting } from '../api/parent-meetings.api'
import { todayLocalISO } from '@/shared/lib/utils'

const NO_STUDENT = '__none__'

const createSchema = z.object({
  meetingDate: z.string().min(1, 'La fecha es requerida'),
  meetingTime: z.string().optional(),
  visitorName: z.string().min(1, 'El nombre de quien se acercó es requerido'),
  visitorRelation: z.string().optional(),
  studentId: z.string().optional(),
  subject: z.string().min(1, 'El asunto es requerido'),
  details: z.string().min(1, 'El detalle es requerido'),
  agreements: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>

const fmtDate = (d: string) => {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, day))
}

const personName = (p: { profile: { firstName: string; lastName: string } } | null) =>
  p?.profile ? `${p.profile.firstName} ${p.profile.lastName}` : '—'

function todayIso() {
  return todayLocalISO()
}

export function ParentMeetingsPage() {
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canWrite = hasPermission('parent_meetings:write')

  const [createOpen, setCreateOpen] = useState(false)

  const { data: meetings = [], isLoading } = useParentMeetings()
  const { data: students = [] } = useMeetingStudents()
  const createMutation = useCreateParentMeeting()

  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { meetingDate: todayIso() },
  })

  function onSubmit(values: CreateFormValues) {
    createMutation.mutate(
      {
        meetingDate: values.meetingDate,
        meetingTime: values.meetingTime || undefined,
        visitorName: values.visitorName,
        visitorRelation: values.visitorRelation || undefined,
        studentId: values.studentId && values.studentId !== NO_STUDENT ? values.studentId : null,
        subject: values.subject,
        details: values.details,
        agreements: values.agreements || undefined,
      },
      {
        onSuccess: () => {
          setCreateOpen(false)
          form.reset({ meetingDate: todayIso() })
        },
      },
    )
  }

  const columns: ColumnDef<ParentMeeting>[] = [
    {
      accessorKey: 'meetingDate',
      header: 'Fecha',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{fmtDate(row.original.meetingDate)}</p>
          {row.original.meetingTime && (
            <p className="text-xs text-muted-foreground">{row.original.meetingTime}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'visitorName',
      header: 'Se acercó',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.visitorName}</p>
          {row.original.visitorRelation && (
            <p className="text-xs text-muted-foreground">{row.original.visitorRelation}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'subject',
      header: 'Asunto',
    },
    {
      id: 'student',
      header: 'Estudiante',
      cell: ({ row }) =>
        row.original.student ? (
          personName(row.original.student)
        ) : (
          <span className="text-xs text-muted-foreground">General</span>
        ),
    },
    {
      id: 'signed',
      header: 'Firma',
      cell: ({ row }) =>
        row.original.signedAt ? (
          <Badge variant="success">Firmada</Badge>
        ) : (
          <Badge variant="secondary">Pendiente</Badge>
        ),
    },
    {
      id: 'recorder',
      header: 'Atendió',
      cell: ({ row }) => personName(row.original.recorder),
    },
    {
      id: 'actions',
      header: 'Acciones',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/parent-meetings/${row.original.id}`)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ]

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HeartHandshake className="h-6 w-6" />
            Atención a Padres de Familia
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Bitácora de atenciones a padres y representantes
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nueva atención
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={meetings}
        emptyMessage="No hay atenciones registradas"
        emptyDescription="Registra la primera atención usando el botón 'Nueva atención'"
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nueva atención a padres</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="meetingDate">Fecha</Label>
                <input
                  id="meetingDate"
                  type="date"
                  {...form.register('meetingDate')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {form.formState.errors.meetingDate && (
                  <p className="text-xs text-destructive">{form.formState.errors.meetingDate.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="meetingTime">Hora</Label>
                <input
                  id="meetingTime"
                  type="time"
                  {...form.register('meetingTime')}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="visitorName">Persona que se acercó</Label>
                <Input id="visitorName" {...form.register('visitorName')} placeholder="Nombre completo" />
                {form.formState.errors.visitorName && (
                  <p className="text-xs text-destructive">{form.formState.errors.visitorName.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="visitorRelation">Parentesco (opcional)</Label>
                <Input id="visitorRelation" {...form.register('visitorRelation')} placeholder="Madre, padre, tío..." />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="studentId">Estudiante (opcional)</Label>
              <Select
                value={form.watch('studentId') ?? ''}
                onValueChange={(v) => form.setValue('studentId', v)}
              >
                <SelectTrigger id="studentId">
                  <SelectValue placeholder="Sin estudiante / general" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STUDENT}>Sin estudiante / general</SelectItem>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="subject">Asunto</Label>
              <Input id="subject" {...form.register('subject')} placeholder="Motivo de la atención" />
              {form.formState.errors.subject && (
                <p className="text-xs text-destructive">{form.formState.errors.subject.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="details">Detalle de lo hablado</Label>
              <textarea
                id="details"
                {...form.register('details')}
                rows={4}
                placeholder="Resumen de lo conversado..."
                className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {form.formState.errors.details && (
                <p className="text-xs text-destructive">{form.formState.errors.details.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agreements">Acuerdos / compromisos (opcional)</Label>
              <textarea
                id="agreements"
                {...form.register('agreements')}
                rows={2}
                placeholder="Compromisos asumidos..."
                className="flex w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false)
                  form.reset({ meetingDate: todayIso() })
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Registrar atención'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
