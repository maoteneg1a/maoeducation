import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { Link } from 'react-router-dom'
import { AlarmClock, Building2, CreditCard, Eye, LogIn, MessageSquare, PowerOff, Users } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { DataTable } from '@/shared/components/ui/data-table'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { useAuthStore } from '@/store/auth.store'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'
import { platformApi, type PlatformUser } from '../api/platform.api'
import { usePlatformAlerts, usePlatformRole } from '../hooks/usePlatform'

const USERS_PAGE_SIZE = 20

function fmtDay(d: string) {
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' }).format(new Date(d))
}

function fmtDateTime(d: string) {
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

function mergeSeries(
  a: { date: string; count: number }[],
  b: { date: string; count: number }[],
  keyA: string,
  keyB: string,
) {
  const byDate = new Map<string, Record<string, number | string>>()
  for (const { date, count } of a) byDate.set(date, { date, [keyA]: count, [keyB]: 0 })
  for (const { date, count } of b) {
    const existing = byDate.get(date) ?? { date, [keyA]: 0, [keyB]: 0 }
    existing[keyB] = count
    byDate.set(date, existing)
  }
  return Array.from(byDate.values()).sort((x, y) => String(x.date).localeCompare(String(y.date)))
}

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function AlertCard({
  icon: Icon,
  title,
  count,
  tone,
  to,
  linkLabel,
  children,
}: {
  icon: React.ElementType
  title: string
  count: number
  tone: 'amber' | 'blue' | 'red' | 'violet'
  to?: string
  linkLabel?: string
  children?: React.ReactNode
}) {
  const active = count > 0
  const toneClass = {
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    blue: 'border-blue-200 bg-blue-50 text-blue-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    violet: 'border-violet-200 bg-violet-50 text-violet-800',
  }[tone]
  return (
    <div className={cn('rounded-xl border p-4 shadow-sm', active ? toneClass : 'bg-white text-slate-500')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="text-xl font-bold tabular-nums">{count}</span>
      </div>
      {children}
      {to && active && (
        <Link to={to} className="mt-2 inline-block text-xs font-medium underline-offset-2 hover:underline">
          {linkLabel ?? 'Ver'}
        </Link>
      )}
    </div>
  )
}

function AlertsRow() {
  const { data: alerts, isLoading } = usePlatformAlerts()
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    )
  }
  if (!alerts) return null
  return (
    <section aria-labelledby="alerts-title" className="space-y-2">
      <h2 id="alerts-title" className="text-sm font-semibold text-slate-700">Alertas</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AlertCard icon={AlarmClock} title="Por vencer" count={alerts.expiringSoon.length} tone="amber">
          {alerts.expiringSoon.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {alerts.expiringSoon.slice(0, 5).map((e) => (
                <li key={e.institutionId} className="flex justify-between gap-2">
                  <Link to={`/platform/institutions/${e.institutionId}`} className="truncate hover:underline">
                    {e.name}
                  </Link>
                  <span className="shrink-0">{formatDate(e.expiresAt)}</span>
                </li>
              ))}
              {alerts.expiringSoon.length > 5 && <li>y {alerts.expiringSoon.length - 5} más…</li>}
            </ul>
          )}
        </AlertCard>
        <AlertCard
          icon={CreditCard}
          title="Pagos por revisar"
          count={alerts.pendingPayments}
          tone="blue"
          to="/platform/subscriptions"
          linkLabel="Revisar comprobantes"
        />
        <AlertCard icon={PowerOff} title="Instituciones inactivas" count={alerts.inactiveCount} tone="red">
          {alerts.inactiveInstitutions.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {alerts.inactiveInstitutions.slice(0, 5).map((i) => (
                <li key={i.id} className="truncate">
                  <Link to={`/platform/institutions/${i.id}`} className="hover:underline">{i.name}</Link>
                </li>
              ))}
              {alerts.inactiveCount > 5 && <li>y {alerts.inactiveCount - 5} más…</li>}
            </ul>
          )}
        </AlertCard>
        <AlertCard
          icon={MessageSquare}
          title="Leads por seguir"
          count={alerts.leadsToFollowUp}
          tone="violet"
          to="/platform/leads"
          linkLabel="Ir a leads"
        />
      </div>
    </section>
  )
}

export function StatsPage() {
  const { can } = usePlatformRole()
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['platform-stats-overview'],
    queryFn: platformApi.getStatsOverview,
    refetchInterval: 60_000,
  })

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const { data: usersResult, isLoading: usersLoading } = useQuery({
    queryKey: ['platform-users', search, page],
    queryFn: () => platformApi.getPlatformUsers({ search: search || undefined, page, limit: USERS_PAGE_SIZE }),
  })

  const setAuth = useAuthStore((s) => s.setAuth)
  const { mutate: impersonate, isPending: isImpersonating } = useMutation({
    mutationFn: (userId: string) => platformApi.impersonateUser(userId),
    onSuccess: (data) => {
      // El token de suplantación dura 30 min (sin refresh); el banner muestra el tiempo restante.
      setAuth(data.user, data.accessToken, { expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() })
      window.location.href = '/dashboard'
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const signupsSeries = useMemo(
    () => (stats ? mergeSeries(stats.signups.institutions, stats.signups.users, 'institutions', 'users') : []),
    [stats],
  )

  const columns: ColumnDef<PlatformUser>[] = [
    { accessorKey: 'fullName', header: 'Usuario' },
    { accessorKey: 'email', header: 'Email' },
    { accessorKey: 'institutionName', header: 'Institución' },
    {
      id: 'accountType',
      header: 'Tipo',
      cell: ({ row }) => (
        <Badge variant={row.original.accountType === 'personal' ? 'outline' : 'secondary'}>
          {row.original.accountType === 'personal' ? 'Personal' : 'Institución'}
        </Badge>
      ),
    },
    {
      id: 'roles',
      header: 'Roles',
      cell: ({ row }) => <span className="text-sm text-slate-500">{row.original.roles.join(', ')}</span>,
    },
    {
      accessorKey: 'isActive',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'success' : 'destructive'}>
          {row.original.isActive ? 'Activo' : 'Inactivo'}
        </Badge>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Registrado',
      cell: ({ row }) => <span className="text-sm text-slate-500">{fmtDateTime(row.original.createdAt)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        can('impersonate') ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isImpersonating}
            onClick={async () => {
              const ok = await confirmDialog({
                title: `¿Ingresar como ${row.original.fullName}?`,
                description:
                  'Verás la app exactamente como este usuario. La sesión dura 30 minutos y todo lo que hagas queda registrado en la auditoría.',
                confirmText: 'Ingresar',
              })
              if (ok) impersonate(row.original.id)
            }}
          >
            <LogIn className="w-4 h-4 mr-1.5" />
            Ingresar como
          </Button>
        ) : null,
    },
  ]

  if (statsLoading || !stats) return <PageLoader />

  const totalUserPages = usersResult ? Math.max(1, Math.ceil(usersResult.total / USERS_PAGE_SIZE)) : 1
  const maxPageViewCount = Math.max(1, ...stats.pageViews.topPages.map((p) => p.count))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estadísticas</h1>
        <p className="text-sm text-slate-500">Uso de la plataforma y tráfico de auleka.com</p>
      </div>

      <AlertsRow />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Instituciones" value={stats.institutions.total} hint={`${stats.institutions.personal} personales · ${stats.institutions.schools} colegios`} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Usuarios" value={stats.users.total} />
        <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Leads" value={stats.leads.total} />
        <StatCard icon={<Eye className="h-4 w-4" />} label="Visitas (30d)" value={stats.pageViews.total30d} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Registros por día (30d)</h2>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={signupsSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={30} />
                <Tooltip labelFormatter={(v) => fmtDay(String(v))} />
                <Line type="monotone" dataKey="institutions" name="Instituciones" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="users" name="Usuarios" stroke="#16a34a" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700">Visitas a la landing por día (30d)</h2>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stats.pageViews.series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} width={30} />
                <Tooltip labelFormatter={(v) => fmtDay(String(v))} />
                <Line type="monotone" dataKey="count" name="Visitas" stroke="#9333ea" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Páginas más visitadas (30d)</h2>
        {stats.pageViews.topPages.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Todavía no hay visitas registradas.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {stats.pageViews.topPages.map((p) => (
              <div key={p.path} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate text-sm text-slate-600">{p.path}</span>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-brand-blue"
                    style={{ width: `${(p.count / maxPageViewCount) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-sm tabular-nums text-slate-500">{p.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Usuarios registrados</h2>
        <DataTable
          columns={columns}
          data={usersResult?.data ?? []}
          isLoading={usersLoading}
          searchPlaceholder="Buscar por nombre, email o institución..."
          onSearch={(value) => {
            setSearch(value)
            setPage(1)
          }}
          emptyMessage="Sin usuarios"
        />
        {usersResult && usersResult.total > USERS_PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Página {page} de {totalUserPages} · {usersResult.total} usuarios
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalUserPages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
