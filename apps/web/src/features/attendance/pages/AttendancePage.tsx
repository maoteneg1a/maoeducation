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
  getClassHour,
  saveClassHour,
  getClassHistory,
  getAttendance,
  bulkSaveAttendance,
  getDailyAttendance,
  bulkSaveDailyAttendance,
  getAssignments,
  getTutorAssignments,
  getStudentAbsences,
  type AttendanceEntry,
} from '@/features/attendance/api/attendance.api'
import { useUnsavedChanges } from '@/shared/hooks/useUnsavedChanges'
import { getSchedule } from '@/features/schedules/api/schedules.api'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'
import { RequestJustificationDialog } from '@/features/attendance/components/RequestJustificationDialog'

// ---- Types ----

type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused'

interface LocalRecord {
  status: AttendanceStatus | null
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

const EMPTY_ATTENDANCE: AttendanceEntry[] = []

const ALL_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'excused']

// ---- Main Page ----

export function AttendancePage() {
  const { hasAnyRole } = usePermissions()
  if (hasAnyRole('student', 'guardian')) return <FamilyAttendancePage />
  return <StaffAttendancePage />
}

function StaffAttendancePage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const privileged = user?.roles.some((r) => ['admin', 'rector', 'inspector', 'dece'].includes(r)) ?? false
  const [period, setPeriod] = useState(1)
  // Enlaces directos desde el panel "Hoy": ?ca=<asignación> o ?parallel=<paralelo>, y &date=
  const [searchParams] = useSearchParams()
  const [view, setView] = useState<'day' | 'tutor' | 'class'>(() => searchParams.get('ca') ? 'class' : 'day')
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
  const { data: tutorAssignments = [] } = useQuery({
    queryKey: ['attendance-tutor-assignments'],
    queryFn: getTutorAssignments,
  })
  const { data: schedule = [] } = useQuery({
    queryKey: ['attendance-own-schedule', user?.id],
    queryFn: () => getSchedule(user?.id ? { teacherId: user.id } : undefined),
    enabled: !!user?.id && !privileged,
  })

  const dailyTutorAssignments = React.useMemo(() => assignments.filter((assignment) =>
    assignment.parallel.level.attendanceMode === 'daily'
    && (privileged || assignment.parallel.tutorId === user?.id)), [assignments, privileged, user?.id])
  const upperTutorParallels = React.useMemo(() => [...new Map(tutorAssignments
    .filter((assignment) => assignment.parallel.level.attendanceMode === 'per_subject')
    .map((assignment) => [assignment.parallel.id, assignment.parallel])).values()], [tutorAssignments])
  const hasDailyTutorGrade = dailyTutorAssignments.length > 0

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
    const visibleAssignments = view === 'tutor' ? tutorAssignments : assignments
    for (const a of visibleAssignments) {
      if (view === 'tutor' && a.parallel.level.attendanceMode !== 'per_subject') continue
      const base = `${a.parallel.level.name} - ${a.parallel.name}`
      if (view === 'day') {
        if (a.parallel.level.attendanceMode === 'daily' && (privileged || a.parallel.tutorId === user?.id)) {
          if (!daily.has(a.parallel.id)) {
            daily.set(a.parallel.id, {
              value: `parallel:${a.parallel.id}`,
              label: `${base} (lista diaria)`,
              isDaily: true,
              parallelId: a.parallel.id,
            })
          }
        }
        continue
      }
      perSubject.push({
        value: a.id,
        label: `${base} / ${a.subject.name}`,
        isDaily: false,
        courseAssignmentId: a.id,
      })
    }
    return [...daily.values(), ...perSubject]
  }, [assignments, privileged, tutorAssignments, user?.id, view])

  useEffect(() => {
    if (!assignments.length || selectedValue || isDirty) return
    if (view === 'day') {
      const parallels = [...new Set(dailyTutorAssignments.map((assignment) => assignment.parallel.id))]
      if (parallels.length === 1) setSelectedValue(`parallel:${parallels[0]}`)
      else if (parallels.length === 0 && upperTutorParallels.length > 0) setView('tutor')
      else if (parallels.length === 0 && !privileged) setView('class')
    } else if (options.length === 1) setSelectedValue(options[0].value)
  }, [assignments, dailyTutorAssignments, isDirty, options, privileged, selectedValue, upperTutorParallels.length, view])

  const selected = options.find((o) => o.value === selectedValue)
  const isDaily = selected?.isDaily ?? false
  const parallelId = selected && selected.isDaily ? selected.parallelId : ''
  const courseAssignmentId = selected && !selected.isDaily ? selected.courseAssignmentId : ''
  const assignment = [...assignments, ...tutorAssignments].find((a) => a.id === courseAssignmentId)
  const isClassHour = !isDaily && !!assignment
  const selectedWeekday = selectedDate ? new Date(`${selectedDate}T12:00:00`).getDay() : 0
  const tutorSchedule = React.useMemo(() => tutorAssignments.flatMap((item) =>
    (item.schedule ?? []).map((entry) => ({ ...entry, courseAssignmentId: item.id }))), [tutorAssignments])
  const activeSchedule = view === 'tutor'
    ? tutorSchedule
    : schedule.map((entry) => ({ ...entry, courseAssignmentId: entry.courseAssignment.id }))
  const weekdayStarts = React.useMemo(() => [...new Set(activeSchedule.filter((entry) => entry.weekday === selectedWeekday).map((entry) => entry.startTime))].sort(), [activeSchedule, selectedWeekday])
  const scheduledHours = React.useMemo(() => activeSchedule
    .filter((entry) => entry.weekday === selectedWeekday && entry.courseAssignmentId === courseAssignmentId)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((entry) => ({ period: Math.max(1, weekdayStarts.indexOf(entry.startTime) + 1), label: `${entry.startTime}–${entry.endTime}` })), [activeSchedule, courseAssignmentId, selectedWeekday, weekdayStarts])
  useEffect(() => {
    if (isDirty || !scheduledHours.length || scheduledHours.some((hour) => hour.period === period)) return
    setPeriod(scheduledHours[0].period)
  }, [isDirty, period, scheduledHours])
  const canWrite = view !== 'tutor' && (!isDaily || privileged || assignments.some((a) => a.parallel.id === parallelId && a.parallel.tutorId === user?.id))
  const { data: history = [] } = useQuery({
    queryKey: ['class-attendance-history', courseAssignmentId],
    queryFn: () => getClassHistory(courseAssignmentId), enabled: !!isClassHour,
  })

  const {
    data: attendanceData = EMPTY_ATTENDANCE,
    isLoading: attendanceLoading,
    isError: attendanceError,
  } = useQuery({
    queryKey: ['attendance', selectedValue, selectedDate, isClassHour ? period : 0],
    queryFn: () =>
      isDaily
        ? getDailyAttendance(parallelId, selectedDate)
        : isClassHour ? getClassHour(courseAssignmentId, selectedDate, period) : getAttendance(courseAssignmentId, selectedDate),
    enabled: !!selected && !!selectedDate,
  })

  // Sin un registro guardado, el estado permanece pendiente de marcar.
  const alreadyTaken = attendanceData.some((entry: AttendanceEntry) => !!entry.record)
  const { confirmDiscard } = useUnsavedChanges(isDirty)

  // ---- Initialize local records when attendance data loads ----

  useEffect(() => {
    if (isDirty) return
    const map = new Map<string, LocalRecord>()
    attendanceData.forEach((entry: AttendanceEntry) => {
      map.set(entry.student.id, {
        status: entry.record?.status ?? null,
        notes: entry.record?.notes ?? '',
      })
    })
    setLocalRecords(map)
    setIsDirty(false)
  }, [attendanceData, isDirty])

  // ---- Save mutation ----

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!canWrite || Array.from(localRecords.values()).some((r) => !r.status)) throw new Error('Marca la asistencia de todos los estudiantes antes de guardar')
      const records = Array.from(localRecords.entries()).map(
        ([studentId, rec]) => ({
          studentId,
          status: rec.status!,
          notes: rec.notes || undefined,
        }),
      )
      return isDaily
        ? bulkSaveDailyAttendance({ parallelId, date: selectedDate, records })
        : isClassHour ? saveClassHour({ courseAssignmentId, date: selectedDate, period, records }) : bulkSaveAttendance({
            courseAssignmentId,
            date: selectedDate,
            records,
          })
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ['attendance'],
      })
      qc.invalidateQueries({ queryKey: ['class-attendance-history', courseAssignmentId] })
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
      const existing = next.get(studentId) ?? { status: null, notes: '' }
      next.set(studentId, { ...existing, status })
      return next
    })
    setIsDirty(true)
  }

  function handleNotesChange(studentId: string, notes: string) {
    setLocalRecords((prev) => {
      const next = new Map(prev)
      const existing = next.get(studentId) ?? { status: null, notes: '' }
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
      if (rec.status) result[rec.status] += 1
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

      {(hasDailyTutorGrade || upperTutorParallels.length > 0 || privileged) && <div className="flex flex-wrap gap-2" aria-label="Tipo de asistencia">
        {([...(hasDailyTutorGrade || privileged ? ['day' as const] : []), ...(upperTutorParallels.length > 0 ? ['tutor' as const] : []), 'class' as const]).map((v) => <Button key={v} disabled={saveMutation.isPending} variant={view === v ? 'default' : 'outline'} onClick={async () => {
          if (v === view || !(await confirmDiscard())) return
          setView(v); setSelectedValue(''); setLocalRecords(new Map()); setIsDirty(false)
        }}>{v === 'day' ? 'Lista diaria' : v === 'tutor' ? 'Mi tutoría' : 'Mis clases'}</Button>)}
      </div>}
      {upperTutorParallels.length > 0 && <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <p className="font-semibold">Tu tutoría: {upperTutorParallels.map((parallel) => `${parallel.level.name} ${parallel.name}`).join(', ')}</p>
        <p className="mt-1">En «Mi tutoría» consultas la asistencia registrada por todos los docentes. En «Mis clases» registras únicamente las clases que impartes.</p>
      </div>}
      <p className="text-sm text-muted-foreground">
        {view === 'day'
          ? 'Para tutores de 2.º a 7.º: registra una sola asistencia para toda la jornada. Las materias especiales no duplican este registro.'
          : view === 'tutor'
            ? 'Selecciona una materia y hora para consultar el registro de tu tutoría. Esta vista es solo lectura.'
            : 'Selecciona únicamente la clase que impartiste. En 2.º a 7.º este registro no reemplaza la lista diaria del tutor.'}
      </p>
      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:gap-4">
        <div className="w-full sm:w-72">
          <label className="mb-1 block text-sm font-medium">{view === 'day' ? 'Grado de mi tutoría' : view === 'tutor' ? 'Materia de mi tutoría' : 'Clase que impartí'}</label>
          <Select disabled={saveMutation.isPending} value={selectedValue} onValueChange={handleAssignmentChange}>
            <SelectTrigger>
              <SelectValue placeholder={view === 'day' ? 'Seleccionar mi grado' : view === 'tutor' ? 'Seleccionar materia' : 'Seleccionar mi materia y grado'} />
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
          <label className="mb-1 block text-sm font-medium">Fecha</label>
          <input
            type="date"
            disabled={saveMutation.isPending}
            value={selectedDate}
            onChange={handleDateChange}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring sm:h-9 sm:w-44 sm:text-sm"
          />
        </div>
      </div>

      {isClassHour && <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-sm font-medium">Hora de la clase
          <select disabled={saveMutation.isPending} className="h-9 rounded-md border bg-background px-3" value={period} onChange={async (e) => {
            const next = Number(e.target.value)
            if (!(await confirmDiscard())) return
            setPeriod(next); setLocalRecords(new Map()); setIsDirty(false)
          }}>{(scheduledHours.length ? scheduledHours : Array.from({ length: 10 }, (_, i) => ({ period: i + 1, label: `${i + 1}.ª hora` }))).map((hour) => <option key={hour.period} value={hour.period}>{hour.label}</option>)}</select>
        </label>
        <p className="text-sm text-muted-foreground">{scheduledHours.length ? 'Las horas corresponden a tu horario para el día seleccionado.' : 'Esta materia no tiene un bloque en el horario del día seleccionado. Puedes escoger la hora manualmente o pedir que completen el horario.'}</p>
        {assignment.parallel.level.attendanceMode === 'daily' && <p className="text-xs text-muted-foreground">En 2.º a 7.º este registro deja constancia de tu clase, pero no reemplaza ni duplica la lista diaria del tutor.</p>}
        {history.length > 0 && <details><summary className="cursor-pointer text-sm">Historial de horas registradas (últimas 100)</summary><div className="flex flex-wrap gap-2 py-2">{history.map((h) => <Button key={`${h.date}:${h.period}`} disabled={saveMutation.isPending} size="sm" variant="outline" onClick={async () => {
          if (!(await confirmDiscard())) return
          setSelectedDate(h.date.slice(0, 10)); setPeriod(h.period); setLocalRecords(new Map()); setIsDirty(false)
        }}>{h.date.slice(0, 10)} · {h.period}ª hora · {h._count._all} estudiantes</Button>)}</div></details>}
      </div>}
      {isDaily && !canWrite && <p className="text-sm text-muted-foreground">Consulta de la jornada. El tutor registra la lista diaria; registra tu materia en «Asistencia por hora».</p>}
      {view === 'tutor' && selectedValue && <p className="text-sm text-muted-foreground">Solo consulta: la asistencia la registra el docente de esta materia.</p>}
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
          title={view === 'day' ? 'Selecciona tu grado y fecha' : view === 'tutor' ? 'Selecciona una materia y fecha' : 'Selecciona tu materia, grado y fecha'}
          description={view === 'day' ? 'El tutor registra una sola lista para toda la jornada.' : view === 'tutor' ? 'Aquí puedes consultar lo registrado por los docentes de tu tutoría.' : 'Cada docente registra únicamente la hora de la materia que impartió.'}
        />
      ) : attendanceLoading ? (
        <PageLoader />
      ) : attendanceError ? (
        <EmptyState icon={Users} title="No se pudo consultar la asistencia" description="Vuelve a intentarlo. Tus cambios pendientes se conservan mientras permaneces aquí." />
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
              <Button variant="outline" onClick={markAllPresent} disabled={!canWrite || saveMutation.isPending} className="w-full sm:w-auto">
                <CheckCheck className="h-4 w-4 mr-1" />
                Todos presentes
              </Button>
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={!canWrite || !isDirty || saveMutation.isPending || localRecords.size === 0 || Array.from(localRecords.values()).some((r) => !r.status)}
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
                status: null,
                notes: '',
              }
              const fullName = `${entry.student.profile.lastName} ${entry.student.profile.firstName}`

              return (
                <Card key={studentId}>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">#{index + 1}</p>
                        <p className="break-words text-sm font-semibold leading-tight">{fullName}</p>
                        {isClassHour && <p className="text-xs text-muted-foreground">Jornada del tutor: {entry.dailyRecord ? STATUS_CONFIG[entry.dailyRecord.status].label : 'Sin registrar'}</p>}
                        {!local.status && <p className="text-xs text-muted-foreground">Sin registrar</p>}
                        {entry.student.profile.dni && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            CI: {entry.student.profile.dni}
                          </p>
                        )}
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium',
                          local.status ? STATUS_CONFIG[local.status].className : 'text-muted-foreground',
                        )}
                      >
                        {local.status ? STATUS_CONFIG[local.status].label : 'Sin registrar'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {ALL_STATUSES.map((status) => (
                        <button
                          key={status}
                          type="button"
                          disabled={!canWrite || saveMutation.isPending}
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
                      disabled={!canWrite || saveMutation.isPending}
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
                    status: null,
                    notes: '',
                  }
                  const fullName = `${entry.student.profile.lastName} ${entry.student.profile.firstName}`

                  return (
                    <TableRow key={studentId}>
                      <TableCell className="text-muted-foreground text-xs">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="max-w-xs whitespace-normal break-words text-xs font-semibold leading-tight">{fullName}</p>
                          {isClassHour && <p className="text-xs text-muted-foreground">Jornada del tutor: {entry.dailyRecord ? STATUS_CONFIG[entry.dailyRecord.status].label : 'Sin registrar'}</p>}
                          {!local.status && <p className="text-xs text-muted-foreground">Sin registrar</p>}
                          {entry.student.profile.dni && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              CI: {entry.student.profile.dni}
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
                              disabled={!canWrite || saveMutation.isPending}
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
                          disabled={!canWrite || saveMutation.isPending}
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

function FamilyAttendancePage() {
  const user = useAuthStore((state) => state.user)
  const { hasAnyRole } = usePermissions()
  const isGuardian = hasAnyRole('guardian')
  const selectedChildId = useGuardianStudentId()
  const studentId = isGuardian ? selectedChildId : user?.id
  const [justifyOpen, setJustifyOpen] = useState(false)
  const { data, isLoading } = useQuery({
    queryKey: ['student-absences', studentId],
    queryFn: () => getStudentAbsences(studentId!),
    enabled: !!studentId,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  if (isLoading) return <PageLoader />
  if (!studentId || !data) return <EmptyState icon={Users} title="Sin estudiante seleccionado" description="Selecciona un estudiante para consultar su asistencia." />

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asistencia</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ausencias y atrasos registrados por la institución.</p>
        </div>
        {data.records.length > 0 && <Button variant="outline" onClick={() => setJustifyOpen(true)}>Solicitar justificación</Button>}
      </div>

      <Card>
        <div className="p-4">
          <p className="break-words text-sm font-semibold leading-tight">{data.student.fullName}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {data.student.dni ? `CI: ${data.student.dni} · ` : ''}{data.levelName} {data.parallelName}
          </p>
        </div>
      </Card>

      {data.records.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Sin novedades de asistencia" description="No hay ausencias ni atrasos registrados." />
      ) : (
        <div className="space-y-2">
          {data.records.map((record) => (
            <Card key={record.id}>
              <div className="flex items-center justify-between gap-3 p-3 sm:p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{formatAttendanceDate(record.date)}</p>
                  <p className="truncate text-xs text-muted-foreground">{record.subject?.name ?? 'Jornada diaria'}{record.notes ? ` · ${record.notes}` : ''}</p>
                </div>
                <Badge variant={record.status === 'absent' ? 'destructive' : 'warning'}>{record.status === 'absent' ? 'Ausente' : 'Tarde'}</Badge>
              </div>
            </Card>
          ))}
        </div>
      )}
      <RequestJustificationDialog studentId={studentId} open={justifyOpen} onOpenChange={setJustifyOpen} />
    </div>
  )
}

function formatAttendanceDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(year, month - 1, day))
}
