import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Layers,
  ScrollText,
  Trash2,
  UserCheck,
  Users,
  UsersRound,
} from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Textarea } from '@/shared/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { actionLabel } from '@/shared/components/audit/AuditLogView'
import { cn, formatDate, getErrorMessage } from '@/shared/lib/utils'
import {
  useAddInstitutionNote,
  useDeleteInstitutionNote,
  useInstitutionOverview,
  usePlatformRole,
  useSetSubscriptionLimits,
} from '../hooks/usePlatform'
import type { InstitutionOverview, SubscriptionState } from '../api/platform.api'

const STATE_CONFIG: Record<SubscriptionState, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' | 'outline' }> = {
  trial: { label: 'Prueba', variant: 'secondary' },
  active: { label: 'Activa', variant: 'success' },
  grace: { label: 'En gracia', variant: 'warning' },
  readonly: { label: 'Solo lectura', variant: 'warning' },
  suspended: { label: 'Suspendida', variant: 'destructive' },
}

const PAYMENT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  pending: { label: 'Pendiente', variant: 'warning' },
  approved: { label: 'Aprobado', variant: 'success' },
  rejected: { label: 'Rechazado', variant: 'destructive' },
}

function fmtDateTime(d: string) {
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

function fmtMoney(n: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)
}

function StatTile({ icon: Icon, label, value, hint }: { icon: React.ElementType; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-1.5 text-xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </div>
  )
}

function UsageVsLimit({ used, limit, noun }: { used: number; limit: number | null; noun: string }) {
  if (limit == null) {
    return (
      <p className="text-sm text-slate-600">
        <span className="font-semibold tabular-nums">{used}</span> {noun} · <span className="text-slate-400">sin límite</span>
      </p>
    )
  }
  const pct = Math.min(100, (used / Math.max(1, limit)) * 100)
  return (
    <div className="space-y-1">
      <p className="text-sm text-slate-600">
        <span className="font-semibold tabular-nums">{used} / {limit}</span> {noun}
      </p>
      <div className="h-1.5 rounded-full bg-slate-100">
        <div
          className={cn('h-1.5 rounded-full', pct >= 100 ? 'bg-red-500' : pct >= 85 ? 'bg-amber-500' : 'bg-green-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

export function InstitutionDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const { data, isLoading, isError, error, refetch } = useInstitutionOverview(id)

  if (isLoading) return <DetailSkeleton />
  if (isError || !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Card>
          <EmptyState
            icon={AlertCircle}
            title="No se pudo cargar la institución"
            description={getErrorMessage(error)}
            action={<Button variant="outline" onClick={() => refetch()}>Reintentar</Button>}
          />
        </Card>
      </div>
    )
  }

  return <InstitutionDetail data={data} />
}

function BackLink() {
  return (
    <Link to="/platform" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
      <ArrowLeft className="h-4 w-4" />
      Instituciones
    </Link>
  )
}

function InstitutionDetail({ data }: { data: InstitutionOverview }) {
  const { institution, usage, subscription, payments, admins, notes, recentActivity } = data
  const { can } = usePlatformRole()
  const [limitsOpen, setLimitsOpen] = useState(false)

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <BackLink />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{institution.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-slate-500">{institution.code}</span>
              <Badge variant={institution.isActive ? 'success' : 'destructive'}>
                {institution.isActive ? 'Activa' : 'Inactiva'}
              </Badge>
              <Badge variant={institution.accountType === 'personal' ? 'outline' : 'secondary'}>
                {institution.accountType === 'personal' ? 'Personal' : 'Institución'}
              </Badge>
              {institution.isTestInstitution && <Badge variant="outline">De prueba</Badge>}
              <span className="text-xs text-slate-400">Creada el {formatDate(institution.createdAt)}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/platform/institutions/${institution.id}/admins`}>
                <Users className="h-4 w-4" />
                Administradores
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/platform/audit?institutionId=${institution.id}`}>
                <ScrollText className="h-4 w-4" />
                Auditoría
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Uso */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile icon={GraduationCap} label="Estudiantes" value={usage.students} />
        <StatTile icon={UserCheck} label="Docentes" value={usage.teachers} />
        <StatTile icon={UsersRound} label="Usuarios" value={usage.totalUsers} hint={`${usage.activeUsers30d} activos en 30 días`} />
        <StatTile icon={Layers} label="Paralelos" value={usage.parallels} hint={usage.activeYear ? `Año ${usage.activeYear}` : 'Sin año lectivo activo'} />
        <StatTile icon={ClipboardList} label="Notas (30d)" value={usage.grades30d} />
        <StatTile icon={CalendarCheck} label="Asistencias (30d)" value={usage.attendance30d} />
        <StatTile
          icon={Activity}
          label="Última actividad"
          value={<span className="text-base">{usage.lastActivityAt ? formatDate(usage.lastActivityAt) : 'Nunca'}</span>}
        />
        <StatTile icon={Users} label="Administradores" value={admins.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Suscripción */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Suscripción</CardTitle>
            {subscription && can('billing') && (
              <Button variant="outline" size="sm" onClick={() => setLimitsOpen(true)}>
                Editar límites
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {!subscription ? (
              <p className="text-sm text-slate-500">
                Sin suscripción gestionada: la institución no tiene restricciones de vigencia ni límites.
              </p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={STATE_CONFIG[subscription.state]?.variant ?? 'outline'}>
                    {STATE_CONFIG[subscription.state]?.label ?? subscription.state}
                  </Badge>
                  <span className="text-sm text-slate-600">
                    Plan {subscription.plan === 'paid' ? 'pagado' : subscription.plan === 'trial' ? 'de prueba' : subscription.plan}
                  </span>
                  {subscription.expiringSoon && <Badge variant="warning">Vence pronto</Badge>}
                </div>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-slate-400">Inicio</dt>
                    <dd>{formatDate(subscription.startsAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Vence</dt>
                    <dd>
                      {formatDate(subscription.expiresAt)}
                      <span className="ml-1 text-xs text-slate-400">
                        ({subscription.daysRemaining > 0 ? `${subscription.daysRemaining} días` : 'vencida'})
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-400">Fin de gracia</dt>
                    <dd>{formatDate(subscription.graceEndsAt)}</dd>
                  </div>
                </dl>
                <div className="space-y-3 border-t pt-3">
                  <UsageVsLimit used={usage.students} limit={subscription.maxStudents} noun="estudiantes" />
                  <UsageVsLimit used={usage.teachers} limit={subscription.maxTeachers} noun="docentes" />
                </div>
                {subscription.notes && (
                  <p className="border-l-2 border-slate-200 pl-3 text-sm italic text-slate-500">{subscription.notes}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Administradores */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Administradores</CardTitle>
            <Link to={`/platform/institutions/${institution.id}/admins`} className="text-xs text-primary hover:underline">
              Gestionar
            </Link>
          </CardHeader>
          <CardContent>
            {admins.length === 0 ? (
              <p className="text-sm text-slate-500">Sin administradores.</p>
            ) : (
              <ul className="divide-y">
                {admins.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{a.fullName}</p>
                      <p className="truncate text-xs text-slate-500">{a.email}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge variant={a.isActive ? 'success' : 'destructive'}>{a.isActive ? 'Activo' : 'Inactivo'}</Badge>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {a.lastLoginAt ? `Último ingreso ${formatDate(a.lastLoginAt)}` : 'Nunca ingresó'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pagos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historial de pagos</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-slate-500">No hay comprobantes registrados.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Revisión</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-sm">{formatDate(p.createdAt)}</TableCell>
                    <TableCell>
                      <Badge variant={PAYMENT_STATUS[p.status]?.variant ?? 'warning'}>
                        {PAYMENT_STATUS[p.status]?.label ?? p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmtMoney(p.amount)}</TableCell>
                    <TableCell className="font-mono text-xs">{p.reference ?? '—'}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {p.reviewedAt ? formatDate(p.reviewedAt) : '—'}
                      {p.reviewNotes && <span className="block italic">{p.reviewNotes}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <NotesCard institutionId={institution.id} notes={notes} canEdit={can('notes')} />

        {/* Actividad reciente */}
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Actividad reciente</CardTitle>
            <Link to={`/platform/audit?institutionId=${institution.id}`} className="text-xs text-primary hover:underline">
              Ver auditoría completa
            </Link>
          </CardHeader>
          <CardContent>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-slate-500">Sin actividad auditada.</p>
            ) : (
              <ul className="space-y-2">
                {recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="text-slate-700">
                      {actionLabel(a.action)}
                      {a.platformAdminId && <Badge variant="outline" className="ml-2 text-[10px]">Plataforma</Badge>}
                    </span>
                    <span className="shrink-0 text-xs text-slate-400">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {subscription && (
        <LimitsDialog
          open={limitsOpen}
          onOpenChange={setLimitsOpen}
          institutionId={institution.id}
          maxStudents={subscription.maxStudents}
          maxTeachers={subscription.maxTeachers}
        />
      )}
    </div>
  )
}

function NotesCard({ institutionId, notes, canEdit }: { institutionId: string; notes: InstitutionOverview['notes']; canEdit: boolean }) {
  const [body, setBody] = useState('')
  const addNote = useAddInstitutionNote(institutionId)
  const deleteNote = useDeleteInstitutionNote(institutionId)

  const submit = () => {
    const text = body.trim()
    if (!text) return
    addNote.mutate(text, { onSuccess: () => setBody('') })
  }

  const remove = async (noteId: string) => {
    const ok = await confirmDialog({
      title: '¿Eliminar esta nota?',
      description: 'La nota de soporte se eliminará permanentemente.',
      confirmText: 'Eliminar',
      destructive: true,
    })
    if (ok) deleteNote.mutate(noteId)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notas de soporte</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Registra llamadas, acuerdos, incidencias…"
              rows={3}
              aria-label="Nueva nota de soporte"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={submit} loading={addNote.isPending} disabled={!body.trim()}>
                Agregar nota
              </Button>
            </div>
          </div>
        )}
        {notes.length === 0 ? (
          <p className="text-sm text-slate-500">Sin notas todavía.</p>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{n.body}</p>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 text-slate-400 hover:text-red-600"
                      aria-label="Eliminar nota"
                      onClick={() => remove(n.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-slate-400">
                  {n.author ?? 'Plataforma'} · {fmtDateTime(n.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function parseLimit(v: string): number | null | 'invalid' {
  const t = v.trim()
  if (!t) return null
  const n = Number(t)
  if (!Number.isInteger(n) || n < 0) return 'invalid'
  return n
}

function LimitsDialog({
  open,
  onOpenChange,
  institutionId,
  maxStudents,
  maxTeachers,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  institutionId: string
  maxStudents: number | null
  maxTeachers: number | null
}) {
  const [students, setStudents] = useState('')
  const [teachers, setTeachers] = useState('')
  const [error, setError] = useState<string | null>(null)
  const setLimits = useSetSubscriptionLimits(institutionId)

  // Sincroniza los campos cada vez que el diálogo se abre desde afuera.
  const [lastOpen, setLastOpen] = useState(false)
  if (open !== lastOpen) {
    setLastOpen(open)
    if (open) {
      setStudents(maxStudents?.toString() ?? '')
      setTeachers(maxTeachers?.toString() ?? '')
      setError(null)
    }
  }

  const save = () => {
    const s = parseLimit(students)
    const t = parseLimit(teachers)
    if (s === 'invalid' || t === 'invalid') {
      setError('Ingresa un número entero mayor o igual a 0, o deja vacío para no limitar.')
      return
    }
    setLimits.mutate({ maxStudents: s, maxTeachers: t }, { onSuccess: () => onOpenChange(false) })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Límites del plan</DialogTitle>
          <DialogDescription>Deja un campo vacío para no aplicar límite.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="max-students">Máximo de estudiantes</Label>
            <Input id="max-students" type="number" min={0} inputMode="numeric" placeholder="Sin límite" value={students} onChange={(e) => setStudents(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max-teachers">Máximo de docentes</Label>
            <Input id="max-teachers" type="number" min={0} inputMode="numeric" placeholder="Sin límite" value={teachers} onChange={(e) => setTeachers(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} loading={setLimits.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
