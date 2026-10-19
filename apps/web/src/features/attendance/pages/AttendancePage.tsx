import * as React from 'react'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCheck, CheckCircle2, Clock, Save, Users } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { Card } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage, todayLocalISO } from '@/shared/lib/utils'
import {
  getAttendance,
  bulkSaveAttendance,
  getDailyAttendance,
  bulkSaveDailyAttendance,
  getAssignments,
  type AttendanceEntry,
} from '@/features/attendance/api/attendance.api'
import { useUnsavedChanges } from '@/shared/hooks/useUnsavedChanges'

// ---- Types ----

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

interface LocalRecord {
  status: AttendanceStatus
  notes: string
}

// ---- Status config ----

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; className: string }
> = {
  present: {
    label: 'Presente',
    className: 'bg-green-100 text-green-700 border-green-300',
  },
  absent: {
    label: 'Ausente',
    className: 'bg-red-100 text-red-700 border-red-300',
  },
  late: {
    label: 'Tarde',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  },
  excused: {
    label: 'Justificado',
    className: 'bg-blue-100 text-blue-700 border-blue-300',
  },
}

const ALL_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

// ---- Main Page ----

export function AttendancePage() {
  const qc = useQueryClient()
  // Enlaces directos desde el panel "Hoy": ?ca=<asignación> o ?parallel=<paralelo>, y &date=
  const [searchParams] = useSearchParams()
  const linkedParallel = searchParams.get('parallel')
  const linkedDate = searchParams.get('date')

  const [selectedValue, setSelectedValue] = useState(
    () => (linkedParallel ? `parallel:${linkedParallel}` : searchParams.get('ca') ?? ''),
  )
  const [selectedDate, setSelectedDate] = useState(
    () => (linkedDate && /^\d{4}-\d{2}-\d{2}$/.test(linkedDate) ? linkedDate : todayLocalISO()),
  )
  const [localRecords, setLocalRecords] = useState<Map<string, LocalRecord>>(
    new Map(),
  )
  const [isDirty, setIsDirty] = useState(false)

  // ---- Queries ----

  const { data: assignments = [] } = useQuery({
    queryKey: ['assignments'],
    queryFn: () => getAssignments(),
  })

  // Opciones del selector: en niveles "diaria" se muestra el PARALELO (sin
  // materia, deduplicado); en "por materia", cada asignación subject×paralelo.
  const options = React.useMemo(() => {
    const daily = new Map<
      string,
      { value: string; label: string; isDaily: true; parallelId: string }
    >()
    const perSubject: Array<{
      value: string
      label: string
      isDaily: false
      courseAssignmentId: string
    }> = []
    for (const a of assignments) {
      const base = `${a.parallel.level.name} - ${a.parallel.name}`
      if (a.parallel.level.attendanceMode === 'daily') {
        if (!daily.has(a.parallel.id)) {
          daily.set(a.parallel.id, {
            value: `parallel:${a.parallel.id}`,
            label: `${base} (diaria)`,
            isDaily: true,
            parallelId: a.parallel.id,
          })
        }
      } else {
        perSubject.push({
          value: a.id,
          label: `${base} / ${a.subject.name}`,
          isDaily: false,
          courseAssignmentId: a.id,
        })
      }
    }
    return [...daily.values(), ...perSubject]
  }, [assignments])

  const selected = options.find((o) => o.value === selectedValue)
  const isDaily = selected?.isDaily ?? false
  const parallelId = selected && selected.isDaily ? selected.parallelId : ''
  const courseAssignmentId = selected && !selected.isDaily ? selected.courseAssignmentId : ''

  const {
    data: attendanceData = [],
    isLoading: attendanceLoading,
  } = useQuery({
    queryKey: ['attendance', selectedValue, selectedDate],
    queryFn: () =>
      isDaily
        ? getDailyAttendance(parallelId, selectedDate)
        : getAttendance(courseAssignmentId, selectedDate),
    enabled: !!selectedValue && !!selectedDate,
  })

  // Ya hay registros guardados para esta fecha/curso (si no, todos aparecen
  // "presentes" por defecto y se puede guardar sin tocar nada).
  const alreadyTaken = attendanceData.some((entry: AttendanceEntry) => !!entry.record)
  const { confirmDiscard } = useUnsavedChanges(isDirty)

  // ---- Initialize local records when attendance data loads ----

  useEffect(() => {
    if (!attendanceData || attendanceData.length === 0) return
    const map = new Map<string, LocalRecord>()
    attendanceData.forEach((entry: AttendanceEntry) => {
      map.set(entry.student.id, {
        status: (entry.record?.status ?? 'present') as AttendanceStatus,
        notes: entry.record?.notes ?? '',
      })
    })
    setLocalRecords(map)
    setIsDirty(false)
  }, [attendanceData])

  // ---- Save mutation ----

  const saveMutation = useMutation({
    mutationFn: () => {
      const records = Array.from(localRecords.entries()).map(
        ([studentId, rec]) => ({
          studentId,
          status: rec.status,
          notes: rec.notes || undefined,
        }),
      )
      return isDaily
        ? bulkSaveDailyAttendance({ parallelId, date: selectedDate, records })
        : bulkSaveAttendance({
            courseAssignmentId,
            date: selectedDate,
            records,
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['attendance', selectedValue, selectedDate],
      })
      toast.success('Asistencia guardada correctamente')
      setIsDirty(false)
    },
    onError: (err) => {
      toast.error(getErrorMessage(err) || 'Error al guardar la asistencia')
    },
  })

  // ---- Handlers ----

  function handleStatusChange(studentId: string, status: AttendanceStatus) {
    setLocalRecords((prev) => {
      const next = new Map(prev)
      const existing = next.get(studentId) ?? { status: 'present', notes: '' }
      next.set(studentId, { ...existing, status })
      return next
    })
    setIsDirty(true)
  }

  function handleNotesChange(studentId: string, notes: string) {
    setLocalRecords((prev) => {
      const next = new Map(prev)
      const existing = next.get(studentId) ?? { status: 'present' as AttendanceStatus, notes: '' }
      next.set(studentId, { ...existing, notes })
      return next
    })
    setIsDirty(true)
  }

  function markAllPresent() {
    setLocalRecords((prev) => {
      const next = new Map(prev)
      next.forEach((rec, id) => next.set(id, { ...rec, status: 'present' }))
      return next
    })
    setIsDirty(true)
  }

  async function handleAssignmentChange(value: string) {
    if (value === selectedValue || !(await confirmDiscard())) return
    setSelectedValue(value)
    setLocalRecords(new Map())
    setIsDirty(false)
  }

  async function handleDateChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value
    if (!(await confirmDiscard())) return
    setSelectedDate(value)
    setLocalRecords(new Map())
    setIsDirty(false)
  }

  // ---- Counts ----

  const counts = React.useMemo(() => {
    const result = { present: 0, absent: 0, late: 0, excused: 0 }
    localRecords.forEach((rec) => {
      result[rec.status] = (result[rec.status] ?? 0) + 1
    })
    return result
  }, [localRecords])

  // ---- Render ----

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Asistencia</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registra y consulta la asistencia de los estudiantes
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-72">
          <Select value={selectedValue} onValueChange={handleAssignmentChange}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar grado / materia" />
            </SelectTrigger>
            <SelectContent>
              {options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-auto">
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:h-9 sm:w-44 sm:text-sm"
          />
        </div>
      </div>

      {/* Daily mode banner */}
      {selectedValue && isDaily && (
        <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          Asistencia <strong>diaria</strong>: se registra una sola vez al día para todo el paralelo
          (la toma el tutor), independientemente de la materia.
        </div>
      )}

      {/* Content area */}
      {!selectedValue ? (
        <EmptyState
          icon={Users}
          title="Selecciona un grado y fecha"
          description="Elige el grado/materia y la fecha para ver y registrar la asistencia"
        />
      ) : attendanceLoading ? (
        <PageLoader />
      ) : attendanceData.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin estudiantes"
          description="No hay estudiantes registrados para esta asignación"
        />
      ) : (
        <div className="space-y-4">
          {/* Summary counts + Save button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {alreadyTaken ? (
                <Badge variant="success" className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Registrada
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800">
                  <Clock className="h-3.5 w-3.5" aria-hidden /> Pendiente de registrar
                </Badge>
              )}
              {ALL_STATUSES.map((status) => (
                <span
                  key={status}
                  className={cn(
                    'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border',
                    STATUS_CONFIG[status].className,
                  )}
                >
                  {STATUS_CONFIG[status].label}:{' '}
                  <span className="font-bold">{counts[status]}</span>
                </span>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" onClick={markAllPresent} className="w-full sm:w-auto">
                <CheckCheck className="h-4 w-4 mr-1" />
                Todos presentes
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                // Sin registros previos se puede guardar directamente (todos presentes).
                disabled={(alreadyTaken && !isDirty) || saveMutation.isPending}
                className="w-full sm:w-auto"
              >
                <Save className="h-4 w-4 mr-1" />
                {saveMutation.isPending ? 'Guardando...' : alreadyTaken ? 'Guardar cambios' : 'Guardar asistencia'}
              </Button>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {attendanceData.map((entry, index) => {
              const studentId = entry.student.id
              const local = localRecords.get(studentId) ?? {
                status: 'present' as AttendanceStatus,
                notes: '',
              }
              const fullName = `${entry.student.profile.firstName} ${entry.student.profile.lastName}`

              return (
                <Card key={studentId}>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">#{index + 1}</p>
                        <p className="font-medium">{fullName}</p>
                        {entry.student.profile.dni && (
                          <p className="text-xs text-muted-foreground">
                            {entry.student.profile.dni}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium',
                          STATUS_CONFIG[local.status].className,
                        )}
                      >
                        {STATUS_CONFIG[local.status].label}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {ALL_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => handleStatusChange(studentId, status)}
                          className={cn(
                            'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                            local.status === status
                              ? STATUS_CONFIG[status].className
                              : 'bg-transparent text-muted-foreground border-border hover:bg-muted',
                          )}
                        >
                          {STATUS_CONFIG[status].label}
                        </button>
                      ))}
                    </div>

                    <Input
                      value={local.notes}
                      onChange={(e) => handleNotesChange(studentId, e.target.value)}
                      placeholder="Observación..."
                      className="h-10"
                    />
                  </div>
                </Card>
              )
            })}
          </div>

          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Estudiante</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Notas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attendanceData.map((entry, index) => {
                  const studentId = entry.student.id
                  const local = localRecords.get(studentId) ?? {
                    status: 'present' as AttendanceStatus,
                    notes: '',
                  }
                  const fullName = `${entry.student.profile.firstName} ${entry.student.profile.lastName}`

                  return (
                    <TableRow key={studentId}>
                      <TableCell className="text-muted-foreground text-xs">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{fullName}</p>
                          {entry.student.profile.dni && (
                            <p className="text-xs text-muted-foreground">
                              {entry.student.profile.dni}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 flex-wrap">
                          {ALL_STATUSES.map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => handleStatusChange(studentId, status)}
                              className={cn(
                                'px-2.5 py-1 text-xs rounded border font-medium transition-colors',
                                local.status === status
                                  ? STATUS_CONFIG[status].className
                                  : 'bg-transparent text-muted-foreground border-border hover:bg-muted',
                              )}
                            >
                              {STATUS_CONFIG[status].label}
                            </button>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={local.notes}
                          onChange={(e) =>
                            handleNotesChange(studentId, e.target.value)
                          }
                          placeholder="Observación..."
                          className="h-7 w-44 text-xs"
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
