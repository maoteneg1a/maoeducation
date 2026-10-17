import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { apiGet } from '@/shared/lib/api-client'
import { getParallels, getYears } from '@/features/enrollment/api/enrollment.api'

interface AlertItem {
  studentId: string
  studentName: string
  dni?: string | null
  parallelId: string
  parallel: string
  severity: 'high' | 'medium'
  reasons: string[]
  metrics: { lowGrades: number; missedTasks: number; absences: number; late: number }
}

interface AlertsData {
  year: { id: string; name: string }
  period: { id: string; name: string }
  totalStudents: number
  alerts: AlertItem[]
}

export function EarlyAlertsPage() {
  const [yearId, setYearId] = React.useState('')
  const [parallelId, setParallelId] = React.useState('all')
  const { data: years = [], isLoading: yearsLoading } = useQuery({ queryKey: ['years'], queryFn: getYears })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: !!yearId })
  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((year) => year.isActive)?.id ?? years[0].id)
  }, [yearId, years])
  React.useEffect(() => setParallelId('all'), [yearId])
  const { data, isLoading } = useQuery({
    queryKey: ['early-alerts', yearId, parallelId],
    queryFn: () => apiGet<AlertsData>('dashboard/early-alerts', { yearId, parallelId: parallelId === 'all' ? undefined : parallelId }),
    enabled: !!yearId,
  })

  if (yearsLoading) return <PageLoader />
  const high = data?.alerts.filter((item) => item.severity === 'high').length ?? 0

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div><h1 className="text-2xl font-bold">Alertas académicas</h1><p className="mt-1 text-sm text-muted-foreground">Señales objetivas para priorizar acompañamiento; no modifican notas ni clasifican definitivamente al estudiante.</p></div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Select value={yearId} onValueChange={setYearId}><SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Año lectivo" /></SelectTrigger><SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent></Select>
        <Select value={parallelId} onValueChange={setParallelId}><SelectTrigger className="w-full sm:w-64"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los paralelos</SelectItem>{parallels.map((parallel) => <SelectItem key={parallel.id} value={parallel.id}>{parallel.level.name} - {parallel.name}</SelectItem>)}</SelectContent></Select>
      </div>
      {isLoading ? <PageLoader /> : data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric icon={Users} label="Estudiantes analizados" value={data.totalStudents} />
            <Metric icon={AlertTriangle} label="Requieren revisión" value={data.alerts.length} warning={data.alerts.length > 0} />
            <Metric icon={AlertTriangle} label="Prioridad alta" value={high} warning={high > 0} />
          </div>
          <p className="text-xs text-muted-foreground">Período analizado: {data.period.name}. Asistencia de los últimos 30 días.</p>
          {data.alerts.length === 0 ? (
            <Card><CardContent className="flex flex-col items-center py-12 text-center"><CheckCircle2 className="mb-3 h-10 w-10 text-emerald-600" /><p className="font-medium">Sin alertas con las reglas actuales</p></CardContent></Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] text-sm">
                <thead><tr className="bg-muted/60"><th className="p-3 text-left">Estudiante</th><th className="p-3 text-left">Paralelo</th><th className="p-3 text-left">Prioridad</th><th className="p-3 text-left">Motivos</th><th className="p-3 text-right">Acción</th></tr></thead>
                <tbody>{data.alerts.map((item) => <tr key={item.studentId} className="border-t"><td className="p-3"><p className="font-medium">{item.studentName}</p>{item.dni && <p className="text-xs text-muted-foreground">CI: {item.dni}</p>}</td><td className="p-3">{item.parallel}</td><td className="p-3"><Badge variant={item.severity === 'high' ? 'destructive' : 'warning'}>{item.severity === 'high' ? 'Alta' : 'Revisar'}</Badge></td><td className="p-3"><ul className="list-disc space-y-1 pl-4 text-xs">{item.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></td><td className="p-3 text-right"><Link className="font-medium text-primary hover:underline" to={`/students/${item.studentId}`}>Ver ficha</Link></td></tr>)}</tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value, warning }: { icon: React.ElementType; label: string; value: number; warning?: boolean }) {
  return <Card className={warning ? 'border-amber-300' : ''}><CardContent className="flex items-center gap-3 p-4"><div className={warning ? 'rounded-lg bg-amber-100 p-2 text-amber-700' : 'rounded-lg bg-primary/10 p-2 text-primary'}><Icon className="h-5 w-5" /></div><div><p className="text-xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></CardContent></Card>
}
