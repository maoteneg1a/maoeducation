import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X, Calendar } from 'lucide-react'
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

const DAYS = [
  { value: 1, label: 'Lunes' },
  { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
]

function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = 7; h <= 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
  }
  return slots
}

const TIME_SLOTS = generateTimeSlots()

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

  const [dialogOpen, setDialogOpen] = useState(false)
  const [filterYearId, setFilterYearId] = useState('')
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
  if (filterYearId) scheduleParams.yearId = filterYearId
  if (filterParallelId) scheduleParams.parallelId = filterParallelId
  if (filterTeacherId) scheduleParams.teacherId = filterTeacherId
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

  const { data: parallels = [] } = useQuery({
    queryKey: ['academic/parallels', filterYearId],
    queryFn: () =>
      apiGet<Parallel[]>('academic/parallels', filterYearId ? { yearId: filterYearId } : undefined),
    enabled: !isReadOnlyStudent,
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

  function handleDelete(entry: ScheduleEntry) {
    if (!window.confirm(`¿Eliminar este bloque de horario?`)) return
    deleteMutation.mutate(entry.id)
  }

  function getCellEntries(day: number, time: string): ScheduleEntry[] {
    return entries.filter(
      (e) => e.weekday === day && e.startTime === time,
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Horario</h1>
        </div>
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar Bloque
          </Button>
        )}
      </div>

      {/* Filters */}
      {!isReadOnlyStudent && <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Select value={filterYearId} onValueChange={(v) => { setFilterYearId(v === '__all__' ? '' : v); setFilterParallelId('') }}>
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

        <Select value={filterParallelId} onValueChange={(v) => setFilterParallelId(v === '__all__' ? '' : v)}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Paralelo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos los paralelos</SelectItem>
            {parallels.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>}

      {/* Weekly grid */}
      {isLoading ? (
        <div className="text-center py-10 text-muted-foreground">Cargando horario...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-20">Hora</th>
                {DAYS.map((d) => (
                  <th key={d.value} className="px-3 py-2 text-left font-medium">{d.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => (
                <tr key={time} className="border-t">
                  <td className="px-3 py-2 text-muted-foreground font-mono text-xs align-top">{time}</td>
                  {DAYS.map((d) => {
                    const cellEntries = getCellEntries(d.value, time)
                    return (
                      <td key={d.value} className="px-2 py-1.5 align-top min-w-[140px]">
                        {cellEntries.map((entry) => (
                          <div
                            key={entry.id}
                            className="bg-primary/10 border border-primary/20 rounded p-1 text-xs mb-1 group relative"
                          >
                            <div className="font-medium truncate pr-4">
                              {entry.courseAssignment.subject.name}
                            </div>
                            <div className="text-muted-foreground truncate">
                              {entry.courseAssignment.parallel.level.name} {entry.courseAssignment.parallel.name}
                            </div>
                            {entry.room && (
                              <div className="text-muted-foreground truncate">{entry.room}</div>
                            )}
                            <div className="text-muted-foreground text-[10px]">
                              {entry.startTime} – {entry.endTime}
                            </div>
                            {canManage && (
                              <button
                                onClick={() => handleDelete(entry)}
                                className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive/80 transition-opacity"
                                title="Eliminar bloque"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        ))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
