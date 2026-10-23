import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { FileText, Inbox, Plus, Send, PencilLine, Layers } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { getParallels, getYears, listEnrollments } from '@/features/enrollment/api/enrollment.api'
import { formalReportsApi, type FormalReport, type FormalReportStatus, type ReportBox } from '../api/formal-reports.api'
import { REPORT_STATUS_LABEL, ReportStatusBadge } from '../components/ReportStatusBadge'
import { ReportComposerDialog, type ReportComposerContext } from '../components/ReportComposerDialog'

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export function ReportsInboxPage() {
  const { hasPermission } = usePermissions()
  const canSeeAll = hasPermission('formal_reports:read:all')
  const canWrite = hasPermission('formal_reports:write')
  const [box, setBox] = React.useState<ReportBox>('inbox')
  const [status, setStatus] = React.useState<'all' | FormalReportStatus>('all')
  const [typeKey, setTypeKey] = React.useState('all')
  const [overdueOnly, setOverdueOnly] = React.useState(false)
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const [composer, setComposer] = React.useState<ReportComposerContext | null>(null)

  const { data: counts } = useQuery({ queryKey: ['formal-reports-counts'], queryFn: formalReportsApi.counts, staleTime: 30_000 })
  const { data: flow } = useQuery({ queryKey: ['reports-flow'], queryFn: formalReportsApi.reportsFlow, staleTime: 60_000 })
  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['formal-reports', box, status, typeKey, overdueOnly],
    queryFn: () =>
      formalReportsApi.list({
        box,
        status: status === 'all' ? undefined : status,
        typeKey: typeKey === 'all' ? undefined : typeKey,
        overdue: overdueOnly ? 'true' : undefined,
      }),
  })

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Informes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informes escritos que se envían entre las instancias de la institución, con folio y acuse de recibo.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setPickerOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nuevo informe
          </Button>
        )}
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

      {isLoading ? (
        <PageLoader />
      ) : reports.length === 0 ? (
        <Card><CardContent><EmptyState icon={FileText} title="No hay informes" description="Cuando envíes o recibas informes aparecerán aquí." /></CardContent></Card>
      ) : (
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
              {reports.map((r) => <ReportRow key={r.id} r={r} box={box} />)}
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
  const [yearId, setYearId] = React.useState('')
  const [parallelId, setParallelId] = React.useState('')
  const [studentId, setStudentId] = React.useState('none')
  const { data: years = [] } = useQuery({ queryKey: ['years'], queryFn: getYears, enabled: open })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: open && !!yearId })
  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments', parallelId, yearId],
    queryFn: () => listEnrollments({ parallelId, yearId }),
    enabled: open && !!parallelId,
  })
  React.useEffect(() => {
    if (open && !yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [open, yearId, years])
  React.useEffect(() => { setParallelId(''); setStudentId('none') }, [yearId])
  React.useEffect(() => { setStudentId('none') }, [parallelId])

  const students = enrollments
    .filter((e) => e.status === 'active')
    .sort((a, b) => a.student.profile.lastName.localeCompare(b.student.profile.lastName))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
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
            })}
          >
            Continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
