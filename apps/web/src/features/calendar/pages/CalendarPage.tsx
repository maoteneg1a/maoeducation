import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, BookOpen, CalendarDays } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { cn } from '@/shared/lib/utils'
import { tasksApi, type Task } from '@/features/tasks/api/tasks.api'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { useAuthStore } from '@/store/auth.store'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'

// ─── Subject color palette ────────────────────────────────────────────────────

const SUBJECT_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-orange-500',
  'bg-pink-500', 'bg-cyan-500', 'bg-amber-500', 'bg-rose-500',
]

function useSubjectColors(tasks: Task[]) {
  return React.useMemo(() => {
    const map = new Map<string, string>()
    tasks.forEach((t) => {
      if (!map.has(t.courseAssignmentId)) {
        map.set(t.courseAssignmentId, SUBJECT_COLORS[map.size % SUBJECT_COLORS.length])
      }
    })
    return map
  }, [tasks])
}

// ─── Calendar helpers ────────────────────────────────────────────────────────

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: Array<Date | null> = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d))
  return days
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ─── Day Cell ────────────────────────────────────────────────────────────────

interface DayCellProps {
  date: Date
  tasks: Task[]
  colorMap: Map<string, string>
  isSelected: boolean
  isToday: boolean
  onClick: () => void
}

function DayCell({ date, tasks, colorMap, isSelected, isToday, onClick }: DayCellProps) {
  const hasOverdue = tasks.some((t) => new Date(t.dueDate) < new Date() && !t.isPublished)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative min-h-[72px] p-1.5 rounded-lg border text-left transition-colors w-full',
        isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-transparent hover:border-border hover:bg-muted/50',
        isToday && !isSelected && 'border-primary/30 bg-primary/3',
      )}
    >
      <span className={cn(
        'inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium',
        isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
      )}>
        {date.getDate()}
      </span>
      <div className="mt-1 flex flex-col gap-0.5">
        {tasks.slice(0, 3).map((task) => (
          <div
            key={task.id}
            className={cn(
              'truncate rounded px-1 py-0.5 text-[10px] text-white font-medium leading-tight',
              colorMap.get(task.courseAssignmentId) ?? 'bg-primary',
            )}
            title={task.title}
          >
            {task.title}
          </div>
        ))}
        {tasks.length > 3 && (
          <div className="text-[10px] text-muted-foreground px-1">+{tasks.length - 3} más</div>
        )}
      </div>
    </button>
  )
}

// ─── Side panel (selected day) ────────────────────────────────────────────────

interface DayPanelProps {
  date: Date
  tasks: Task[]
  colorMap: Map<string, string>
  onClose: () => void
}

function DayPanel({ date, tasks, colorMap, onClose }: DayPanelProps) {
  const label = date.toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3 w-full">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold capitalize">{label}</h3>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={onClose}>×</Button>
      </div>
      {tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin tareas este día.</p>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks?taskId=${task.id}`}
              className="flex gap-3 rounded-md -mx-2 px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className={cn('mt-1 h-3 w-1 rounded-full shrink-0', colorMap.get(task.courseAssignmentId) ?? 'bg-primary')} />
              <div className="space-y-0.5">
                <p className="text-sm font-medium leading-snug">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.courseAssignment.subject.name} · {task.courseAssignment.parallel.level.name} {task.courseAssignment.parallel.name}
                </p>
                {task.description && (
                  <p className="text-xs text-muted-foreground leading-relaxed">{task.description}</p>
                )}
                <div className="flex items-center gap-2 pt-0.5">
                  {!task.isPublished && <Badge variant="secondary" className="text-[10px] px-1.5">Borrador</Badge>}
                  <span className="text-xs font-medium text-primary">Ver tarea</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Legend ──────────────────────────────────────────────────────────────────

function Legend({ tasks, colorMap }: { tasks: Task[]; colorMap: Map<string, string> }) {
  const subjects = React.useMemo(() => {
    const seen = new Map<string, string>()
    tasks.forEach((t) => {
      if (!seen.has(t.courseAssignmentId)) {
        seen.set(t.courseAssignmentId, t.courseAssignment.subject.name)
      }
    })
    return Array.from(seen.entries())
  }, [tasks])

  if (subjects.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {subjects.map(([id, name]) => (
        <div key={id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <div className={cn('h-2.5 w-2.5 rounded-sm', colorMap.get(id) ?? 'bg-primary')} />
          {name}
        </div>
      ))}
    </div>
  )
}

// ─── Main Calendar Page ──────────────────────────────────────────────────────

export function CalendarPage() {
  const user = useAuthStore((s) => s.user)
  const isTeacher = user?.roles.includes('teacher') ?? false
  const { activeYear } = useTeacherDefaults()

  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth())
  const [selectedDate, setSelectedDate] = React.useState<Date | null>(null)

  // Fetch tasks for the visible month range (+/- 1 day buffer)
  const from = new Date(year, month, 1).toISOString().slice(0, 10)
  const to = new Date(year, month + 1, 0).toISOString().slice(0, 10)

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'calendar', year, month, activeYear?.id],
    queryFn: () => tasksApi.list({ from, to, ...(activeYear ? { academicYearId: activeYear.id } : {}) }),
  })

  const colorMap = useSubjectColors(tasks)

  // Index tasks by due date
  const tasksByDate = React.useMemo(() => {
    const map = new Map<string, Task[]>()
    tasks.forEach((t) => {
      const key = t.dueDate.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(t)
    })
    return map
  }, [tasks])

  const days = getMonthDays(year, month)
  const todayKey = toDateKey(now)
  const selectedKey = selectedDate ? toDateKey(selectedDate) : null

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const selectedTasks = selectedDate ? (tasksByDate.get(toDateKey(selectedDate)) ?? []) : []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Calendario</h1>
        <p className="text-sm text-muted-foreground">Fechas de entrega de tareas</p>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={prevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">
            {MONTHS[month]} {year}
          </h2>
          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={nextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>
          Hoy
        </Button>
      </div>

      <Legend tasks={tasks} colorMap={colorMap} />

      {isLoading ? (
        <PageLoader />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4 items-start">
          {/* Calendar grid */}
          <div className="space-y-1">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div key={d} className="text-xs font-medium text-muted-foreground text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, i) =>
                date === null ? (
                  <div key={`empty-${i}`} />
                ) : (
                  <DayCell
                    key={date.toISOString()}
                    date={date}
                    tasks={tasksByDate.get(toDateKey(date)) ?? []}
                    colorMap={colorMap}
                    isSelected={selectedKey === toDateKey(date)}
                    isToday={todayKey === toDateKey(date)}
                    onClick={() => setSelectedDate((prev) => prev && toDateKey(prev) === toDateKey(date) ? null : date)}
                  />
                )
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="space-y-3">
            {selectedDate ? (
              <DayPanel
                date={selectedDate}
                tasks={selectedTasks}
                colorMap={colorMap}
                onClose={() => setSelectedDate(null)}
              />
            ) : (
              <div className="rounded-xl border bg-muted/30 p-4 text-center space-y-2">
                <CalendarDays className="h-8 w-8 mx-auto text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">Haz clic en un día para ver las tareas</p>
              </div>
            )}

            {/* Upcoming tasks */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <h3 className="text-sm font-semibold">Próximas entregas</h3>
              {tasks
                .filter((t) => {
                  const d = daysUntil(t.dueDate)
                  return d >= 0 && d <= 14 && (t.isPublished || isTeacher)
                })
                .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
                .slice(0, 6)
                .map((t) => (
                  <Link
                    key={t.id}
                    to={`/tasks?taskId=${t.id}`}
                    className="flex items-start gap-2.5 rounded-md -mx-2 px-2 py-1.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className={cn('mt-1 h-2.5 w-1 rounded-full shrink-0', colorMap.get(t.courseAssignmentId) ?? 'bg-primary')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-snug truncate">{t.title}</p>
                      <p className="text-[10px] text-muted-foreground">{t.courseAssignment.subject.name}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {daysUntil(t.dueDate) === 0 ? 'Hoy' : `${daysUntil(t.dueDate)}d`}
                    </span>
                  </Link>
                ))}
              {tasks.filter((t) => daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 14).length === 0 && (
                <p className="text-xs text-muted-foreground">Sin entregas en los próximos 14 días</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}
