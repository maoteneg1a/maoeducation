import { useQuery } from '@tanstack/react-query'
import { useState, type ElementType, type ReactNode } from 'react'
import { RequestJustificationDialog } from '@/features/attendance/components/RequestJustificationDialog'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, ClipboardCheck, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { apiGet } from '@/shared/lib/api-client'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'
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

  if (isLoading) return <PageLoader />
  if (!data) return null

  return (
    <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm sm:p-5" aria-labelledby="family-today-title">
      <div>
        <h2 id="family-today-title" className="text-xl font-bold tracking-tight">Hoy</h2>
        <p className="mt-1 text-sm text-muted-foreground">{data.student.parallel} · {data.student.academicYear}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TodayCard title="Horario de hoy" icon={CalendarClock} href="/schedules" empty="No hay clases registradas para hoy">
          {data.schedule.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
              <div><p className="text-sm font-medium">{item.subject}</p><p className="text-xs text-muted-foreground">{item.teacher ?? 'Docente'}{item.room ? ` · ${item.room}` : ''}</p></div>
              <span className="whitespace-nowrap text-xs font-medium">{item.startTime}–{item.endTime}</span>
            </div>
          ))}
        </TodayCard>
        <TodayCard title="Próximos deberes" icon={ClipboardCheck} href="/tasks" empty="No hay deberes próximos">
          {data.tasks.slice(0, 5).map((item) => (
            <div key={item.id} className="border-b py-2 last:border-0"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.subject} · entrega {new Date(item.dueDate).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</p></div>
          ))}
        </TodayCard>
        <TodayCard title="Calificaciones recientes" icon={GraduationCap} href="/grades" empty="No hay calificaciones recientes">
          {data.recentGrades.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div><p className="text-sm font-medium">{item.activity}</p><p className="text-xs text-muted-foreground">{item.subject}</p></div><span className="font-semibold tabular-nums">{item.score.toFixed(2)} / {item.maxScore}</span></div>
          ))}
        </TodayCard>
        <TodayCard
          title="Asistencia reciente"
          icon={BookOpen}
          href="/attendance"
          empty="Sin novedades de asistencia"
          action={
            data.attendance.some((a) => a.status === 'absent' || a.status === 'late') ? (
              <button type="button" onClick={() => setJustifyOpen(true)} className="text-xs font-medium text-primary hover:underline">
                Justificar
              </button>
            ) : undefined
          }
        >
          {data.attendance.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div><p className="text-sm font-medium">{attendanceLabel[item.status] ?? item.status}</p><p className="text-xs text-muted-foreground">{item.subject ?? 'Jornada diaria'}</p></div><span className="text-xs">{new Date(item.date).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</span></div>
          ))}
        </TodayCard>
      </div>
      {isGuardian && <GuardianReportsCard />}
      <RequestJustificationDialog studentId={data.student.id} open={justifyOpen} onOpenChange={setJustifyOpen} />
    </section>
  )
}

function TodayCard({ title, icon: Icon, href, empty, action, children }: { title: string; icon: ElementType; href: string; empty: string; action?: ReactNode; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <Card className="h-full bg-background/95 shadow-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 pb-2">
        <CardTitle className="flex min-w-0 items-center gap-2 text-base leading-snug"><Icon className="h-5 w-5 shrink-0 text-primary" /><span>{title}</span></CardTitle>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {action}
          <Link to={href} className="text-xs font-medium text-primary hover:underline">Ver todo</Link>
        </div>
      </CardHeader>
      <CardContent className="text-sm">{hasItems ? children : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent>
    </Card>
  )
}
