import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Users, BookOpen, GraduationCap, Calendar, AlertTriangle, MessageSquare, ClipboardList, TrendingUp, Megaphone } from 'lucide-react'
import { apiGet } from '@/shared/lib/api-client'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { PwaOnboardingBanner } from '@/shared/components/pwa/PwaOnboardingBanner'
import { announcementsApi } from '@/features/announcements/api/announcements.api'
import { FamilyToday } from '../components/FamilyToday'

interface DashboardStats {
  users: { total: number; students: number; teachers: number }
  academic: {
    activeYear: { id: string; name: string; periods: number; parallels: number; enrollments: number } | null
    totalParallels: number
    totalActivities: number
  }
  incidents: { pending: number }
  messages: { unread: number }
}

function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: () => apiGet<DashboardStats>('dashboard/stats'),
    staleTime: 60_000,
  })
}

export function DashboardPage() {
  const user = useAuthStore((s) => s.user)
  const { hasRole } = usePermissions()
  const { data: stats, isLoading } = useDashboardStats()
  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: announcementsApi.list,
    staleTime: 60_000,
  })
  const greeting = getGreeting()

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner de onboarding PWA — notificaciones + agregar a inicio */}
      <PwaOnboardingBanner />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-semibold leading-tight sm:text-2xl">
          {greeting}, {user?.fullName.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {new Intl.DateTimeFormat('es', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </p>
      </div>

      {/* Role badges */}
      <div className="flex flex-wrap gap-2">
        {user?.roles.map((role) => (
          <Badge key={role} variant="secondary" className="capitalize text-xs">
            {roleLabel(role)}
          </Badge>
        ))}
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          {/* Stats row */}
          {stats && hasRole('admin') && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
              <NumberCard icon={Users} label="Usuarios activos" value={stats.users.total} />
              <NumberCard icon={GraduationCap} label="Estudiantes" value={stats.users.students} />
              <NumberCard icon={BookOpen} label="Actividades" value={stats.academic.totalActivities} />
              <NumberCard icon={AlertTriangle} label="Incidentes abiertos" value={stats.incidents.pending} alert={stats.incidents.pending > 0} />
            </div>
          )}

          {/* Active year card */}
          {stats?.academic.activeYear && hasRole('admin') && (
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Año activo: {stats.academic.activeYear.name}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2 text-sm sm:flex-row sm:gap-6">
                  <div><span className="font-semibold">{stats.academic.activeYear.parallels}</span> <span className="text-muted-foreground">paralelos</span></div>
                  <div><span className="font-semibold">{stats.academic.activeYear.enrollments}</span> <span className="text-muted-foreground">matrículas</span></div>
                  <div><span className="font-semibold">{stats.academic.activeYear.periods}</span> <span className="text-muted-foreground">períodos</span></div>
                </div>
              </CardContent>
            </Card>
          )}

          {announcements.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Megaphone className="h-4 w-4 text-primary" /> Avisos recientes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {announcements.slice(0, 3).map((notice) => (
                  <a key={notice.id} href="/announcements" className="block rounded-md border p-3 transition-colors hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{notice.title}</p>
                      {notice.priority === 'important' && <Badge variant="warning">Importante</Badge>}
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{notice.body}</p>
                  </a>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Per-role module links */}
          {hasRole('admin') && <AdminModules />}
          {hasRole('teacher') && !hasRole('admin') && <TeacherModules unread={stats?.messages.unread} />}
          {hasRole('inspector') && !hasRole('admin') && <InspectorModules pending={stats?.incidents.pending} unread={stats?.messages.unread} />}
          {(hasRole('student') || hasRole('guardian')) && !hasRole('admin') && !hasRole('teacher') && !hasRole('inspector') && (
            <>
              <FamilyToday />
              <StudentModules unread={stats?.messages.unread} />
            </>
          )}
        </>
      )}
    </div>
  )
}

function AdminModules() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 md:gap-4">
      <ModuleCard icon={Users}         label="Usuarios"        href="/users" />
      <ModuleCard icon={Calendar}      label="Configuración"   href="/academic" />
      <ModuleCard icon={BookOpen}      label="Actividades"     href="/activities" />
      <ModuleCard icon={GraduationCap} label="Calificaciones"  href="/grades" />
      <ModuleCard icon={ClipboardList} label="Asistencia"      href="/attendance" />
      <ModuleCard icon={AlertTriangle} label="Incidentes"      href="/incidents" />
      <ModuleCard icon={Calendar}      label="Horario"         href="/schedules" />
      <ModuleCard icon={MessageSquare} label="Mensajes"        href="/messages" />
    </div>
  )
}

function TeacherModules({ unread }: { unread?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
      <ModuleCard icon={BookOpen}      label="Actividades"     href="/activities" />
      <ModuleCard icon={GraduationCap} label="Calificaciones"  href="/grades" />
      <ModuleCard icon={ClipboardList} label="Asistencia"      href="/attendance" />
      <ModuleCard icon={Calendar}      label="Horario"         href="/schedules" />
      <ModuleCard icon={MessageSquare} label="Mensajes"        href="/messages" badge={unread} />
    </div>
  )
}

function InspectorModules({ pending, unread }: { pending?: number; unread?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
      <ModuleCard icon={AlertTriangle} label="Incidentes"      href="/incidents" badge={pending} />
      <ModuleCard icon={ClipboardList} label="Asistencia"      href="/attendance" />
      <ModuleCard icon={MessageSquare} label="Mensajes"        href="/messages" badge={unread} />
    </div>
  )
}

function StudentModules({ unread }: { unread?: number }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
      <ModuleCard icon={GraduationCap} label="Calificaciones"  href="/grades" />
      <ModuleCard icon={ClipboardList} label="Asistencia"      href="/attendance" />
      <ModuleCard icon={Calendar}      label="Horario"         href="/schedules" />
      <ModuleCard icon={MessageSquare} label="Mensajes"        href="/messages" badge={unread} />
    </div>
  )
}

// ── Components ──────────────────────────────────────────────

function NumberCard({
  icon: Icon,
  label,
  value,
  alert,
}: {
  icon: React.ElementType
  label: string
  value: number
  alert?: boolean
}) {
  return (
    <Card className={alert ? 'border-destructive/30' : ''}>
      <CardContent className="p-5 flex items-center gap-4">
        <div className={`rounded-lg p-2.5 ${alert ? 'bg-destructive/10' : 'bg-primary/10'}`}>
          <Icon className={`h-5 w-5 ${alert ? 'text-destructive' : 'text-primary'}`} />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function ModuleCard({
  icon: Icon,
  label,
  href,
  badge,
}: {
  icon: React.ElementType
  label: string
  href: string
  badge?: number
}) {
  return (
    <a href={href}>
      <Card className="hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group">
        <CardContent className="flex items-center gap-4 p-4 sm:p-5">
          <div className="rounded-lg bg-primary/10 p-2.5 group-hover:bg-primary/20 transition-colors">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">{label}</p>
          </div>
          {!!badge && badge > 0 && (
            <span className="text-xs bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center font-medium">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </CardContent>
      </Card>
    </a>
  )
}

// ── Helpers ─────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    admin: 'Administrador',
    teacher: 'Profesor',
    inspector: 'Inspector',
    student: 'Alumno',
    guardian: 'Padre/Representante',
  }
  return labels[role] ?? role
}
