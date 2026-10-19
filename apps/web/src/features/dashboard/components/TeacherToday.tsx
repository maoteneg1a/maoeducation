import { useQuery } from '@tanstack/react-query'
import type { ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ClipboardCheck, ClipboardList, Clock, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
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
  const date = todayLocalISO()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-teacher-today', date],
    queryFn: () => apiGet<TeacherTodayData>('dashboard/teacher-today', { date }),
    staleTime: 60_000,
  })

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full" />)}
      </div>
    )
  }
  if (!data) return null

  const perSubjectClasses = data.classes.filter((c) => c.attendanceMode === 'per_subject')
  const pendingAttendance =
    perSubjectClasses.filter((c) => !c.attendanceTaken).length + data.dailyAttendance.filter((d) => !d.taken).length

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Tu día</h2>
        {data.period && <span className="text-xs text-muted-foreground">{data.period.name}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={CalendarClock}
          title="Clases de hoy"
          badge={pendingAttendance > 0 ? `${pendingAttendance} sin asistencia` : undefined}
        >
          {data.classes.length === 0 && data.dailyAttendance.length === 0 ? (
            <Empty>No tienes clases en el horario de hoy.</Empty>
          ) : (
            <ul className="divide-y">
              {data.dailyAttendance.map((d) => (
                <Row
                  key={d.parallelId}
                  to={`/attendance?parallel=${d.parallelId}&date=${data.date}`}
                  primary={`Asistencia diaria · ${d.label}`}
                  secondary="Como tutor/a"
                  status={<AttendanceStatus taken={d.taken} />}
                />
              ))}
              {perSubjectClasses.map((c) => (
                <Row
                  key={`${c.courseAssignmentId}-${c.startTime}`}
                  to={`/attendance?ca=${c.courseAssignmentId}&date=${data.date}`}
                  primary={`${c.startTime}–${c.endTime} · ${c.subject}`}
                  secondary={`${c.label}${c.room ? ` · ${c.room}` : ''}`}
                  status={<AttendanceStatus taken={c.attendanceTaken} />}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={GraduationCap}
          title="Notas pendientes"
          badge={data.pendingGrading.length > 0 ? String(data.pendingGrading.length) : undefined}
        >
          {data.pendingGrading.length === 0 ? (
            <Empty>
              <CheckCircle2 className="mr-1 inline h-4 w-4 text-green-600" aria-hidden />
              Todas tus actividades están calificadas.
            </Empty>
          ) : (
            <ul className="divide-y">
              {data.pendingGrading.map((a) => (
                <Row
                  key={a.activityId}
                  to={`/grades?assignmentId=${a.courseAssignmentId}&periodId=${a.periodId}&activityId=${a.activityId}`}
                  primary={a.activityName}
                  secondary={`${a.subject} · ${a.label}`}
                  status={<span className="text-xs tabular-nums text-muted-foreground">{a.graded}/{a.total}</span>}
                />
              ))}
            </ul>
          )}
        </Panel>

        <Panel icon={ClipboardList} title="Tareas que vencen esta semana">
          {data.tasksDue.length === 0 ? (
            <Empty>No hay tareas por vencer en los próximos 7 días.</Empty>
          ) : (
            <ul className="divide-y">
              {data.tasksDue.map((t) => (
                <Row
                  key={t.id}
                  to="/tasks"
                  primary={t.title}
                  secondary={`${t.subject} · ${t.label} · entrega ${formatDate(t.dueDate)}`}
                  status={!t.isPublished ? <Badge variant="secondary">Borrador</Badge> : undefined}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

function Panel({ icon: Icon, title, badge, children }: { icon: ElementType; title: string; badge?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
          {title}
          {badge && <Badge variant="warning" className="ml-auto">{badge}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
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
