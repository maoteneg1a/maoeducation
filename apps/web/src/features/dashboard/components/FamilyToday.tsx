import { useQuery } from '@tanstack/react-query'
import type { ElementType, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { BookOpen, CalendarClock, ClipboardCheck, GraduationCap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { apiGet } from '@/shared/lib/api-client'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'

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
  })

  if (isLoading) return <PageLoader />
  if (!data) return null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Hoy</h2>
        <p className="text-xs text-muted-foreground">{data.student.parallel} · {data.student.academicYear}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <TodayCard title="Horario de hoy" icon={CalendarClock} href="/schedules" empty="No hay clases registradas para hoy">
          {data.schedule.map((item) => (
            <div key={item.id} className="flex items-start justify-between gap-3 border-b py-2 last:border-0">
              <div><p className="text-sm font-medium">{item.subject}</p><p className="text-xs text-muted-foreground">{item.teacher ?? 'Docente'}{item.room ? ` · ${item.room}` : ''}</p></div>
              <span className="whitespace-nowrap text-xs font-medium">{item.startTime}–{item.endTime}</span>
            </div>
          ))}
        </TodayCard>
        <TodayCard title="Próximas tareas" icon={ClipboardCheck} href="/tasks" empty="No hay tareas próximas">
          {data.tasks.slice(0, 5).map((item) => (
            <div key={item.id} className="border-b py-2 last:border-0"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.subject} · entrega {new Date(item.dueDate).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</p></div>
          ))}
        </TodayCard>
        <TodayCard title="Calificaciones recientes" icon={GraduationCap} href="/grades" empty="No hay calificaciones recientes">
          {data.recentGrades.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div><p className="text-sm font-medium">{item.activity}</p><p className="text-xs text-muted-foreground">{item.subject}</p></div><span className="font-semibold tabular-nums">{item.score.toFixed(2)} / {item.maxScore}</span></div>
          ))}
        </TodayCard>
        <TodayCard title="Asistencia reciente" icon={BookOpen} href="/attendance" empty="Sin novedades de asistencia">
          {data.attendance.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b py-2 last:border-0"><div><p className="text-sm font-medium">{attendanceLabel[item.status] ?? item.status}</p><p className="text-xs text-muted-foreground">{item.subject ?? 'Jornada diaria'}</p></div><span className="text-xs">{new Date(item.date).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}</span></div>
          ))}
        </TodayCard>
      </div>
    </div>
  )
}

function TodayCard({ title, icon: Icon, href, empty, children }: { title: string; icon: ElementType; href: string; empty: string; children: ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-primary" />{title}</CardTitle>
        <Link to={href} className="text-xs font-medium text-primary hover:underline">Ver todo</Link>
      </CardHeader>
      <CardContent>{hasItems ? children : <p className="py-5 text-center text-sm text-muted-foreground">{empty}</p>}</CardContent>
    </Card>
  )
}
