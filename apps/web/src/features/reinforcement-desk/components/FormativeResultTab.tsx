import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { reinforcementDeskApi, type CaseDetail } from '../api/reinforcement-desk.api'

const note = (value: number | null | undefined) => value == null ? '—' : value.toFixed(2)
const date = (value: string) => new Date(value).toLocaleString('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' })

/** Resultado vigente primero; las versiones anteriores se consultan solo si se necesitan. */
export function FormativeResultTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
  const [showHistory, setShowHistory] = useState(false)
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['reinforcement-formative', planId],
    queryFn: () => reinforcementDeskApi.formativeOptions(planId),
    enabled: showHistory,
  })
  return <div className="space-y-3">
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <caption className="sr-only">Resultado actual del refuerzo</caption>
        <thead><tr>
          <th scope="col" className="bg-muted/50 p-3 text-left">Estudiante</th>
          <th scope="col" className="border-l bg-muted/30 p-3 text-center">Formativa antes</th>
          <th scope="col" className="border-l bg-violet-50/70 p-3 text-center dark:bg-violet-950/20">Refuerzo</th>
          <th scope="col" className="border-l-2 border-teal-200 bg-teal-100/60 p-3 text-center dark:border-teal-800 dark:bg-teal-950/30">Formativa actual</th>
        </tr></thead>
        <tbody>{detail.students.map((student) => {
          const score = detail.scores.find((item) => item.studentId === student.id)
          return <tr key={student.id} className="border-t">
            <th scope="row" className="p-3 text-left font-medium">{student.name}</th>
            <td className="border-l bg-muted/10 p-3 text-center tabular-nums">{note(score?.beforeReinforcement)}</td>
            <td className="border-l bg-violet-50/30 p-3 text-center tabular-nums dark:bg-violet-950/10">{note(score?.reinforcementAverage)}</td>
            <td className="border-l-2 border-teal-200 bg-teal-50/70 p-3 text-center text-base font-semibold tabular-nums dark:border-teal-800 dark:bg-teal-950/20">{note(score?.formative)}</td>
          </tr>
        })}</tbody>
      </table>
    </div>
    <details onToggle={(event) => setShowHistory(event.currentTarget.open)}>
      <summary className="w-fit cursor-pointer text-sm text-muted-foreground hover:text-foreground">Ver cambios</summary>
      {showHistory && <div className="mt-2 max-h-64 overflow-auto rounded-lg border">
        {isLoading && <p className="p-3 text-sm text-muted-foreground">Cargando…</p>}
        {isError && <p role="alert" className="p-3 text-sm">No se pudieron cargar los cambios. <button type="button" className="text-primary underline" onClick={() => refetch()}>Reintentar</button></p>}
        {data && !data.history.length && <p className="p-3 text-sm text-muted-foreground">Sin cambios registrados.</p>}
        {!!data?.history.length && <table className="w-full text-sm"><caption className="sr-only">Cambios de calificaciones</caption><thead className="bg-muted/40"><tr><th scope="col" className="p-2 text-left">Fecha</th>{detail.students.length > 1 && <th scope="col" className="p-2 text-left">Estudiante</th>}<th scope="col" className="p-2 text-center">Antes → Después</th><th scope="col" className="p-2 text-left">Docente</th></tr></thead><tbody>{data.history.map((item) => <tr key={item.id} className="border-t"><td className="whitespace-nowrap p-2 text-muted-foreground">{date(item.createdAt)}</td>{detail.students.length > 1 && <td className="p-2">{detail.students.find((student) => student.id === item.studentId)?.name ?? 'Estudiante'}</td>}<td className="p-2 text-center tabular-nums">{note(item.payload.initialFormative)} → {note(item.payload.adjustedFormative)}</td><td className="p-2 text-muted-foreground">{item.recordedByName}</td></tr>)}</tbody></table>}
      </div>}
    </details>
  </div>
}
