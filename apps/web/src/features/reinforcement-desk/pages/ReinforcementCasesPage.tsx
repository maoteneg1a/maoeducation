import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage } from '@/shared/lib/utils'
import { getParallels, getYears } from '@/features/enrollment/api/enrollment.api'
import { academicApi } from '@/features/academic/api/academic.api'
import { CASE_STATUS_LABEL, reinforcementDeskApi } from '../api/reinforcement-desk.api'

const ALL = 'all'

export function caseStatusVariant(status: string): 'success' | 'warning' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'CLOSED') return 'success'
  if (status === 'IN_REINFORCEMENT' || status === 'CONTINUES_REINFORCEMENT') return 'warning'
  if (status === 'EVALUATED') return 'secondary'
  return 'outline'
}

/** Consulta de casos de refuerzo por rol (docente, tutor, autoridad, inspección). */
export function ReinforcementCasesPage() {
  const navigate = useNavigate()
  const [yearId, setYearId] = React.useState('')
  const [periodId, setPeriodId] = React.useState(ALL)
  const [parallelId, setParallelId] = React.useState(ALL)
  const [status, setStatus] = React.useState(ALL)

  const { data: years = [], isLoading: yearsLoading } = useQuery({ queryKey: ['years'], queryFn: getYears })
  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((y) => y.isActive)?.id ?? years[0].id)
  }, [yearId, years])
  React.useEffect(() => { setPeriodId(ALL); setParallelId(ALL) }, [yearId])

  const { data: periods = [] } = useQuery({
    queryKey: ['academic-periods', yearId],
    queryFn: () => academicApi.getPeriods(yearId),
    enabled: !!yearId,
  })
  const { data: parallels = [] } = useQuery({
    queryKey: ['parallels', yearId],
    queryFn: () => getParallels(yearId),
    enabled: !!yearId,
  })

  const { data: cases = [], isLoading, isError, error } = useQuery({
    queryKey: ['reinforcement-desk', yearId, periodId, parallelId, status],
    queryFn: () => reinforcementDeskApi.list({
      yearId,
      periodId: periodId === ALL ? undefined : periodId,
      parallelId: parallelId === ALL ? undefined : parallelId,
      caseStatus: status === ALL ? undefined : status,
    }),
    enabled: !!yearId,
  })

  if (yearsLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Refuerzo pedagógico</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Consulta de los casos de refuerzo pedagógico: sesiones, asistencia, archivos e informes enviados.
          </p>
        </div>
        <Button asChild>
          <Link to="/academic-alerts"><Plus className="mr-1.5 h-4 w-4" /> Iniciar desde una alerta</Link>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Select value={yearId} onValueChange={setYearId}>
          <SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger>
          <SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={periodId} onValueChange={setPeriodId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los periodos</SelectItem>
            {periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={parallelId} onValueChange={setParallelId}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los paralelos</SelectItem>
            {parallels.map((p) => <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {Object.entries(CASE_STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <PageLoader /> : isError ? (
        <EmptyState title="No se pudieron cargar los casos" description={getErrorMessage(error)} />
      ) : cases.length === 0 ? (
        <EmptyState title="Sin casos de refuerzo" description="No hay planes con estos filtros. Para iniciar uno, abre una alerta temprana y selecciona Iniciar plan de refuerzo." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estudiante(s)</TableHead>
                    <TableHead>Asignatura</TableHead>
                    <TableHead>Paralelo</TableHead>
                    <TableHead>Periodo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-center">Sesiones</TableHead>
                    <TableHead className="text-center">Archivos</TableHead>
                    <TableHead className="text-center">Informes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/refuerzo/casos/${c.id}`)}>
                      <TableCell className="font-medium">
                        {c.students.map((s) => s.name).join(', ')}
                        {c.cycleNumber > 1 && <span className="ml-1 text-xs text-muted-foreground">(ciclo {c.cycleNumber})</span>}
                      </TableCell>
                      <TableCell>{c.subject}</TableCell>
                      <TableCell>{c.parallel.name}</TableCell>
                      <TableCell>{c.period.name}</TableCell>
                      <TableCell><Badge variant={caseStatusVariant(c.caseStatus)}>{CASE_STATUS_LABEL[c.caseStatus] ?? c.caseStatus}</Badge></TableCell>
                      <TableCell className="text-center">{c.sessions}</TableCell>
                      <TableCell className="text-center">{c.attachments}</TableCell>
                      <TableCell className="text-center text-xs">
                        {c.reports.sent} enviados{c.reports.drafts > 0 ? ` · ${c.reports.drafts} borradores` : ''}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
