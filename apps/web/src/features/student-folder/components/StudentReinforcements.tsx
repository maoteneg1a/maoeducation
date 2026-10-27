import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage } from '@/shared/lib/utils'
import { reinforcementDeskApi, CASE_STATUS_LABEL } from '@/features/reinforcement-desk/api/reinforcement-desk.api'
import type { FolderEnrollment } from '../api/student-folder.api'

export function StudentReinforcements({ studentId, enrollments }: { studentId: string; enrollments: FolderEnrollment[] }) {
  const [yearId, setYearId] = useState(enrollments[0]?.academicYear.id ?? '')
  const years = [...new Map(enrollments.map((enrollment) => [enrollment.academicYear.id, enrollment.academicYear])).values()]
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reinforcement-desk', 'student', studentId, yearId],
    queryFn: () => reinforcementDeskApi.list({ studentId, yearId: yearId || undefined }),
  })
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Refuerzos del estudiante</h2><p className="text-sm text-muted-foreground">Planes, actividades, calificaciones y anexos de cada seguimiento.</p></div>{years.length > 1 && <select aria-label="Año de los refuerzos" className="rounded border bg-background p-2 text-sm" value={yearId} onChange={(event) => setYearId(event.target.value)}>{years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</select>}</div>
    {isLoading ? <PageLoader /> : isError ? <div role="alert"><p>{getErrorMessage(error)}</p><Button variant="outline" onClick={() => refetch()}>Volver a intentar</Button></div> : !data.length ? <EmptyState title="Sin refuerzos registrados" description="Aquí aparecerán los seguimientos individuales y grupales en los que participe este estudiante." /> : data.map((plan) => <Card key={plan.id}><CardContent className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{plan.subject} · {plan.period.name}</h3><Badge variant={plan.caseStatus === 'CLOSED' ? 'success' : 'outline'}>{plan.caseStatus === 'CLOSED' ? 'Finalizado' : CASE_STATUS_LABEL[plan.caseStatus]}</Badge></div>
      {plan.learningTarget && <p className="text-sm">{plan.learningTarget}</p>}
      <p className="text-xs text-muted-foreground">{plan.sessions} actividades · {plan.reports.sent} informes enviados{plan.mode === 'GROUP' ? ' · Plan grupal' : ''}</p>
      <div className="flex flex-wrap gap-2"><Button asChild size="sm"><Link to={`/refuerzo/casos/${plan.id}?tab=sessions&fromStudent=${encodeURIComponent(studentId)}`}>Ver actividades y notas</Link></Button><Button asChild size="sm" variant="outline"><Link to={`/refuerzo/casos/${plan.id}?tab=documents&fromStudent=${encodeURIComponent(studentId)}`}>Ver anexos</Link></Button></div>
    </CardContent></Card>)}
  </div>
}
