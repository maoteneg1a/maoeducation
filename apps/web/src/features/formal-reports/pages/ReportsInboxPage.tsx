import { ReportMailbox } from '../components/ReportMailbox'
import { Input } from '@/shared/components/ui/input'
import { reinforcementDeskApi } from '@/features/reinforcement-desk/api/reinforcement-desk.api'
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Inbox, Plus, Send, PencilLine, Layers, Clock3, LayoutList, Table2, Search } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { getParallels, getYears, listEnrollments } from '@/features/enrollment/api/enrollment.api'
import { academicApi } from '@/features/academic/api/academic.api'
import { formalReportsApi, type FormalReport, type FormalReportStatus, type ReportBox } from '../api/formal-reports.api'
import { REPORT_STATUS_LABEL, ReportStatusBadge } from '../components/ReportStatusBadge'
import { ReportComposerDialog, type ReportComposerContext } from '../components/ReportComposerDialog'

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export function ReportsInboxPage({ embedded = false }: { embedded?: boolean }) {
  const { hasPermission } = usePermissions()
  const canSeeAll = hasPermission('formal_reports:read:all')
  const canWrite = hasPermission('formal_reports:write')
  const [params, setParams] = useSearchParams()
  const requestedBox = params.get('box')
  const box: ReportBox = requestedBox === 'sent' || requestedBox === 'drafts' || requestedBox === 'inbox' || (requestedBox === 'all' && canSeeAll)
    ? requestedBox : 'inbox'
  const setBox = (value: ReportBox) => {
    setStatus('all'); setOverdueOnly(false); setSearch('')
    setParams((previous) => { const next = new URLSearchParams(previous); next.set('section', 'documents'); next.set('box', value); return next })
  }
  const [status, setStatus] = React.useState<'all' | FormalReportStatus>('all')
  const [search, setSearch] = React.useState('')
  const tableView = params.get('view') === 'table'
  const setView = (view: string) => setParams((previous) => { const next = new URLSearchParams(previous); next.set('view', view); return next })
  const [typeKey, setTypeKey] = React.useState('all')
  const [overdueOnly, setOverdueOnly] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [composer, setComposer] = React.useState<ReportComposerContext | null>(null)

  const { data: counts } = useQuery({ queryKey: ['formal-reports-counts'], queryFn: formalReportsApi.counts, staleTime: 30_000, refetchInterval: 30_000 })
  const { data: flow } = useQuery({ queryKey: ['reports-flow'], queryFn: formalReportsApi.reportsFlow, staleTime: 60_000 })
  const { data: reports = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['formal-reports', box, status, typeKey, overdueOnly],
    staleTime: 0, refetchInterval: 30_000,
    queryFn: () =>
      formalReportsApi.list({
        box,
        status: status === 'all' ? undefined : status,
        typeKey: typeKey === 'all' ? undefined : typeKey,
        overdue: overdueOnly ? 'true' : undefined,
      }),
  })

  const needle = search.trim().toLocaleLowerCase('es')
  const visibleReports = reports.filter((r) => !needle || [r.folio, r.typeLabel, r.student?.name, r.author.name, r.recipientInstanceLabel].some((value) => value?.toLocaleLowerCase('es').includes(needle)))
  const boxTitle = box === 'inbox' ? 'Buzón de recibidos' : box === 'sent' ? 'Informes enviados' : box === 'drafts' ? 'Mis borradores' : 'Informes de la institución'

  return (
    <div className={embedded ? "space-y-6" : "space-y-6 p-4 sm:p-6"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {!embedded && <h1 className="text-2xl font-bold">Informes</h1>}
          <h2 className="text-lg font-semibold">{boxTitle}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{box === 'inbox' ? 'Revisa lo que te enviaron y registra su recepción. Abrir un informe no confirma su acuse.' : 'Aquí también encuentras los documentos creados desde alertas y planes de refuerzo.'}</p>
        </div>
        {canWrite && (
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo informe
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <button type="button" onClick={() => { setBox('inbox'); setStatus('SENT') }} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-left transition-colors hover:bg-amber-50 focus-visible:ring-2 focus-visible:ring-ring">
          <span className="rounded-lg bg-amber-100 p-2 text-amber-700"><Inbox className="h-5 w-5" /></span>
          <span><span className="block text-2xl font-bold">{counts?.inboxPending ?? '—'}</span><span className="text-sm text-muted-foreground">Pendientes de tu acuse</span></span>
        </button>
        <button type="button" onClick={() => setBox('drafts')} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring">
          <span className="rounded-lg bg-primary/10 p-2 text-primary"><PencilLine className="h-5 w-5" /></span>
          <span><span className="block text-2xl font-bold">{counts?.drafts ?? '—'}</span><span className="text-sm text-muted-foreground">Borradores por completar</span></span>
        </button>
        <button type="button" onClick={() => { setBox('sent'); setOverdueOnly(true) }} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring">
          <span className="rounded-lg bg-muted p-2 text-muted-foreground"><Clock3 className="h-5 w-5" /></span>
          <span><span className="block text-2xl font-bold">{counts?.overdueSent ?? '—'}</span><span className="text-sm text-muted-foreground">Envíos con acuse vencido</span></span>
        </button>
      </div>

      <Tabs value={box} onValueChange={(v) => setBox(v as ReportBox)}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="inbox" className="gap-2">
            <Inbox className="h-4 w-4" /> Recibidos
            {!!counts?.inboxPending && <Badge variant="destructive" className="px-1.5">{counts.inboxPending}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sent" className="gap-2">
            <Send className="h-4 w-4" /> Enviados
            {!!counts?.overdueSent && <Badge variant="warning" className="px-1.5">{counts.overdueSent}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="drafts" className="gap-2">
            <PencilLine className="h-4 w-4" /> Borradores
            {!!counts?.drafts && <Badge variant="secondary" className="px-1.5">{counts.drafts}</Badge>}
          </TabsTrigger>
          {canSeeAll && (
            <TabsTrigger value="all" className="gap-2">
              <Layers className="h-4 w-4" /> Todos
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(REPORT_STATUS_LABEL) as FormalReportStatus[])
              .filter((s) => (box === 'drafts' ? s === 'DRAFT' : s !== 'DRAFT'))
              .map((s) => <SelectItem key={s} value={s}>{REPORT_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeKey} onValueChange={setTypeKey}>
          <SelectTrigger className="w-full sm:w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {(flow?.config.reportTypes ?? []).map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {box !== 'drafts' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
            Solo con plazo de acuse vencido
          </label>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" aria-label="Buscar en esta bandeja" placeholder="Buscar por estudiante, remitente, tipo o folio…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        <div className="flex gap-1"><Button variant={tableView ? 'outline' : 'secondary'} size="sm" onClick={() => setView('mailbox')} aria-pressed={!tableView}><LayoutList className="mr-1 h-4 w-4" />Buzón</Button><Button variant={tableView ? 'secondary' : 'outline'} size="sm" onClick={() => setView('table')} aria-pressed={tableView}><Table2 className="mr-1 h-4 w-4" />Tabla</Button></div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : isError ? (
        <div className="space-y-2"><EmptyState title="No se pudieron cargar los informes" description={getErrorMessage(error)} /><Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div>
      ) : visibleReports.length === 0 ? (
        <Card><CardContent><EmptyState icon={box === 'inbox' ? Inbox : FileText} title={search || status !== 'all' || typeKey !== 'all' || overdueOnly ? 'Sin coincidencias con estos filtros' : box === 'inbox' ? 'Tu buzón está al día' : box === 'drafts' ? 'No tienes borradores' : 'Sin informes en esta bandeja'} description={box === 'inbox' ? 'Los informes que te envíen aparecerán aquí. Puedes revisar Enviados y Borradores en sus bandejas.' : 'Los documentos de esta bandeja aparecerán aquí.'} /></CardContent></Card>
      ) : !tableView ? <ReportMailbox reports={visibleReports} box={box} /> : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="bg-muted/60 text-left">
                <th className="p-3">Folio</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Estudiante</th>
                <th className="p-3">{box === 'inbox' ? 'De' : 'Para'}</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Plazo de acuse</th>
                <th className="p-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {visibleReports.map((r) => <ReportRow key={r.id} r={r} box={box} />)}
            </tbody>
          </table>
        </div>
      )}

      <NewReportPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onContinue={(ctx) => { setPickerOpen(false); setComposer(ctx) }}
      />
      <ReportComposerDialog open={!!composer} onOpenChange={(o) => !o && setComposer(null)} context={composer ?? {}} />
    </div>
  )
}

function ReportRow({ r, box }: { r: FormalReport; box: ReportBox }) {
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-3 font-mono text-xs">
        <Link to={`/informes/${r.id}`} className="font-medium text-primary hover:underline">{r.folio ?? 'Borrador'}</Link>
      </td>
      <td className="p-3">
        <Link to={`/informes/${r.id}`} className="hover:underline">{r.typeLabel}</Link>
        {r.confidential && <Badge variant="outline" className="ml-2">Confidencial</Badge>}
      </td>
      <td className="p-3">{r.student?.name ?? '—'}</td>
      <td className="p-3">{box === 'inbox' ? r.author.name : r.recipientInstanceLabel}</td>
      <td className="p-3"><ReportStatusBadge status={r.status} overdue={r.overdue} /></td>
      <td className="p-3 text-xs">{r.ackDeadlineAt ? fmt(r.ackDeadlineAt) : '—'}</td>
      <td className="p-3 text-xs">{fmt(r.sentAt ?? r.updatedAt)}</td>
    </tr>
  )
}

/** Selección simple de año → paralelo → estudiante (opcional) antes de elegir el tipo. */
function NewReportPicker({ open, onOpenChange, onContinue }: { open: boolean; onOpenChange: (o: boolean) => void; onContinue: (ctx: ReportComposerContext) => void }) {
  const autoContext = React.useRef({ period: '', parallel: '', assignment: '' })
  const [yearId, setYearId] = React.useState('')
  const [parallelId, setParallelId] = React.useState('')
  const [studentId, setStudentId] = React.useState('none')
  const [periodId, setPeriodId] = React.useState('none')
  const [assignmentId, setAssignmentId] = React.useState('none')
  const [planId, setPlanId] = React.useState('none')
  const { data: years = [] } = useQuery({ queryKey: ['years'], queryFn: getYears, enabled: open })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: open && !!yearId })
  const { data: periods = [] } = useQuery({ queryKey: ['periods', yearId], queryFn: () => academicApi.getPeriods(yearId), enabled: open && !!yearId })
  const { data: assignments = [] } = useQuery({ queryKey: ['report-assignments', yearId, parallelId], queryFn: () => academicApi.getAssignments({ yearId, parallelId }), enabled: open && !!yearId && !!parallelId })
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', parallelId, yearId],
    queryFn: () => listEnrollments({ parallelId, yearId }),
    enabled: open && !!parallelId,
  })
  React.useEffect(() => {
    if (open && !yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [open, yearId, years])
  React.useEffect(() => { setParallelId(''); setStudentId('none'); setPeriodId('none') }, [yearId])
  React.useEffect(() => { setStudentId('none'); setAssignmentId('none') }, [parallelId])
  React.useEffect(() => {
    if (open && yearId && periods.length && autoContext.current.period !== yearId) {
      autoContext.current.period = yearId
      setPeriodId(periods.find((period) => period.isActive)?.id ?? (periods.length === 1 ? periods[0].id : 'none'))
    }
  }, [open, yearId, periods])
  React.useEffect(() => {
    if (open && !parallelId && parallels.length === 1 && autoContext.current.parallel !== yearId) {
      autoContext.current.parallel = yearId
      setParallelId(parallels[0].id)
    }
  }, [open, parallelId, parallels, yearId])
  React.useEffect(() => {
    const context = `${yearId}:${parallelId}`
    if (open && parallelId && assignments.length === 1 && autoContext.current.assignment !== context) {
      autoContext.current.assignment = context
      setAssignmentId(assignments[0].id)
    }
  }, [open, yearId, parallelId, assignments])

  const { data: plans = [], isError: plansError } = useQuery({
    queryKey: ['report-picker-plans', assignmentId, periodId],
    queryFn: () => reinforcementDeskApi.list({ courseAssignmentId: assignmentId, periodId }),
    enabled: open && assignmentId !== 'none' && periodId !== 'none',
  })
  React.useEffect(() => { setPlanId('none') }, [assignmentId, periodId])
  const selectedPlan = plans.find((p) => p.id === planId)

  const students = enrollments
    .filter((e) => e.status === 'active' && (!selectedPlan || selectedPlan.students.some((s) => s.id === e.student.id)))
    .sort((a, b) => a.student.profile.lastName.localeCompare(b.student.profile.lastName))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo informe</DialogTitle>
          <DialogDescription>Indica sobre qué paralelo o estudiante trata el informe.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Año lectivo</Label>
            <Select value={yearId} onValueChange={setYearId}>
              <SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Paralelo</Label>
            <Select value={parallelId} onValueChange={setParallelId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un paralelo" /></SelectTrigger>
              <SelectContent>{parallels.map((p) => <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Periodo (necesario para los anexos)</Label>
            <Select value={periodId} onValueChange={setPeriodId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sin periodo</SelectItem>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Asignatura (necesaria para los anexos)</Label>
            <Select value={assignmentId} onValueChange={setAssignmentId} disabled={!parallelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sin asignatura</SelectItem>{assignments.map((a) => <SelectItem key={a.id} value={a.id}>{a.subjectName}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Plan de refuerzo (para sus anexos)</Label>
            <Select value={planId} onValueChange={(value) => { setPlanId(value); setStudentId('none') }} disabled={assignmentId === 'none' || periodId === 'none'}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Sin plan vinculado</SelectItem>
                {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.students.map((s) => s.name).join(', ')} · {p.learningTarget ?? p.subject}</SelectItem>)}
              </SelectContent>
            </Select>
            {plansError && <p role="alert" className="text-xs text-destructive">No se pudieron consultar los planes de refuerzo.</p>}
            {assignmentId !== 'none' && periodId !== 'none' && plans.length === 0 && !plansError && <p className="text-xs text-muted-foreground">No hay planes disponibles para esta asignatura y período. Puedes iniciar uno desde una alerta temprana.</p>}
          </div>
          <div className="space-y-1">
            <Label>Estudiante (opcional)</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!parallelId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Informe del paralelo (sin estudiante)</SelectItem>
                {students.map((e) => (
                  <SelectItem key={e.student.id} value={e.student.id}>
                    {e.student.profile.lastName} {e.student.profile.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!parallelId}
            onClick={() => onContinue({
              academicYearId: yearId || undefined,
              parallelId,
              studentId: studentId === 'none' ? undefined : studentId,
              academicPeriodId: periodId === 'none' ? undefined : periodId,
              reinforcementPlanId: planId === 'none' ? undefined : planId,
              courseAssignmentId: assignmentId === 'none' ? undefined : assignmentId,
            })}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
