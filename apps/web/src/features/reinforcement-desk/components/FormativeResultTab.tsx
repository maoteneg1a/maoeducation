import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Textarea } from '@/shared/components/ui/textarea'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Card, CardContent } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import { reinforcementDeskApi, type CaseDetail, type FormativePreview, type FormativeResultInput } from '../api/reinforcement-desk.api'

const n = (v: number | null) => v == null ? '—' : v.toFixed(2)
const modeName = (mode: string | null) => mode === 'activity_set' ? 'Por aprendizajes: conjunto de actividades' : mode === 'period_formative' ? 'Integral del período: promedio formativo' : 'Sin configurar'

export function FormativeResultTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
  const qc = useQueryClient()
  const options = useQuery({ queryKey: ['reinforcement-formative', planId], queryFn: () => reinforcementDeskApi.formativeOptions(planId) })
  const activities = useQuery({ queryKey: ['reinforcement-desk-activities', planId], queryFn: () => reinforcementDeskApi.activities(planId) })
  const [studentId, setStudentId] = useState(detail.students[0]?.id ?? '')
  const [activityIds, setActivityIds] = useState<string[]>([])
  const [sessionIds, setSessionIds] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [revoke, setRevoke] = useState(false)
  const [preview, setPreview] = useState<{ key: string; data: FormativePreview } | null>(null)
  useEffect(() => { setActivityIds([]); setSessionIds([]); setRevoke(false); setReason(''); setPreview(null) }, [studentId, planId])
  const history = options.data?.history.filter((r) => r.studentId === studentId) ?? []
  const latest = history[0]
  const input: FormativeResultInput = { studentId, activityIds, sessionIds, revoke, expectedResultId: latest?.id ?? null }
  const fingerprint = JSON.stringify({ input, policy: options.data?.policy, sessions: detail.sessions, activities: activities.data })
  const shown = preview?.key === fingerprint ? preview.data : null
  const calculate = useMutation({
    mutationFn: ({ data }: { data: FormativeResultInput; key: string }) => reinforcementDeskApi.previewFormative(planId, data),
    onSuccess: (data, variables) => setPreview({ key: variables.key, data }),
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const apply = useMutation({
    mutationFn: () => reinforcementDeskApi.applyFormative(planId, { ...input, reason, expectedPreviewToken: shown?.previewToken }),
    onSuccess: () => {
      setPreview(null); setReason(''); setSessionIds([]); setActivityIds([]); setRevoke(false)
      for (const key of ['reinforcement-formative', 'reinforcement-desk-detail', 'reinforcement-desk-activities', 'grades-grid', 'report-grades', 'my-grades', 'student-bulletin', 'promotion', 'pedagogic-recovery', 'early-alerts', 'early-alerts-v2', 'early-alerts-summary', 'dossier', 'grades']) qc.invalidateQueries({ queryKey: [key] })
      toast.success('Resultado registrado con historial')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const toggle = (ids: string[], id: string, set: (v: string[]) => void) => set(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])
  if (options.isError || activities.isError) return <p role="alert">{getErrorMessage(options.error ?? activities.error)}</p>
  if (!options.data || !activities.data) return <p>Cargando procedimiento institucional…</p>
  const { policy, scale, canApply } = options.data
  const busy = calculate.isPending || apply.isPending
  return (
    <div className="space-y-4">
      <Card><CardContent className="space-y-2 p-4">
        <p className="font-medium">{modeName(policy.mode)}</p>
        <p className="text-sm text-muted-foreground">Inicial: {100 - policy.reinforcementWeight} % · Refuerzo: {policy.reinforcementWeight} % · Tope: {policy.cap}/{scale}. Se conserva la nota inicial cuando el cálculo no mejora el resultado. La sumativa conserva sus notas.</p>
        {!policy.mode && <p className="text-sm">La institución debe elegir su procedimiento en Configuración de calificación.</p>}
      </CardContent></Card>
      <div className="max-w-md space-y-1.5"><Label>Estudiante</Label>
        <Select value={studentId} onValueChange={setStudentId} disabled={busy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{detail.students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {canApply && (policy.mode || latest?.payload.score != null) && (
        <fieldset disabled={busy} className="space-y-4">
          {latest?.payload.score != null && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={revoke} onChange={(e) => setRevoke(e.target.checked)} /> Retirar la aplicación vigente y conservar su historial</label>}
          {!revoke && policy.mode === 'activity_set' && <div className="space-y-2">
            <p className="font-medium">Actividades formativas atendidas por el plan</p>
            <p className="text-sm text-muted-foreground">El conjunto mantiene su peso dentro de los insumos. Sus notas individuales se conservan como antecedentes.</p>
            {activities.data.filter((a) => !a.summative).map((a) => {
              const score = a.grades.find((g) => g.studentId === studentId)?.effective
              return <label key={a.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" disabled={score == null} checked={activityIds.includes(a.id)} onChange={() => toggle(activityIds, a.id, setActivityIds)} />{a.name} · {a.insumo ?? 'Sin insumo'} · {score == null ? 'Sin nota' : `${score}/${a.maxScore}`}</label>
            })}
          </div>}
          {!revoke && <div className="space-y-2">
            <p className="font-medium">Actividades calificadas del refuerzo</p>
            <p className="text-sm text-muted-foreground">Se promedian las seleccionadas, con igual peso. Las prácticas sin calificación quedan como evidencia del acompañamiento.</p>
            {!detail.sessions.length && <p className="text-sm">Registra las actividades y sus resultados en Sesiones y asistencia.</p>}
            {detail.sessions.map((s) => {
              const att = s.attendances.find((a) => a.studentId === studentId)
              const summative = activities.data.find((a) => a.id === s.targetActivityId)?.summative
              const eligible = att?.status === 'present' && att.score != null && att.appliedScore == null && !summative
              return <label key={s.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" disabled={!eligible} checked={sessionIds.includes(s.id)} onChange={() => toggle(sessionIds, s.id, setSessionIds)} />{s.date} · {s.title} · {att?.score == null ? 'Sin nota' : `${att.score}/${scale}`}{!eligible ? ' · No disponible para este cálculo' : ''}</label>
            })}
          </div>}
          <Button variant="outline" onClick={() => calculate.mutate({ data: input, key: fingerprint })} loading={calculate.isPending}>Ver resultado antes de aplicar</Button>
          {shown && <Card><CardContent className="space-y-3 p-4">
            <p className="font-medium">Formativa: {n(shown.initial.formative)} → {n(shown.adjusted.formative)}</p>
            <p className="text-sm">Total del período: {n(shown.initial.total)} → {n(shown.adjusted.total)}</p>
            {!revoke && <p className="text-sm">Resultado del refuerzo: {n(shown.application.score)} / {scale}. La aplicación sustituye la anterior de este estudiante, asignatura y período; no se acumula sobre ella.</p>}
            <div className="space-y-1.5"><Label>Motivo y observaciones</Label><Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} /></div>
            <Button onClick={() => apply.mutate()} loading={apply.isPending} disabled={reason.trim().length < 5}>Aplicar y guardar registro</Button>
          </CardContent></Card>}
        </fieldset>
      )}
      <div className="space-y-2">
        <p className="font-medium">Historial del estudiante en esta asignatura y período</p>
        {!history.length && <p className="text-sm text-muted-foreground">Sin aplicaciones registradas.</p>}
        {history.map((h, i) => <Card key={h.id}><CardContent className="space-y-1 p-3 text-sm">
          <p className="font-medium">{i === 0 ? 'Vigente' : 'Anterior'} · {h.payload.score == null ? 'Aplicación retirada' : modeName(h.payload.mode)} · {new Date(h.createdAt).toLocaleString()}</p>
          <p>Formativa: {n(h.payload.initialFormative)} → {n(h.payload.adjustedFormative)} · Refuerzo: {n(h.payload.score)} · Peso: {h.payload.reinforcementWeight} % · Tope: {h.payload.cap}</p>
          <p>{h.reason}</p><p className="text-muted-foreground">Registrado por {h.recordedByName}</p>
        </CardContent></Card>)}
      </div>
    </div>
  )
}
