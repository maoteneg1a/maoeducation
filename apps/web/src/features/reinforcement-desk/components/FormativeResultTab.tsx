import { useQuery } from '@tanstack/react-query'
import { reinforcementDeskApi, type CaseDetail } from '../api/reinforcement-desk.api'

/** El cálculo se confirma al guardar el registro; esta vista solo consulta su historial. */
export function FormativeResultTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
  const { data, isLoading, isError } = useQuery({ queryKey: ['reinforcement-formative', planId], queryFn: () => reinforcementDeskApi.formativeOptions(planId) })
  return <div className="space-y-3 rounded border p-4">
    <h3 className="font-medium">Historial de calificaciones</h3>
    <p className="text-sm text-muted-foreground">Las notas y el promedio se actualizan al guardar en Actividades y asistencia.</p>
    {isLoading && <p>Cargando historial…</p>}{isError && <p role="alert">No se pudo cargar el historial.</p>}
    {data && !data.history.length && <p className="text-sm text-muted-foreground">Todavía no hay cálculos registrados.</p>}
    {data?.history.map((item) => <div key={item.id} className="border-t pt-3 text-sm">
      <p className="font-medium">{detail.students.find((student) => student.id === item.studentId)?.name ?? 'Estudiante'} · {item.payload.initialFormative?.toFixed(2) ?? '—'} → {item.payload.adjustedFormative?.toFixed(2) ?? '—'}</p>
      <p className="text-muted-foreground">{new Date(item.createdAt).toLocaleString('es-EC')} · {item.recordedByName}</p><p>{item.reason}</p>
    </div>)}
  </div>
}
