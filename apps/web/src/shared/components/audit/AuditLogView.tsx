import * as React from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { EmptyState } from '@/shared/components/feedback/empty-state'

export interface AuditLogRow {
  id: string
  createdAt: string
  action: string
  resourceType: string
  resourceId: string | null
  institutionId: string | null
  institutionName: string | null
  actor: string
  impersonatedBy: string | null
  oldValue: unknown
  newValue: unknown
  ipAddress: string | null
}

export interface AuditLogPage {
  data: AuditLogRow[]
  total: number
  page: number
  pageSize: number
}

export type AuditFilters = { page: number; pageSize: number; action?: string; from?: string; to?: string; institutionId?: string }

/** Nombres legibles de las acciones auditadas. */
const ACTION_LABELS: Record<string, string> = {
  'grades.bulk_update': 'Notas modificadas',
  'user.update': 'Usuario editado',
  'user.deactivate': 'Usuario desactivado',
  'users.bulk_import': 'Importación de personal',
  'guardians.bulk_import': 'Importación de representantes',
  'role.update_permissions': 'Permisos de rol cambiados',
  'enrollment.status_change': 'Estado de matrícula',
  'promotion.decision': 'Decisión de promoción',
  'course_assignment.change_teacher': 'Cambio de docente',
  'academic_year.rollover': 'Cierre / apertura de año',
  'period.close': 'Período cerrado',
  'period.reopen': 'Período reabierto',
  'platform.impersonate': 'Suplantación iniciada',
  'impersonation.request': 'Acción durante suplantación',
}

export function actionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  if (action.startsWith('platform.')) return `Plataforma: ${action.slice(9)}`
  return action
}

function summarize(value: unknown): string {
  if (value == null) return ''
  const s = JSON.stringify(value)
  return s.length > 160 ? `${s.slice(0, 160)}…` : s
}

interface AuditLogViewProps {
  queryKey: string
  fetchPage: (filters: AuditFilters) => Promise<AuditLogPage>
  showInstitution?: boolean
  /** Filtros extra (p. ej. selector de institución en la consola de plataforma). */
  extraFilters?: Omit<AuditFilters, 'page' | 'pageSize'>
}

export function AuditLogView({ queryKey, fetchPage, showInstitution, extraFilters }: AuditLogViewProps) {
  const [page, setPage] = React.useState(1)
  const [action, setAction] = React.useState('')
  const [debouncedAction, setDebouncedAction] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [expanded, setExpanded] = React.useState<string | null>(null)

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedAction(action.trim()), 350)
    return () => clearTimeout(t)
  }, [action])
  React.useEffect(() => setPage(1), [debouncedAction, from, to, extraFilters?.institutionId])

  const filters: AuditFilters = {
    page,
    pageSize: 25,
    ...(debouncedAction ? { action: debouncedAction } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...extraFilters,
  }
  const { data, isLoading } = useQuery({
    queryKey: [queryKey, filters],
    queryFn: () => fetchPage(filters),
    placeholderData: keepPreviousData,
  })
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-64">
          <label className="text-xs text-muted-foreground" htmlFor="audit-action">Acción</label>
          <Input id="audit-action" value={action} onChange={(e) => setAction(e.target.value)} placeholder="grades, user, platform…" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="audit-from">Desde</label>
          <Input id="audit-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground" htmlFor="audit-to">Hasta</label>
          <Input id="audit-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : !data || data.data.length === 0 ? (
        <EmptyState icon={ScrollText} title="Sin registros" description="No hay acciones auditadas con estos filtros." />
      ) : (
        <Card className="divide-y">
          {data.data.map((row) => (
            <div key={row.id} className="px-4 py-3 text-sm">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
                onClick={() => setExpanded((v) => (v === row.id ? null : row.id))}
                aria-expanded={expanded === row.id}
              >
                <span className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground">
                  {new Date(row.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <Badge variant="secondary">{actionLabel(row.action)}</Badge>
                <span className="font-medium">{row.actor}</span>
                {row.impersonatedBy && <Badge variant="warning">suplantado por {row.impersonatedBy}</Badge>}
                {showInstitution && row.institutionName && (
                  <span className="text-xs text-muted-foreground">· {row.institutionName}</span>
                )}
                <span className="ml-auto truncate text-xs text-muted-foreground sm:max-w-[40%]">{summarize(row.newValue)}</span>
              </button>
              {expanded === row.id && (
                <div className="mt-2 grid gap-2 rounded-md bg-muted/40 p-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="mb-1 font-medium">Antes</p>
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">{row.oldValue ? JSON.stringify(row.oldValue, null, 2) : '—'}</pre>
                  </div>
                  <div>
                    <p className="mb-1 font-medium">Después</p>
                    <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-all">{row.newValue ? JSON.stringify(row.newValue, null, 2) : '—'}</pre>
                  </div>
                  <p className="text-muted-foreground sm:col-span-2">
                    {row.resourceType}{row.resourceId ? ` · ${row.resourceId}` : ''}{row.ipAddress ? ` · IP ${row.ipAddress}` : ''}
                  </p>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}

      {data && data.total > data.pageSize && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">Página {page} de {totalPages} · {data.total} registros</span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Página anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Página siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
