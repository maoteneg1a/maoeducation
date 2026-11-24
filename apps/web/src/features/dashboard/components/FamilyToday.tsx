import { useQuery } from '@tanstack/react-query'
import { useState, type ElementType,  } from 'react'
import { RequestJustificationDialog } from '@/features/attendance/components/RequestJustificationDialog'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, ClipboardCheck, GraduationCap } from 'lucide-react'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { apiGet } from '@/shared/lib/api-client'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'
import { useScheduleClock } from '@/features/schedules/lib/use-schedule-clock'
import { GuardianReportsCard } from '@/features/formal-reports/components/GuardianReportsCard'

interface TodayData {
  student: { id: string; parallel: string; academicYear: string }
  tasks: Array<{ id: string; title: string; dueDate: string; subject: string }>
  recentGrades: Array<{ id: string; activity: string; subject: string; score: number; maxScore: number; updatedAt: string }>
  attendance: Array<{ id: string; date: string; status: string; subject?: string | null }>
  schedule: Array<{ id: string; subject: string; startTime: string; endTime: string; room?: string | null; teacher?: string | null }>
}

const attendanceLabel: Record<string, string> = {
  absent: 'Ausencia', late: 'Atraso', excused: 'Justificada', present: 'Presente',
}

export function FamilyToday() {
  const { hasAnyRole } = usePermissions()
  const isGuardian = hasAnyRole('guardian')
  const studentId = useGuardianStudentId()
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-today', isGuardian ? studentId : 'self'],
    queryFn: () => apiGet<TodayData>('dashboard/today', isGuardian && studentId ? { studentId } : undefined),
    enabled: !isGuardian || !!studentId,
    staleTime: 60_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })

  const [justifyOpen, setJustifyOpen] = useState(false)

  const { time } = useScheduleClock()

  if (isLoading) return <PageLoader />
  if (!data) return null

  const current = data.schedule.find(item => item.startTime <= time && time < item.endTime)
  const next = data.schedule.find(item => item.startTime > time)
  const latestGrade = data.recentGrades[0]
  const attendance = data.attendance[0]
  const canJustify = data.attendance.some(item => ['absent', 'late'].includes(item.status))

  return (
    <section className="space-y-3" aria-labelledby="family-today-title">
      <div>
        <h2 id="family-today-title" className="text-xl font-bold tracking-tight">Hoy</h2>
        <p className="text-sm text-muted-foreground">{data.student.parallel} · {data.student.academicYear}</p>
      </div>
      <Link to="/schedules" className="block rounded-xl border border-fuchsia-700/10 bg-fuchsia-50 p-3 text-fuchsia-800 hover:shadow-sm dark:bg-fuchsia-950 dark:text-fuchsia-200">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium">
          <span className="flex items-center gap-2"><CalendarClock className="h-4 w-4" aria-hidden="true" />{current ? 'En curso' : 'Horario de hoy'}</span>
          <span>Ver agenda →</span>
        </div>
        {current && <p className="mt-1 text-sm font-semibold">{current.subject} <span className="font-normal">· hasta las {current.endTime}</span></p>}
        {next && <p className="mt-1 text-sm">{current ? 'Después' : 'Próxima clase'} · {next.startTime} · {next.subject}</p>}
        {!current && !next && <p className="mt-1 text-sm">{data.schedule.length ? 'La jornada terminó' : 'Sin clases registradas para hoy'}</p>}
      </Link>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <SummaryTile title="Deberes" icon={ClipboardCheck} href="/tasks" color="bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200" detail={data.tasks.length === 8 ? '8 o más próximos' : `${data.tasks.length} próximos`} />
        <SummaryTile title="Calificaciones" icon={GraduationCap} href="/grades/consulta" color="bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200" detail={latestGrade ? `Última: ${latestGrade.score.toFixed(2)} / ${latestGrade.maxScore}` : 'Sin notas recientes'} />
        <SummaryTile title="Asistencia" icon={BookOpen} href="/attendance" color="bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200" detail={attendance ? attendanceLabel[attendance.status] ?? attendance.status : 'Sin novedades'} />
      </div>
      {canJustify && <button type="button" onClick={() => setJustifyOpen(true)} className="text-sm font-medium text-primary hover:underline">Justificar asistencia</button>}
      {isGuardian && <GuardianReportsCard />}
      <RequestJustificationDialog studentId={data.student.id} open={justifyOpen} onOpenChange={setJustifyOpen} />
    </section>
  )
}

function SummaryTile({ title, icon: Icon, href, detail, color }: { title: string; icon: ElementType; href: string; detail: string; color: string }) {
  return <Link to={href} className={`flex min-w-0 items-center gap-2 rounded-xl border border-current/10 p-3 hover:shadow-sm ${color}`}>
    <span className="hidden shrink-0 rounded-lg bg-white/60 p-2 min-[375px]:inline-flex dark:bg-black/10"><Icon className="h-4 w-4" aria-hidden="true" /></span>
    <span className="min-w-0 break-words text-sm font-semibold">{title}<span className="block text-xs font-normal">{detail}</span></span>
  </Link>
}
