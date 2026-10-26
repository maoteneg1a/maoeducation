import { StartReinforcementDialog } from '@/features/reinforcement-desk/components/StartReinforcementDialog'
import { CASE_STATUS_LABEL } from '@/features/reinforcement-desk/api/reinforcement-desk.api'
import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, CircleDashed, FilePen, Link2, RotateCcw, ShieldCheck, XCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { getParallels, getYears } from '@/features/enrollment/api/enrollment.api'
import { academicApi } from '@/features/academic/api/academic.api'
import { ReportComposerDialog } from '@/features/formal-reports/components/ReportComposerDialog'
import { REPORT_STATUS_LABEL } from '@/features/formal-reports/components/ReportStatusBadge'
import type { FormalReportStatus } from '@/features/formal-reports/api/formal-reports.api'
import { earlyAlertsApi, type EarlyAlertItem, type EarlyAlertStatus } from '../api/early-alerts.api'
import { GeneralSignalsPanel } from '../components/GeneralSignalsPanel'

const STATUS_LABEL: Record<EarlyAlertStatus, string> = { OPEN: 'Abierta', RESOLVED: 'Resuelta', DISMISSED: 'Descartada' }
const n = (v: number | null) => (v == null ? '—' : v.toFixed(2))

export function EarlyAlertsPage() {
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canSeeAll = hasPermission('early_alerts:read:all')
  const [yearId, setYearId] = React.useState('')
  const [periodId, setPeriodId] = React.useState('')
  const [parallelId, setParallelId] = React.useState('all')
  const [status, setStatus] = React.useState<EarlyAlertStatus | 'all'>('OPEN')
  const [composerFor, setComposerFor] = React.useState<EarlyAlertItem | null>(null)
  const [dismissFor, setDismissFor] = React.useState<EarlyAlertItem | null>(null)
  const [startAlerts, setStartAlerts] = React.useState<EarlyAlertItem[]>([])
  const [selected, setSelected] = React.useState<string[]>([])
  React.useEffect(() => { setSelected([]) }, [periodId, parallelId, status])
  const [linkFor, setLinkFor] = React.useState<EarlyAlertItem | null>(null)

  const { data: years = [], isLoading: yearsLoading } = useQuery({ queryKey: ['years'], queryFn: getYears })
  const { data: periods = [] } = useQuery({ queryKey: ['periods', yearId], queryFn: () => academicApi.getPeriods(yearId), enabled: !!yearId })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: !!yearId && canSeeAll })

  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [yearId, years])
  React.useEffect(() => { setPeriodId(''); setParallelId('all') }, [yearId])
  React.useEffect(() => {
    if (!periodId && periods.length) setPeriodId(periods.find((p) => p.isActive)?.id ?? periods[0].id)
  }, [periodId, periods])

  const listKey = ['early-alerts-v2', periodId, parallelId, status]
  const { data, isLoading } = useQuery({
    queryKey: listKey,
    queryFn: () => earlyAlertsApi.list({ periodId, parallelId: parallelId === 'all' ? undefined : parallelId, status }),
    enabled: !!periodId,
  })
  const { data: summary } = useQuery({
    queryKey: ['early-alerts-summary', periodId],
    queryFn: () => earlyAlertsApi.summary(periodId),
    enabled: !!periodId && canSeeAll,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['early-alerts-v2'] })
    qc.invalidateQueries({ queryKey: ['early-alerts-summary'] })
  }
  const reopen = useMutation({ mutationFn: (id: string) => earlyAlertsApi.reopen(id), onSuccess: () => { toast.success('Alerta reabierta'); refresh() }, onError: (e) => toast.error(getErrorMessage(e)) })

  if (yearsLoading) return <PageLoader />

  const rule = data?.rules

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold">Alertas tempranas</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bajo desempeño detectado por el motor de notas (Acuerdo 2026-00082-A, art. 10). Cada alerta guía los informes que deben enviarse a las instancias de la institución.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Select value={yearId} onValueChange={setYearId}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Año lectivo" /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Periodo" /></SelectTrigger>
          <SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isClosed ? ' (cerrado)' : ''}</SelectItem>)}</SelectContent>
        </Select>
        {canSeeAll && (
          <Select value={parallelId} onValueChange={setParallelId}>
            <SelectTrigger className="w-full sm:w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los paralelos</SelectItem>
              {parallels.map((p) => <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">Abiertas</SelectItem>
            <SelectItem value="RESOLVED">Resueltas</SelectItem>
            <SelectItem value="DISMISSED">Descartadas</SelectItem>
            <SelectItem value="all">Todas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rule && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span>Regla activa:</span>
          <Badge variant="outline">{rule.source === 'formative' ? 'Promedio formativo' : 'Nota total del periodo'}</Badge>
          <Badge variant="outline">Rango {rule.range[0].toFixed(2)} – {rule.range[1].toFixed(2)}</Badge>
          {rule.qualitativeCodes.length > 0 && <Badge variant="outline">Cualitativa: {rule.qualitativeCodes.join(', ')}</Badge>}
          <Badge variant="outline">{rule.moment === 'live' ? 'Se recalcula en vivo' : 'Solo al cerrar el periodo'}</Badge>
          {rule.moment === 'period_close' && data && !data.period.isClosed && <span className="text-amber-700">El periodo aún no está cerrado: no se generan alertas nuevas.</span>}
        </div>
      )}

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Alertas por asignatura</TabsTrigger>
          {canSeeAll && <TabsTrigger value="summary">Por paralelo</TabsTrigger>}
          <TabsTrigger value="signals">Señales generales</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="mt-4">
          {isLoading || !periodId ? <PageLoader /> : !data || data.items.length === 0 ? (
            <Card><CardContent><EmptyState icon={CheckCircle2} title="Sin alertas" description="No hay alertas con el filtro seleccionado." /></CardContent></Card>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" disabled={!selected.length} onClick={() => setStartAlerts(data.items.filter((a) => selected.includes(a.id)))}>
                  Iniciar plan grupal ({selected.length})
                </Button>
                <span className="text-xs text-muted-foreground">Selecciona alertas de la misma asignatura para compartir un plan.</span>
              </div>
              {data.items.map((a) => (
                <AlertCard
                  key={a.id}
                  a={a}
                  selected={selected.includes(a.id)}
                  onSelect={(checked) => {
                    if (checked && selected.some((id) => data.items.find((item) => item.id === id)?.assignment.id !== a.assignment.id)) {
                      toast.error('Selecciona alertas de la misma asignatura para el plan grupal')
                      return
                    }
                    setSelected((previous) => checked ? [...new Set([...previous, a.id])] : previous.filter((id) => id !== a.id))
                  }}
                  onStart={() => setStartAlerts([a])}
                  onCompose={() => setComposerFor(a)}
                  onDismiss={() => setDismissFor(a)}
                  onReopen={() => reopen.mutate(a.id)}
                  onLink={() => setLinkFor(a)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {canSeeAll && (
          <TabsContent value="summary" className="mt-4">
            {!summary ? <PageLoader /> : summary.parallels.length === 0 ? (
              <Card><CardContent><EmptyState icon={CheckCircle2} title="Sin alertas abiertas" /></CardContent></Card>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead><tr className="bg-muted/60 text-left"><th className="p-3">Paralelo</th><th className="p-3 text-right">Abiertas</th><th className="p-3 text-right">Sin ningún informe</th><th className="p-3 text-right">Con caso de refuerzo</th></tr></thead>
                  <tbody>
                    {summary.parallels.map((p) => (
                      <tr key={p.parallelId} className="border-t">
                        <td className="p-3"><button className="font-medium text-primary hover:underline" onClick={() => setParallelId(p.parallelId)}>{p.parallel}</button></td>
                        <td className="p-3 text-right">{p.open}</td>
                        <td className="p-3 text-right">{p.withoutReports > 0 ? <Badge variant="destructive">{p.withoutReports}</Badge> : 0}</td>
                        <td className="p-3 text-right">{p.withCase}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        )}

        <TabsContent value="signals" className="mt-4">
          <GeneralSignalsPanel />
        </TabsContent>
      </Tabs>

      <ReportComposerDialog
        open={!!composerFor}
        onOpenChange={(o) => !o && setComposerFor(null)}
        context={composerFor ? { alertId: composerFor.id, reinforcementPlanId: composerFor.reinforcementCase?.id } : {}}
        existingReports={composerFor?.reports.filter((r) => r.grouped && r.reportId).map((r) => ({ typeKey: r.typeKey, reportId: r.reportId! }))}
      />
      <StartReinforcementDialog alerts={startAlerts} periodId={periodId} onClose={() => setStartAlerts([])} />
      <DismissDialog alert={dismissFor} onClose={() => setDismissFor(null)} onDone={refresh} />
      <LinkCaseDialog alert={linkFor} periodId={periodId} onClose={() => setLinkFor(null)} onDone={refresh} onStart={() => { if (linkFor) setStartAlerts([linkFor]); setLinkFor(null) }} />
    </div>
  )
}

function ReportStep({ r }: { r: EarlyAlertItem['reports'][number] }) {
  const done = r.sent > 0
  const Icon = done ? CheckCircle2 : r.drafts > 0 ? CircleDashed : XCircle
  const color = done ? 'text-emerald-600' : r.drafts > 0 ? 'text-amber-600' : 'text-muted-foreground'
  return (
    <li className="flex flex-wrap items-center gap-2 text-xs">
      <Icon className={`h-4 w-4 shrink-0 ${color}`} />
      <span>{r.label}</span>
      {done && <span className="text-muted-foreground">({r.sent} · {REPORT_STATUS_LABEL[r.lastStatus as FormalReportStatus] ?? r.lastStatus})</span>}
      {!done && r.drafts > 0 && <span className="text-muted-foreground">(borrador)</span>}
      {r.needsAmendment && <span className="text-amber-700">Pendiente de incluir en una ampliación</span>}
      {r.grouped && r.reportId && <Link className="text-primary hover:underline" to={`/informes/${r.reportId}`}>Abrir informe agrupado</Link>}
    </li>
  )
}

function AlertCard({ a, onCompose, onDismiss, onReopen, onLink, onStart, selected, onSelect }: { a: EarlyAlertItem; onStart: () => void; selected: boolean; onSelect: (checked: boolean) => void; onCompose: () => void; onDismiss: () => void; onReopen: () => void; onLink: () => void }) {
  return (
    <Card className={a.status === 'OPEN' ? 'border-amber-200' : ''}>
      <CardContent className="grid gap-4 p-4 md:grid-cols-[1.4fr_1fr_auto]">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {a.canStartReinforcement && <input type="checkbox" aria-label={`Seleccionar alerta de ${a.student.name}`} checked={selected} onChange={(e) => onSelect(e.target.checked)} />}
            <AlertTriangle className={`h-4 w-4 ${a.status === 'OPEN' ? 'text-amber-600' : 'text-muted-foreground'}`} />
            <Link to={`/students/${a.student.id}`} className="font-medium hover:underline">{a.student.name}</Link>
            <Badge variant={a.status === 'OPEN' ? 'warning' : a.status === 'RESOLVED' ? 'success' : 'secondary'}>{STATUS_LABEL[a.status]}</Badge>
          </div>
          <p className="text-sm">{a.assignment.subjectName} · <span className="text-muted-foreground">{a.parallel.levelName} {a.parallel.name} · {a.assignment.teacherName}</span></p>
          <p className="text-sm">
            Al detectar: <b>{a.qualitativeCode ?? n(a.scoreAtDetection)}</b> → Actual: <b>{n(a.currentScore)}</b>
            <span className="ml-2 text-xs text-muted-foreground">desde {new Date(a.detectedAt).toLocaleDateString('es-EC')}</span>
          </p>
          {a.dismissedReason && <p className="text-xs text-muted-foreground">Descartada: {a.dismissedReason}</p>}
          <p className="text-xs">
            {a.reinforcementCase ? (
              <Link className="text-primary hover:underline" to={`/refuerzo/casos/${a.reinforcementCase.id}`}>Abrir plan · {CASE_STATUS_LABEL[a.reinforcementCase.caseStatus] ?? a.reinforcementCase.caseStatus}</Link>
            ) : <span className="text-muted-foreground">Sin caso de refuerzo vinculado</span>}
          </p>
        </div>
        <ul className="space-y-1">
          {a.reports.length === 0 ? <li className="text-xs text-muted-foreground">No hay informes configurados para alertas.</li> : a.reports.map((r) => <ReportStep key={r.typeKey} r={r} />)}
        </ul>
        {a.canAct && (
          <div className="flex flex-row flex-wrap gap-2 md:flex-col">
            {a.canStartReinforcement && <Button size="sm" onClick={onStart}>Iniciar plan de refuerzo</Button>}
            {a.status !== 'DISMISSED' && <Button size="sm" onClick={onCompose}><FilePen className="mr-1 h-4 w-4" /> Preparar informe</Button>}
            {(a.status === 'OPEN' || !a.reinforcementCase) && <details><summary className="cursor-pointer text-xs text-muted-foreground">Otras acciones</summary><div className="mt-2 flex flex-wrap gap-2">
              {!a.reinforcementCase && <Button size="sm" variant="outline" onClick={onLink}><Link2 className="mr-1 h-4 w-4" /> Vincular plan existente</Button>}
              {a.status === 'OPEN' && <Button size="sm" variant="ghost" onClick={onDismiss}>Descartar alerta</Button>}
            </div></details>}
            {a.status === 'DISMISSED' && <Button size="sm" variant="ghost" onClick={onReopen}><RotateCcw className="mr-1 h-4 w-4" /> Reabrir</Button>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DismissDialog({ alert, onClose, onDone }: { alert: EarlyAlertItem | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = React.useState('')
  React.useEffect(() => { if (alert) setReason('') }, [alert])
  const m = useMutation({
    mutationFn: () => earlyAlertsApi.dismiss(alert!.id, reason.trim()),
    onSuccess: () => { toast.success('Alerta descartada'); onClose(); onDone() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  return (
    <Dialog open={!!alert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descartar alerta</DialogTitle>
          <DialogDescription>Queda registrado el motivo. Puedes reabrirla en cualquier momento.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1"><Label>Motivo</Label><Textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!reason.trim() || m.isPending} onClick={() => m.mutate()}>Descartar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LinkCaseDialog({ alert, periodId, onClose, onDone, onStart }: { onStart: () => void; alert: EarlyAlertItem | null; periodId: string; onClose: () => void; onDone: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['desk-cases-for-alert', alert?.id],
    queryFn: () => earlyAlertsApi.cases({ periodId, courseAssignmentId: alert!.assignment.id, studentId: alert!.student.id }),
    enabled: !!alert,
  })
  const m = useMutation({
    mutationFn: (planId: string) => earlyAlertsApi.linkCase(alert!.id, planId),
    onSuccess: () => { toast.success('Caso vinculado'); onClose(); onDone() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  return (
    <Dialog open={!!alert} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular caso de refuerzo</DialogTitle>
          <DialogDescription>Casos del mismo estudiante, asignatura y periodo.</DialogDescription>
        </DialogHeader>
        {isLoading ? <PageLoader /> : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay planes para esta alerta.
            {alert?.canStartReinforcement && <Button className="ml-2" size="sm" onClick={onStart}>Iniciar plan de refuerzo</Button>}
          </p>
        ) : (
          <ul className="space-y-2">
            {data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded border p-2 text-sm">
                <div>
                  <p className="font-medium">{c.learningTarget ?? c.subject}</p>
                  <p className="text-xs text-muted-foreground">{c.caseStatus} · {new Date(c.createdAt).toLocaleDateString('es-EC')}</p>
                </div>
                <Button size="sm" disabled={m.isPending} onClick={() => m.mutate(c.id)}>Vincular</Button>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter><Button variant="outline" onClick={onClose}>Cerrar</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
