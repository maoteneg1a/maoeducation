import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Calendar } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { apiGet } from '@/shared/lib/api-client'
import { useAuthStore } from '@/store/auth.store'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'
import {
  getSchedule,
  createScheduleEntry,
  deleteScheduleEntry,
  getAssignments,
  type ScheduleEntry,
} from '../api/schedules.api'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { ScheduleOverview } from '../components/ScheduleOverview'
import { SCHEDULE_DAYS as DAYS } from '../lib/schedule-presentation'

interface AcademicYear {
  id: string
  name: string
  isActive: boolean
}

interface Parallel {
  id: string
  name: string
  level: { name: string }
}

interface FormState {
  courseAssignmentId: string
  weekday: string
  startTime: string
  endTime: string
  room: string
}

export function SchedulePage() {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const guardianStudentId = useGuardianStudentId()
  const roles = user?.roles ?? []
  const canManage = roles.some((role) => role === 'admin' || role === 'rector' || role === 'teacher')
  const isGuardian = roles.includes('guardian') && !canManage
  const isStudent = roles.includes('student') && !canManage
  const isReadOnlyStudent = isGuardian || isStudent
  const isTeacherOnly = roles.includes('teacher') && !roles.some((role) => ['admin', 'rector'].includes(role))

  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterYearId, setFilterYearId] = useState('__active__')
  const [filterParallelId, setFilterParallelId] = useState('')
  const [filterTeacherId, setFilterTeacherId] = useState('')

  const [form, setForm] = useState<FormState>({
    courseAssignmentId: '',
    weekday: '',
    startTime: '',
    endTime: '',
    room: '',
  })

  const scheduleParams: Record<string, string> = {}
  if (filterYearId && filterYearId !== '__active__') scheduleParams.yearId = filterYearId
  if (filterParallelId) scheduleParams.parallelId = filterParallelId
  if (filterTeacherId) scheduleParams.teacherId = filterTeacherId
  if (isTeacherOnly && user?.id) scheduleParams.teacherId = user.id
  if (isGuardian && guardianStudentId) scheduleParams.studentId = guardianStudentId

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['schedules', scheduleParams],
    queryFn: () => getSchedule(scheduleParams),
  })

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments', 'schedule', user?.id, roles],
    queryFn: () => getAssignments(roles.includes('teacher') && !roles.includes('admin') && !roles.includes('rector')
      ? { teacherId: user!.id }
      : undefined),
    enabled: canManage,
  })

  const { data: years = [] } = useQuery({
    queryKey: ['academic/years'],
    queryFn: () => apiGet<AcademicYear[]>('academic/years'),
    enabled: !isReadOnlyStudent,
  })

  React.useEffect(() => {
    if (filterYearId === '__active__' && years.length) setFilterYearId(years.find((y) => y.isActive)?.id ?? '')
  }, [years, filterYearId])

  const { data: parallels = [], isLoading: parallelsLoading, isError: parallelsError } = useQuery({
    queryKey: ['academic/parallels', filterYearId],
    queryFn: () =>
      apiGet<Parallel[]>('academic/parallels', filterYearId && filterYearId !== '__active__' ? { yearId: filterYearId } : undefined),
    enabled: !isReadOnlyStudent && filterYearId !== '__active__',
  })

  const createMutation = useMutation({
    mutationFn: createScheduleEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      toast.success('Bloque agregado correctamente')
      setDialogOpen(false)
      setForm({ courseAssignmentId: '', weekday: '', startTime: '', endTime: '', room: '' })
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteScheduleEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      toast.success('Bloque eliminado')
    },
    onError: (err) => {
      toast.error(getErrorMessage(err))
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.courseAssignmentId || !form.weekday || !form.startTime || !form.endTime) {
      toast.error('Por favor completa todos los campos requeridos')
      return
    }
    createMutation.mutate({
      courseAssignmentId: form.courseAssignmentId,
      weekday: Number(form.weekday),
      startTime: form.startTime,
      endTime: form.endTime,
      room: form.room || undefined,
    })
  }

  async function handleDelete(entry: ScheduleEntry) {
    if (!(await confirmDialog({ title: '¿Eliminar este bloque de horario?', confirmText: 'Eliminar', destructive: true }))) return
    deleteMutation.mutate(entry.id)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-primary/10 p-2.5"><Calendar className="h-5 w-5 text-primary" aria-hidden="true" /></span>
          <div><h1 className="text-2xl font-semibold tracking-tight">Horario</h1><p className="mt-1 text-sm text-muted-foreground">Tu semana de clases, organizada por materias y paralelos.</p></div>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar bloque
          </Button>
        )}
      </div>

      {/* Filters */}
      {!isReadOnlyStudent && <div className="flex flex-col gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:flex-wrap">
        <Select value={filterYearId || '__all__'} onValueChange={(v) => { setFilterYearId(v === '__all__' ? '' : v); setFilterParallelId('') }}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Año lectivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los años</SelectItem>
            {years.map((y) => (
              <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterParallelId || '__all__'} onValueChange={(v) => setFilterParallelId(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Paralelo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{roles.includes('teacher') && !roles.some((r) => ['admin', 'rector', 'dece', 'inspector'].includes(r)) ? 'Todos mis paralelos' : 'Todos los paralelos'}</SelectItem>
            {parallels.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>}

      {isTeacherOnly && <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Este horario muestra únicamente tus materias y paralelos asignados.</p>}

      {!isReadOnlyStudent && <p role={parallelsError ? 'alert' : undefined} className="text-sm text-muted-foreground">
        {parallelsLoading ? 'Cargando paralelos...' : parallelsError ? 'No se pudieron cargar los paralelos. Vuelve a intentarlo.' : parallels.length ? `${parallels.length} paralelos disponibles para este año. Usa el selector para consultar uno en particular.` : 'No tienes paralelos asignados para este año lectivo.'}
      </p>}
      {!isLoading && entries.length === 0 && <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">No hay bloques de horario registrados para esta selección. Las materias asignadas y los bloques del horario se configuran por separado.</p>}
      {/* Weekly grid */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Cargando horario...</div>
      ) : (
        <ScheduleOverview entries={entries} onDelete={canManage ? handleDelete : undefined} />
      )}

      {/* Create dialog */}
      {canManage && <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Agregar Bloque de Horario</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="courseAssignment">Asignación de curso</Label>
              <Select
                value={form.courseAssignmentId}
                onValueChange={(v) => setForm((f) => ({ ...f, courseAssignmentId: v }))}
              >
                <SelectTrigger id="courseAssignment">
                  <SelectValue placeholder="Seleccionar asignación" />
                </SelectTrigger>
                <SelectContent>
                  {assignments.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.parallel.level.name} - {a.parallel.name} / {a.subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weekday">Día</Label>
              <Select
                value={form.weekday}
                onValueChange={(v) => setForm((f) => ({ ...f, weekday: v }))}
              >
                <SelectTrigger id="weekday">
                  <SelectValue placeholder="Seleccionar día" />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.value} value={String(d.value)}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="startTime">Hora inicio</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="endTime">Hora fin</Label>
                <Input
                  id="endTime"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="room">Aula</Label>
              <Input
                id="room"
                placeholder="Aula (opcional)"
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Guardando...' : 'Guardar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>}
    </div>
  )
}
