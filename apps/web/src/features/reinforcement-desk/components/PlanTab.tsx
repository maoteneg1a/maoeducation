import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { getErrorMessage } from '@/shared/lib/utils'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { reinforcementDeskApi, type CaseDetail, type SaveReinforcementPlanInput } from '../api/reinforcement-desk.api'
import { PlanTextChoice, PLAN_STRATEGIES, PLAN_RESOURCES, PLAN_EVALUATIONS, PLAN_FREQUENCIES, suggestedObjective } from './PlanTextChoice'

export function PlanTab({ planId, detail, section = 'plan', onOpenPlan }: { planId: string; detail: CaseDetail; section?: 'plan' | 'decision'; onOpenPlan?: () => void }) {
  const qc = useQueryClient()
  const k = detail.case
  const initial = () => ({
    learningTarget: k.proposalLearningToReinforce ?? k.learningTargetDescription ?? k.learningTargetTitle ?? '',
    objective: k.proposalObjective ?? '', strategies: k.proposalActiveStrategy ?? '',
    resources: k.proposalResource ?? '', evaluation: k.proposalEvaluation ?? '',
    schedule: k.proposalDurationFrequency ?? '', notes: '',
  })
  const [form, setForm] = React.useState(initial)
  const [outcomes, setOutcomes] = React.useState<Record<string, 'CONSOLIDATED' | 'NOT_CONSOLIDATED' | ''>>({})
  const [assessments, setAssessments] = React.useState<Record<string, string>>({})
  const lock = React.useRef(false)
  React.useEffect(() => { setForm(initial()); setOutcomes({}); setAssessments({}) }, [k])
  const editable = detail.canEdit && k.caseStatus !== 'CLOSED'
  const lastReview = [...k.reevaluations].sort((a, b) => b.date.localeCompare(a.date))[0]
  const m = useMutation({
    mutationFn: (action: SaveReinforcementPlanInput['action']) => reinforcementDeskApi.savePlan(planId, {
      ...form, action,
      ...(action !== 'save' ? { outcomes: detail.students.map((s) => ({ studentId: s.id, result: outcomes[s.id] as 'CONSOLIDATED' | 'NOT_CONSOLIDATED', assessmentValue: assessments[s.id]?.trim() || undefined })) } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reinforcement-desk-detail', planId] })
      qc.invalidateQueries({ queryKey: ['reinforcement-desk'] })
      toast.success('Plan y seguimiento guardados')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const submit = async (action: SaveReinforcementPlanInput['action']) => {
    if (lock.current) return
    lock.current = true
    try {
      if (action === 'close' && !await confirmDialog({ title: 'Cerrar seguimiento pedagógico', description: 'Se guardará la valoración de los participantes. Las notas y las alertas conservan su estado; no se aprueba al estudiante automáticamente.', confirmText: 'Cerrar seguimiento' })) return
      await m.mutateAsync(action)
    } catch { /* La mutación muestra el error. */ } finally { lock.current = false }
  }
  const complete = form.learningTarget.trim().length >= 3 && form.objective.trim().length >= 3 && form.strategies.trim().length >= 3
  const canConclude = complete && detail.sessions.length > 0 && form.notes.trim().length >= 5 && detail.students.every((s) => !!outcomes[s.id])
  const allAchieved = detail.students.every((s) => outcomes[s.id] === 'CONSOLIDATED')
  const conclusionOptions = detail.students.every((s) => !!outcomes[s.id]) ? [allAchieved
    ? 'Los participantes consolidaron el aprendizaje priorizado. Se mantiene el seguimiento en las actividades habituales.'
    : 'Se requiere continuar el acompañamiento en los aprendizajes que aún presentan dificultades.'] : []
  const change = (key: keyof typeof form) => (value: string) => setForm((previous) => ({ ...previous, [key]: value }))
  const setAll = (result: 'CONSOLIDATED' | 'NOT_CONSOLIDATED') => { setOutcomes(Object.fromEntries(detail.students.map((student) => [student.id, result]))); change('notes')('') }
  return <div className="space-y-4">
    {section === 'plan' && <>
      <p className="text-sm text-muted-foreground">Elige las opciones que describen tu planificación. Puedes personalizar cualquiera; lo guardado se reutiliza en los anexos.</p>
      <fieldset disabled={!editable || m.isPending} className="grid gap-4 sm:grid-cols-2">
        <PlanTextChoice label="Aprendizaje a reforzar" value={form.learningTarget} onChange={change('learningTarget')} options={k.learningTargetTitle ? [k.learningTargetDescription || k.learningTargetTitle] : []} />
        <PlanTextChoice label="Estrategia prevista" value={form.strategies} onChange={change('strategies')} options={PLAN_STRATEGIES} />
        <PlanTextChoice label="Objetivo" value={form.objective} onChange={change('objective')} options={form.learningTarget ? [suggestedObjective(form.learningTarget)] : []} />
        <PlanTextChoice label="Frecuencia prevista" value={form.schedule} onChange={change('schedule')} options={PLAN_FREQUENCIES} optional />
      </fieldset>
      <details><summary className="cursor-pointer text-sm text-primary">Recursos y evaluación · opcional</summary><fieldset disabled={!editable || m.isPending} className="mt-3 grid gap-4 sm:grid-cols-2">
        <PlanTextChoice label="Recursos" value={form.resources} onChange={change('resources')} options={PLAN_RESOURCES} optional />
        <PlanTextChoice label="Cómo se comprobará el aprendizaje" value={form.evaluation} onChange={change('evaluation')} options={PLAN_EVALUATIONS} optional />
      </fieldset></details>
      {editable && <Button disabled={!complete} loading={m.isPending} onClick={() => submit('save')}>Guardar plan</Button>}
    </>}
    {section === 'decision' && <>
      {lastReview && <div className="space-y-2 rounded border bg-muted/30 p-4 text-sm"><p className="font-semibold">Última valoración guardada · {lastReview.date.slice(0, 10)}</p>{lastReview.outcomes.map((outcome) => <p key={outcome.studentId}>{detail.students.find((student) => student.id === outcome.studentId)?.name ?? 'Estudiante'}: {outcome.result === 'CONSOLIDATED' ? 'Aprendizaje consolidado' : 'Necesita continuar el apoyo'}</p>)}<p>{lastReview.observedProgress}</p><p className="text-xs text-muted-foreground">Las calificaciones se consultan arriba; esta valoración corresponde al aprendizaje.</p></div>}
      {!editable && !lastReview && <p className="text-sm text-muted-foreground">No hay una valoración del aprendizaje registrada.</p>}
      {editable && <details open={!lastReview}><summary className="cursor-pointer text-sm font-medium">{lastReview ? 'Registrar una nueva valoración' : 'Valorar aprendizaje y decidir seguimiento'}</summary><fieldset disabled={m.isPending} className="mt-3 space-y-3 rounded-lg border p-4">
      <legend className="px-1 font-medium">Resultado del aprendizaje</legend>
      <p className="text-sm text-muted-foreground">Valora lo aprendido. Esta decisión no modifica notas ni resuelve automáticamente la alerta.</p>
      {!complete && <p className="text-sm text-amber-700">Completa el aprendizaje, objetivo y estrategia del plan antes de concluir. {onOpenPlan && <button type="button" className="text-primary underline" onClick={onOpenPlan}>Completar plan</button>}</p>}
      {!detail.sessions.length && <p className="text-sm text-amber-700">Registra primero las actividades realizadas y su asistencia.</p>}
      {detail.students.length > 1 && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => setAll('CONSOLIDATED')}>Todos consolidaron</Button><Button size="sm" variant="outline" onClick={() => setAll('NOT_CONSOLIDATED')}>Todos necesitan apoyo</Button></div>}
      {detail.students.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`outcome-${s.id}`}>{s.name}</Label>
        <select id={`outcome-${s.id}`} className="rounded border bg-background p-2 text-sm" value={outcomes[s.id] ?? ''} onChange={(e) => { setOutcomes((o) => ({ ...o, [s.id]: e.target.value as typeof outcomes[string] })); change('notes')('') }}>
          <option value="">Seleccionar resultado</option><option value="CONSOLIDATED">Aprendizaje consolidado</option><option value="NOT_CONSOLIDATED">Necesita continuar el apoyo</option>
        </select>
      </div>)}
      <PlanTextChoice label="Conclusión y próximos pasos" value={form.notes} onChange={change('notes')} options={conclusionOptions} />
      <details><summary className="cursor-pointer text-sm text-primary">Valoración individual adicional · opcional</summary><div className="mt-3 space-y-2">{detail.students.map((s) => <div key={s.id} className="space-y-1"><Label>{s.name}</Label><Input aria-label={`Valoración posterior de ${s.name}`} maxLength={128} value={assessments[s.id] ?? ''} onChange={(e) => setAssessments((a) => ({ ...a, [s.id]: e.target.value }))} /></div>)}</div></details>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canConclude} loading={m.isPending} onClick={() => submit('continue')}>Continuar acompañamiento</Button>
        <Button disabled={!canConclude} loading={m.isPending} onClick={() => submit('close')}>Cerrar seguimiento pedagógico</Button>
      </div>
    </fieldset></details>}
    </>}
  </div>
}
