import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FilePlus2, Lock } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage } from '@/shared/lib/utils'
import { ReportComposerDialog } from '@/features/formal-reports/components/ReportComposerDialog'
import { CASE_STATUS_LABEL, reinforcementDeskApi, type CaseDetail } from '../api/reinforcement-desk.api'
import { caseStatusVariant } from './ReinforcementCasesPage'
import { CaseSummaryTab } from '../components/CaseSummaryTab'
import { SessionsTab } from '../components/SessionsTab'
import { AttachmentsTab } from '../components/AttachmentsTab'

const n = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

const REPORT_STATUS: Record<string, { label: string; variant: 'outline' | 'secondary' | 'success' | 'warning' | 'destructive' }> = {
  DRAFT: { label: 'Borrador', variant: 'outline' },
  SENT: { label: 'Enviado', variant: 'warning' },
  RECEIVED: { label: 'Recibido', variant: 'secondary' },
  RETURNED: { label: 'Devuelto', variant: 'destructive' },
  ATTENDED: { label: 'Atendido', variant: 'success' },
}

function LocalReportStatus({ status }: { status: string }) {
  const s = REPORT_STATUS[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={s.variant}>{s.label}</Badge>
}

/** Ficha del caso de refuerzo: resumen, sesiones con asistencia, archivos e informes. */
export function ReinforcementCaseDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reinforcement-desk-detail', id],
    queryFn: () => reinforcementDeskApi.detail(id),
    enabled: !!id,
  })

  if (isLoading) return <PageLoader />
  if (isError || !data) {
    return (
      <div className="space-y-4 p-6">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/refuerzo/casos')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Volver
        </Button>
        <EmptyState title="No se pudo cargar el caso" description={getErrorMessage(error)} />
      </div>
    )
  }

  const k = data.case
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/refuerzo/casos')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Casos de refuerzo
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{data.students.map((s) => s.name).join(', ')}</h1>
          <Badge variant={caseStatusVariant(k.caseStatus)}>{CASE_STATUS_LABEL[k.caseStatus] ?? k.caseStatus}</Badge>
          {k.cycleNumber > 1 && <Badge variant="outline">Ciclo {k.cycleNumber}</Badge>}
          {!data.canEdit && <Badge variant="outline"><Lock className="mr-1 h-3 w-3" /> Solo lectura</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {k.courseAssignment.subject.name} · {k.courseAssignment.parallel.level.name} {k.courseAssignment.parallel.name} · {k.academicPeriod.name}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.scores.map((s) => {
          const name = data.students.find((x) => x.id === s.studentId)?.name ?? ''
          const reached = s.target != null && s.formative != null && s.formative >= s.target
          return (
            <Card key={s.studentId}>
              <CardContent className="space-y-1 p-4">
                <p className="text-sm font-medium">{name}</p>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Al detectar</span>
                  <span className="font-semibold">{n(s.atDetection)}</span>
                  <span className="text-muted-foreground">→ Formativa actual</span>
                  <span className={reached ? 'font-semibold text-green-600' : 'font-semibold'}>{n(s.formative)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total del periodo {n(s.total)} · Meta {n(s.target)}
                  {s.alertStatus ? ` · Alerta: ${s.alertStatus === 'OPEN' ? 'abierta' : s.alertStatus === 'RESOLVED' ? 'resuelta' : 'descartada'}` : ''}
                </p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="flex-wrap">
          <TabsTrigger value="summary">Resumen del caso</TabsTrigger>
          <TabsTrigger value="sessions">Sesiones y asistencia ({data.sessions.length})</TabsTrigger>
          <TabsTrigger value="files">Archivos ({data.attachments.length})</TabsTrigger>
          <TabsTrigger value="reports">Informes ({data.reports.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="summary"><CaseSummaryTab kase={k} /></TabsContent>
        <TabsContent value="sessions"><SessionsTab planId={id} detail={data} /></TabsContent>
        <TabsContent value="files"><AttachmentsTab planId={id} detail={data} /></TabsContent>
        <TabsContent value="reports"><ReportsTab planId={id} detail={data} /></TabsContent>
      </Tabs>
    </div>
  )
}

function ReportsTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = React.useState(false)
  const k = detail.case
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">Informes formales vinculados a este caso. Al enviarse, sus datos quedan congelados.</p>
        {detail.canEdit && detail.reportTypes.length > 0 && (
          <Button size="sm" onClick={() => setOpen(true)}><FilePlus2 className="mr-1.5 h-4 w-4" /> Generar informe</Button>
        )}
      </div>
      {detail.reports.length === 0 ? (
        <EmptyState title="Sin informes" description="Todavía no se ha generado ningún informe para este caso." />
      ) : (
        <div className="space-y-2">
          {detail.reports.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <Link to={`/informes/${r.id}`} className="text-sm font-medium text-primary hover:underline">
                    {r.folio ? `${r.folio} · ` : ''}{r.typeLabel}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    Para: {r.recipientInstanceLabel}{r.sentAt ? ` · enviado ${r.sentAt.slice(0, 10)}` : ''}{r.confidential ? ' · confidencial' : ''}
                  </p>
                </div>
                <LocalReportStatus status={r.status} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ReportComposerDialog
        open={open}
        onOpenChange={setOpen}
        context={{
          reinforcementPlanId: planId,
          studentId: k.studentId,
          courseAssignmentId: k.courseAssignmentId,
          academicPeriodId: k.academicPeriodId,
        }}
        typeKeys={detail.reportTypes.map((t) => t.key)}
        onCreated={(reportId) => {
          qc.invalidateQueries({ queryKey: ['reinforcement-desk-detail', planId] })
          navigate(`/informes/${reportId}`)
        }}
      />
    </div>
  )
}
