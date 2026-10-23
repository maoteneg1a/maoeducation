import * as React from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertCircle, XCircle, MinusCircle } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { getYears } from '@/features/enrollment/api/enrollment.api'
import { getDossier, type DossierEvidence, type DossierItemStatus } from '../api/dossier.api'

const STATUS_UI: Record<DossierItemStatus, { label: string; icon: React.ElementType; className: string }> = {
  ok: { label: 'Cumple', icon: CheckCircle2, className: 'text-green-600' },
  partial: { label: 'Incompleto', icon: AlertCircle, className: 'text-amber-600' },
  missing: { label: 'Falta', icon: XCircle, className: 'text-red-600' },
  na: { label: 'No aplica', icon: MinusCircle, className: 'text-muted-foreground' },
}

const EVIDENCE_STATUS: Record<string, string> = {
  SENT: 'Enviado (sin acuse)',
  RECEIVED: 'Recibido',
  RETURNED: 'Devuelto',
  ATTENDED: 'Atendido',
  SIGNED: 'Firmada',
  UNSIGNED: 'Sin firma',
  REGISTERED: 'Registrada',
  DETECTED: 'Detectado',
  PLANNED: 'Planificado',
  IN_REINFORCEMENT: 'En refuerzo',
  EVALUATED: 'Evaluado',
  CLOSED: 'Cerrado',
  CONTINUES_REINFORCEMENT: 'Continúa refuerzo',
}

function evidenceLink(e: DossierEvidence): string | null {
  if (e.kind === 'formal_report') return `/informes/${e.id}`
  if (e.kind === 'reinforcement_case') return `/refuerzo/casos/${e.id}`
  if (e.kind === 'parent_meeting') return `/parent-meetings/${e.id}`
  return null
}

/** Expediente de respaldo del estudiante: checklist configurable por institución. Nunca muestra contenido. */
export function DossierPanel({ studentId }: { studentId: string }) {
  const [yearId, setYearId] = React.useState('')
  const { data: years = [], isLoading: yearsLoading } = useQuery({ queryKey: ['years'], queryFn: getYears })
  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [yearId, years])

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dossier', studentId, yearId],
    queryFn: () => getDossier(studentId, yearId),
    enabled: !!yearId,
  })

  if (yearsLoading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Respaldo documental del año (informes con acuse de recibo, actas y casos de refuerzo).
        </p>
        <Select value={yearId} onValueChange={setYearId}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Año lectivo" /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? <PageLoader /> : isError ? (
        <EmptyState title="No se pudo cargar el expediente" description={getErrorMessage(error)} />
      ) : data && (
        <>
          {!data.applies && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              El expediente no aplica a este subnivel según la configuración.
            </div>
          )}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">{data.parallel.name} · {data.academicYear.name}</span>
                <span className="font-semibold">{data.completion}% completo</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full', data.completion >= 100 ? 'bg-green-500' : data.completion >= 50 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.min(100, data.completion)}%` }}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Asignaturas en riesgo:</span>
                {data.riskSubjects.length === 0
                  ? <span className="text-muted-foreground">ninguna con alerta temprana</span>
                  : data.riskSubjects.map((s) => <Badge key={s.id} variant="warning">{s.name}</Badge>)}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {data.items.map((item) => {
              const ui = STATUS_UI[item.status]
              const Icon = ui.icon
              return (
                <Card key={item.key}>
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ui.className)} />
                        <div>
                          <p className="text-sm font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Mínimo {item.minCount}{item.perSubject ? ' por asignatura en riesgo' : ''}
                            {item.optional ? ' · opcional' : ''} · con acuse: {item.acknowledged}
                            {item.pending > 0 ? ` · pendientes de acuse: ${item.pending}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={cn('whitespace-nowrap text-xs font-semibold', ui.className)}>{ui.label}</span>
                    </div>
                    {item.subjects.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-7">
                        {item.subjects.map((s) => (
                          <Badge key={s.subject} variant={s.ok ? 'success' : 'destructive'}>
                            {s.subject}: {s.count}/{s.required}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {item.evidence.length > 0 && (
                      <ul className="space-y-1 pl-7 text-xs">
                        {item.evidence.map((e) => {
                          const href = evidenceLink(e)
                          const text = `${e.folio ? `${e.folio} · ` : ''}${e.label}${e.subject ? ` · ${e.subject}` : ''}${e.date ? ` · ${e.date}` : ''}`
                          return (
                            <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-2">
                              {href ? <Link to={href} className="text-primary hover:underline">{text}</Link> : <span>{text}</span>}
                              <span className="text-muted-foreground">{EVIDENCE_STATUS[e.status] ?? e.status}</span>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
