import { useQuery } from '@tanstack/react-query'
import { useState, type ElementType, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, Clock, GraduationCap } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { apiGet } from '@/shared/lib/api-client'
import { formatDate, todayLocalISO } from '@/shared/lib/utils'

interface TeacherTodayData {
  date: string
  period: { id: string; name: string } | null
  classes: Array<{
    courseAssignmentId: string
    startTime: string
    endTime: string
    room: string | null
    subject: string
    label: string
    attendanceMode: 'daily' | 'per_subject'
    attendanceTaken: boolean
  }>
  dailyAttendance: Array<{ parallelId: string; label: string; taken: boolean }>
  pendingGrading: Array<{
    activityId: string
    activityName: string
    courseAssignmentId: string
    periodId: string
    label: string
    subject: string
    graded: number
    total: number
  }>
  tasksDue: Array<{ id: string; title: string; dueDate: string; isPublished: boolean; subject: string; label: string }>
}

/** Panel "Hoy" del docente: todo lo accionable del día con enlace directo. */
export function TeacherToday() {
  const [expanded, setExpanded] = useState<'classes' | 'grades' | 'tasks' | null>(null)
  const date = todayLocalISO()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-teacher-today', date],
    queryFn: () => apiGet<TeacherTodayData>('dashboard/teacher-today', { date }),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border bg-card p-3">
        <Skeleton className="mb-3 h-5 w-28" />
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      </div>
    )
  }
  if (!data) return null

  const perSubjectClasses = data.classes.filter((c) => c.attendanceMode === 'per_subject')
  const pendingAttendance =
    perSubjectClasses.filter((c) => !c.attendanceTaken).length + data.dailyAttendance.filter((d) => !d.taken).length

  const panels: Array<{ id: 'classes' | 'grades' | 'tasks'; icon: ElementType; label: string; detail: string; count: number; content: ReactNode }> = [
    {
      id: 'classes', icon: CalendarClock, label: 'Clases',
      detail: pendingAttendance > 0 ? `${pendingAttendance} sin asistencia` : 'Asistencia al día',
      count: data.dailyAttendance.length + perSubjectClasses.length,
      content: data.classes.length === 0 && data.dailyAttendance.length === 0 ? (
        <Empty>No tienes clases en el horario de hoy.</Empty>
      ) : <ul className="divide-y">
        {data.dailyAttendance.map((d) => <Row key={d.parallelId} to={`/attendance?parallel=${d.parallelId}&date=${data.date}`} primary={`Asistencia diaria · ${d.label}`} secondary="Como tutor/a" status={<AttendanceStatus taken={d.taken} />} />)}
        {perSubjectClasses.map((c) => <Row key={`${c.courseAssignmentId}-${c.startTime}`} to={`/attendance?ca=${c.courseAssignmentId}&date=${data.date}`} primary={`${c.startTime}–${c.endTime} · ${c.subject}`} secondary={`${c.label}${c.room ? ` · ${c.room}` : ''}`} status={<AttendanceStatus taken={c.attendanceTaken} />} />)}
      </ul>,
    },
    {
      id: 'grades', icon: GraduationCap, label: 'Notas', count: data.pendingGrading.length,
      detail: data.pendingGrading.length ? 'Pendientes de calificar' : 'Todo calificado',
      content: data.pendingGrading.length === 0 ? <Empty><CheckCircle2 className="mr-1 inline h-4 w-4 text-green-600" aria-hidden />Todas tus actividades están calificadas.</Empty> : <ul className="divide-y">
        {data.pendingGrading.map((a) => <Row key={a.activityId} to={`/grades?assignmentId=${a.courseAssignmentId}&periodId=${a.periodId}&activityId=${a.activityId}`} primary={a.activityName} secondary={`${a.subject} · ${a.label}`} status={<span className="text-xs tabular-nums text-muted-foreground">{a.graded}/{a.total}</span>} />)}
      </ul>,
    },
    {
      id: 'tasks', icon: ClipboardList, label: 'Deberes', count: data.tasksDue.length,
      detail: data.tasksDue.length ? 'Vencen esta semana' : 'Sin vencimientos',
      content: data.tasksDue.length === 0 ? <Empty>No hay deberes por vencer en los próximos 7 días.</Empty> : <ul className="divide-y">
        {data.tasksDue.map((t) => <Row key={t.id} to="/tasks" primary={t.title} secondary={`${t.subject} · ${t.label} · entrega ${formatDate(t.dueDate)}`} status={!t.isPublished ? <Badge variant="secondary">Borrador</Badge> : undefined} />)}
      </ul>,
    },
  ]
  const selected = panels.find((panel) => panel.id === expanded)

  return (
    <section className="space-y-3 rounded-xl border bg-card p-3 shadow-sm" aria-labelledby="teacher-today-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="teacher-today-title" className="text-base font-semibold">Tu día</h2>
        {data.period && <span className="text-xs text-muted-foreground">{data.period.name}</span>}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {panels.map(({ id, icon: Icon, label, detail, count }) => {
          const active = expanded === id
          return <button key={id} type="button" aria-expanded={active} onClick={() => setExpanded(active ? null : id)} className={`min-w-0 rounded-lg border px-2 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 ${active ? 'border-primary bg-primary/5' : 'bg-background'}`}>
            <span className="flex items-center gap-2">
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-primary' : 'text-muted-foreground'}`} aria-hidden />
              <span className="truncate text-sm font-semibold">{label}</span>
              <span className="ml-auto text-lg font-bold leading-none tabular-nums">{count}</span>
            </span>
            <span className="mt-1 block truncate text-[11px] text-muted-foreground sm:text-xs">{detail}</span>
          </button>
        })}
      </div>

      {selected && <div className="rounded-lg border bg-background px-3 py-1" role="region" aria-label={`Detalle de ${selected.label}`}>{selected.content}</div>}
    </section>
  )
}

function Row({ to, primary, secondary, status }: { to: string; primary: string; secondary: string; status?: ReactNode }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{primary}</p>
          <p className="truncate text-xs text-muted-foreground">{secondary}</p>
        </div>
        {status}
      </Link>
    </li>
  )
}

function AttendanceStatus({ taken }: { taken: boolean }) {
  return taken ? (
    <Badge variant="success" className="gap-1"><ClipboardCheck className="h-3 w-3" aria-hidden />Tomada</Badge>
  ) : (
    <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-800"><Clock className="h-3 w-3" aria-hidden />Pendiente</Badge>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-3 text-sm text-muted-foreground">{children}</p>
}
