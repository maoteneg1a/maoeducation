import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Users, BookOpen, GraduationCap, Calendar, AlertTriangle, MessageSquare, TrendingUp, Megaphone } from 'lucide-react'
import { apiGet } from '@/shared/lib/api-client'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { PwaOnboardingBanner } from '@/shared/components/pwa/PwaOnboardingBanner'
import { announcementsApi } from '@/features/announcements/api/announcements.api'
import { FamilyToday } from '../components/FamilyToday'
import { TeacherToday } from '../components/TeacherToday'
import { SetupChecklist } from '../components/SetupChecklist'
import { useVisibleNavSections } from '@/shared/components/layout/Sidebar'
import { Link } from 'react-router-dom'
import { roleLabel } from '@/shared/lib/roles'

interface DashboardStats {
  users: { total: number; students: number; teachers: number }
  academic: {
    activeYear: { id: string; name: string; periods: number; parallels: number; enrollments: number } | null
    totalParallels: number
    totalActivities: number
  }
  incidents: { pending: number }
  messages: { unread: number }
  dece: { openCases: number; followUps: number }
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
  const isInstitutionAdmin = hasRole('admin') || hasRole('rector')
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
          {hasRole('teacher') && !isInstitutionAdmin && <TeacherToday />}

          <DashboardShortcuts stats={stats} />

          {/* Stats row */}
          {isInstitutionAdmin && user?.institution?.accountType !== 'personal' && <SetupChecklist />}

          {stats && isInstitutionAdmin && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
              <NumberCard icon={Users} label="Usuarios activos" value={stats.users.total} />
              <NumberCard icon={GraduationCap} label="Estudiantes" value={stats.users.students} />
              <NumberCard icon={BookOpen} label="Actividades" value={stats.academic.totalActivities} />
              <NumberCard icon={AlertTriangle} label="Incidentes abiertos" value={stats.incidents.pending} alert={stats.incidents.pending > 0} />
            </div>
          )}

          {/* Active year card */}
          {stats?.academic.activeYear && isInstitutionAdmin && (
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
                  <a key={notice.id} href={`/announcements?notice=${notice.id}`} className="block rounded-md border p-3 transition-colors hover:bg-muted/50">
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

          {hasRole('dece') && !isInstitutionAdmin && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <NumberCard icon={AlertTriangle} label="Casos DECE abiertos" value={stats?.dece.openCases ?? 0} />
              <NumberCard icon={Calendar} label="Seguimientos registrados" value={stats?.dece.followUps ?? 0} />
              <NumberCard icon={MessageSquare} label="Mensajes pendientes" value={stats?.messages.unread ?? 0} />
            </div>
          )}
          {(hasRole('student') || hasRole('guardian')) && !isInstitutionAdmin && !hasRole('teacher') && !hasRole('inspector') && !hasRole('dece') && <FamilyToday />}
        </>
      )}
    </div>
  )
}

// Los accesos comparten permisos, módulos y visibilidad con el menú lateral.
const SHORTCUTS = [
  { path: '/activities', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' },
  { path: '/tasks', color: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-200' },
  { path: '/grades', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' },
  { path: '/attendance', color: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-200' },
  { path: '/academic-alerts', color: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  { path: '/refuerzo/casos', color: 'bg-orange-50 text-orange-800 dark:bg-orange-950 dark:text-orange-200' },
  { path: '/reports', color: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200' },
  { path: '/informes', color: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200' },
  { path: '/dece', color: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-200' },
  { path: '/student-folder', color: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-200' },
  { path: '/schedules', color: 'bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-950 dark:text-fuchsia-200' },
  { path: '/messages', color: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200' },
  { path: '/incidents', color: 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200' },
  { path: '/users', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  { path: '/academic', color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200' },
  { path: '/announcements', color: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-200' },
]

function DashboardShortcuts({ stats }: { stats?: DashboardStats }) {
  const sections = useVisibleNavSections()
  const visible = new Map(sections.flatMap((section) => section.items).map((item) => [item.path, item]))
  const shortcuts = SHORTCUTS.flatMap((shortcut) => {
    const item = visible.get(shortcut.path)
    return item ? [{ ...shortcut, ...item }] : []
  })
  if (!shortcuts.length) return null
  return (
    <nav aria-label="Accesos rápidos" className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-6 xl:grid-cols-8">
      {shortcuts.map(({ path, label, icon: Icon, color }) => {
        const count = path === '/messages' ? stats?.messages.unread : path === '/incidents' ? stats?.incidents.pending : path === '/dece' ? stats?.dece.openCases : 0
        return <Link key={path} to={path} className={`relative flex aspect-square min-w-0 flex-col items-center justify-center gap-2 rounded-xl border border-current/10 p-2 text-center transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${color}`}>
          <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span className="text-xs font-semibold leading-tight sm:text-sm">{label}</span>
          {!!count && count > 0 && <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold text-destructive-foreground"><span className="sr-only">Pendientes: </span>{count > 99 ? '99+' : count}</span>}
        </Link>
      })}
    </nav>
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
      <CardContent className="flex items-center gap-2 p-3 sm:gap-4 sm:p-5">
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

// ── Helpers ─────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

