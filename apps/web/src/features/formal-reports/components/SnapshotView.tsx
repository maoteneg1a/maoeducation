const n = (v: unknown) => (typeof v === 'number' ? v.toFixed(2) : '—')
const ATT: Record<string, string> = { present: 'Asistió', absent: 'No asistió', justified: 'Justificado' }

type Snap = {
  academicYear?: { name: string } | null
  alertRoster?: Array<{ student: string; result: string }>
  student?: { name: string; dni: string | null } | null
  parallel?: { name: string; tutor: string | null } | null
  subject?: { name: string; teacher: string } | null
  period?: { name: string } | null
  alert?: { scoreAtDetection: number | null; currentScore: number | null; qualitativeCode: string | null; detectedAt: string | null; status: string } | null
  grades?: Array<{ subject: string; teacher: string; insumos: Array<{ name: string; avg: number | null }>; formative: number | null; summative: number | null; total: number | null }>
  reinforcementCase?: {
    attendedClasses?: number
    caseStatus: string
    learningTarget: string | null
    proposal: Record<string, string | null>
    commitments: Array<{ label: string; responsible: string; targetDate: string | null }>
    followUps: Array<{ date: string | null; strategy: string; observation: string }>
    reevaluations: Array<{ date: string | null; evaluation: string; initialResult: string | null; subsequentResult: string | null; decision: string | null }>
    sessions: Array<{ date: string | null; title: string; attendance: Array<{ status: string; score: number | null; applied: number | null }> }>
  } | null
  sessions?: Array<{ date: string | null; title: string; description: string | null; attendance: Array<{ student: string; status: string; score: number | null; appliedScore: number | null; observation: string | null }> }>
}

const PROPOSAL_LABEL: Record<string, string> = {
  objective: 'Objetivo', strategy: 'Estrategia', activity: 'Actividad', resource: 'Recursos',
  evidence: 'Evidencia', evaluation: 'Evaluación', durationFrequency: 'Duración / frecuencia', expectedResult: 'Resultado esperado',
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <p className="text-sm"><span className="font-medium">{label}:</span> {value || '—'}</p>
}

/** Datos que el sistema agrega al informe (notas del motor, caso de refuerzo, asistencia). */
export function SnapshotView({ snapshot }: { snapshot: Record<string, unknown> }) {
  const s = snapshot as Snap
  const hasAny = s.student || s.parallel || s.grades?.length || s.reinforcementCase || s.sessions?.length || s.alert || s.alertRoster
  if (!hasAny) return <p className="text-sm text-muted-foreground">Este tipo de informe no agrega datos automáticos.</p>
  return (
    <div className="space-y-4">
      {(s.student || s.parallel || s.subject || s.period) && (
        <div className="space-y-1">
          {s.academicYear && <Row label="Año lectivo" value={s.academicYear.name} />}
          {s.student && <Row label="Estudiante" value={`${s.student.name}${s.student.dni ? ` (C.I. ${s.student.dni})` : ''}`} />}
          {s.parallel && <Row label="Grado/curso" value={`${s.parallel.name}${s.parallel.tutor ? ` — Tutor: ${s.parallel.tutor}` : ''}`} />}
          {s.subject && <Row label="Asignatura" value={`${s.subject.name} — ${s.subject.teacher}`} />}
          {s.period && <Row label="Periodo" value={s.period.name} />}
        </div>
      )}
      {s.alertRoster && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">Nómina de alertas abiertas o en seguimiento</p>
          {s.alertRoster.length ? <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="p-2">Estudiante</th><th className="p-2">Calificación / resultado</th></tr></thead>
            <tbody>{s.alertRoster.map((a, i) => <tr key={i} className="border-t"><td className="p-2">{a.student}</td><td className="p-2">{a.result}</td></tr>)}</tbody>
          </table> : <p className="text-sm">No constan alertas abiertas o en seguimiento en la asignatura y el periodo seleccionados.</p>}
        </div>
      )}
      {s.alert && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="font-medium text-amber-800">Alerta temprana</p>
          <p>Nota al detectar: <b>{s.alert.qualitativeCode ?? n(s.alert.scoreAtDetection)}</b> · Nota actual: <b>{n(s.alert.currentScore)}</b> · Detectada: {s.alert.detectedAt ?? '—'}</p>
        </div>
      )}
      {!!s.grades?.length && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/60 text-left"><th className="p-2">Asignatura</th><th className="p-2 text-right">Formativa</th><th className="p-2 text-right">Sumativa</th><th className="p-2 text-right">Total</th></tr></thead>
            <tbody>
              {s.grades.map((g) => (
                <tr key={g.subject} className="border-t align-top">
                  <td className="p-2">
                    <p className="font-medium">{g.subject}</p>
                    {g.insumos.length > 0 && <p className="text-xs text-muted-foreground">{g.insumos.map((i) => `${i.name}: ${n(i.avg)}`).join(' · ')}</p>}
                  </td>
                  <td className="p-2 text-right tabular-nums">{n(g.formative)}</td>
                  <td className="p-2 text-right tabular-nums">{n(g.summative)}</td>
                  <td className="p-2 text-right font-semibold tabular-nums">{n(g.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {s.reinforcementCase && (
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-semibold">Caso de refuerzo ({s.reinforcementCase.caseStatus})</p>
          {s.reinforcementCase.attendedClasses != null && <Row label="Clases a las que asistió" value={s.reinforcementCase.attendedClasses} />}
          {s.reinforcementCase.learningTarget && <Row label="Aprendizaje a reforzar" value={s.reinforcementCase.learningTarget} />}
          {Object.entries(s.reinforcementCase.proposal ?? {}).filter(([, v]) => v).map(([k, v]) => <Row key={k} label={PROPOSAL_LABEL[k] ?? k} value={v} />)}
          {s.reinforcementCase.commitments.length > 0 && (
            <div><p className="text-sm font-medium">Compromisos</p><ul className="list-disc pl-5 text-sm">{s.reinforcementCase.commitments.map((c, i) => <li key={i}>{c.label} — {c.responsible}{c.targetDate ? ` (hasta ${c.targetDate})` : ''}</li>)}</ul></div>
          )}
          {s.reinforcementCase.followUps.length > 0 && (
            <div><p className="text-sm font-medium">Seguimientos</p><ul className="list-disc pl-5 text-sm">{s.reinforcementCase.followUps.map((f, i) => <li key={i}>{f.date}: {f.strategy} — {f.observation}</li>)}</ul></div>
          )}
          {s.reinforcementCase.reevaluations.length > 0 && (
            <div><p className="text-sm font-medium">Resultados</p><ul className="list-disc pl-5 text-sm">{s.reinforcementCase.reevaluations.map((r, i) => <li key={i}>{r.date}: {r.evaluation}. {r.initialResult ?? '—'} → {r.subsequentResult ?? '—'}{r.decision ? ` · ${r.decision}` : ''}</li>)}</ul></div>
          )}
          {s.reinforcementCase.sessions.length > 0 && (
            <p className="text-sm text-muted-foreground">{s.reinforcementCase.sessions.length} sesión(es) de refuerzo registradas.</p>
          )}
        </div>
      )}
      {!!s.sessions?.length && (
        <div className="space-y-2">
          {s.sessions.map((ses, i) => (
            <div key={i} className="rounded-md border p-3">
              <p className="text-sm font-medium">{ses.date} — {ses.title}</p>
              {ses.description && <p className="text-xs text-muted-foreground">{ses.description}</p>}
              <ul className="mt-1 text-sm">
                {ses.attendance.map((a, j) => (
                  <li key={j}>
                    {a.student}: <b>{ATT[a.status] ?? a.status}</b>
                    {a.score != null && <> · nota {n(a.score)}{a.appliedScore != null && <> → registrada {n(a.appliedScore)}</>}</>}
                    {a.observation && <span className="text-muted-foreground"> · {a.observation}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Ver datos técnicos</summary>
        <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2">{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </div>
  )
}
