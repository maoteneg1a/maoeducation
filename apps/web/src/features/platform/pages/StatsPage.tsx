import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { AlarmClock, AlertTriangle, Building2, ClipboardCheck, CreditCard, Eye, FileCheck2, GraduationCap, MessageSquare, PowerOff, Users } from 'lucide-react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { cn, formatDate } from '@/shared/lib/utils'
import { platformApi } from '../api/platform.api'
import { usePlatformAlerts } from '../hooks/usePlatform'

function fmtDay(d: string) {
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short' }).format(new Date(d))
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
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['platform-stats-overview'],
    queryFn: platformApi.getStatsOverview,
    refetchInterval: 60_000,
  })

  const signupsSeries = useMemo(
    () => (stats ? mergeSeries(stats.signups.institutions, stats.signups.users, 'institutions', 'users') : []),
    [stats],
  )

  if (statsLoading || !stats) return <PageLoader />

  const maxPageViewCount = Math.max(1, ...stats.pageViews.topPages.map((p) => p.count))
  const maxErrorRouteCount = Math.max(1, ...stats.errors.topRoutes.map((item) => item.count))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Estadísticas</h1>
        <p className="text-sm text-slate-500">Actividad académica real y tráfico de auleka.com en los últimos 30 días</p>
      </div>

      <AlertsRow />

      <section aria-labelledby="academic-summary-title" className="space-y-2">
        <h2 id="academic-summary-title" className="text-sm font-semibold text-slate-700">Uso académico (30 días)</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard icon={<ClipboardCheck className="h-4 w-4" />} label="Asistencias" value={stats.academicActivity.attendance} hint="Registros guardados" />
          <StatCard icon={<GraduationCap className="h-4 w-4" />} label="Calificaciones" value={stats.academicActivity.grades} hint="Notas registradas" />
          <StatCard icon={<FileCheck2 className="h-4 w-4" />} label="Actividades" value={stats.academicActivity.activities} hint="Actividades creadas" />
          <StatCard icon={<Building2 className="h-4 w-4" />} label="Instituciones activas" value={stats.academicActivity.activeInstitutions} hint={`de ${stats.institutions.total} instituciones`} />
          <StatCard icon={<Eye className="h-4 w-4" />} label="Visitantes landing" value={stats.pageViews.uniqueVisitors30d} hint={`${stats.pageViews.total30d} páginas vistas`} />
        </div>
      </section>

      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700">Acciones académicas por día (30d)</h2>
        <div className="mt-3 h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.academicActivity.series}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={38} />
              <Tooltip labelFormatter={(v) => fmtDay(String(v))} />
              <Line type="monotone" dataKey="attendance" name="Asistencias" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="grades" name="Calificaciones" stroke="#16a34a" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="activities" name="Actividades" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
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

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Instituciones con más actividad (30d)</h2>
          </div>
          {stats.academicActivity.topInstitutions.length === 0 ? (
            <p className="p-5 text-sm text-slate-400">Todavía no hay actividad académica registrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium">Institución</th>
                    <th className="px-3 py-3 text-right font-medium">Asistencia</th>
                    <th className="px-3 py-3 text-right font-medium">Notas</th>
                    <th className="px-3 py-3 text-right font-medium">Actividades</th>
                    <th className="px-5 py-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {stats.academicActivity.topInstitutions.map((institution) => (
                    <tr key={institution.institutionId}>
                      <td className="px-5 py-3 font-medium text-slate-700">
                        <Link to={`/platform/institutions/${institution.institutionId}`} className="hover:underline">{institution.name}</Link>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">{institution.attendance}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">{institution.grades}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-500">{institution.activities}</td>
                      <td className="px-5 py-3 text-right font-semibold tabular-nums text-slate-700">{institution.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 content-start">
          <StatCard icon={<Building2 className="h-4 w-4" />} label="Instituciones" value={stats.institutions.total} hint={`${stats.institutions.personal} personales · ${stats.institutions.schools} colegios`} />
          <StatCard icon={<Users className="h-4 w-4" />} label="Usuarios" value={stats.users.total} />
          <StatCard icon={<MessageSquare className="h-4 w-4" />} label="Leads" value={stats.leads.total} />
          <StatCard icon={<Eye className="h-4 w-4" />} label="Páginas vistas" value={stats.pageViews.total30d} hint="Landing · 30 días" />
        </div>
      </div>

      <section aria-labelledby="errors-title" className="space-y-3 rounded-xl border border-red-200 bg-red-50/40 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="errors-title" className="flex items-center gap-2 font-semibold text-slate-800">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Errores de la plataforma
            </h2>
            <p className="mt-1 text-xs text-slate-500">Fallos inesperados del servidor. No incluye validaciones ni errores de datos ingresados.</p>
          </div>
          <div className="flex gap-3">
            <div className="rounded-lg border border-red-200 bg-white px-4 py-2 text-center">
              <p className="text-xl font-bold tabular-nums text-red-700">{stats.errors.total7d}</p>
              <p className="text-xs text-slate-500">últimos 7 días</p>
            </div>
            <div className="rounded-lg border border-red-200 bg-white px-4 py-2 text-center">
              <p className="text-xl font-bold tabular-nums text-red-700">{stats.errors.total30d}</p>
              <p className="text-xs text-slate-500">últimos 30 días</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-medium text-slate-700">Errores por día</h3>
            {stats.errors.series.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-emerald-700">Sin errores registrados en los últimos 30 días</div>
            ) : (
              <div className="mt-2 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.errors.series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={fmtDay} fontSize={11} />
                    <YAxis allowDecimals={false} fontSize={11} width={30} />
                    <Tooltip labelFormatter={(v) => fmtDay(String(v))} />
                    <Line type="monotone" dataKey="count" name="Errores" stroke="#dc2626" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-white p-4">
            <h3 className="text-sm font-medium text-slate-700">Rutas con más errores (30d)</h3>
            {stats.errors.topRoutes.length === 0 ? (
              <div className="flex h-52 items-center justify-center text-sm text-slate-400">Sin rutas afectadas</div>
            ) : (
              <div className="mt-3 space-y-3">
                {stats.errors.topRoutes.map((item) => (
                  <div key={item.route}>
                    <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                      <span className="truncate font-mono text-slate-600">{item.route}</span>
                      <span className="font-semibold tabular-nums text-red-700">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-red-100">
                      <div className="h-2 rounded-full bg-red-500" style={{ width: `${(item.count / maxErrorRouteCount) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {stats.errors.recent.length > 0 && (
          <div className="overflow-hidden rounded-lg border bg-white">
            <div className="border-b px-4 py-3"><h3 className="text-sm font-medium text-slate-700">Errores recientes</h3></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500">
                  <tr><th className="px-4 py-2 text-left font-medium">Fecha</th><th className="px-3 py-2 text-left font-medium">Ruta</th><th className="px-3 py-2 text-left font-medium">Tipo</th><th className="px-4 py-2 text-left font-medium">Institución</th></tr>
                </thead>
                <tbody className="divide-y">
                  {stats.errors.recent.map((error) => (
                    <tr key={error.id}>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">{formatDate(error.createdAt)}</td>
                      <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-700">{error.method} {error.route}</td>
                      <td className="px-3 py-2 text-xs text-red-700">{error.code}</td>
                      <td className="px-4 py-2 text-xs text-slate-500">{error.institutionName ?? 'Sin identificar'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

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

    </div>
  )
}
