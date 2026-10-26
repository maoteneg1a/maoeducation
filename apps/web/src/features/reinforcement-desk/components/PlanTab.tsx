import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { getErrorMessage } from '@/shared/lib/utils'
import { reinforcementDeskApi, type CaseDetail, type SaveReinforcementPlanInput } from '../api/reinforcement-desk.api'

export function PlanTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
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
  React.useEffect(() => { setForm(initial()); setOutcomes({}); setAssessments({}) }, [k])
  const editable = detail.canEdit && k.caseStatus !== 'CLOSED'
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
  const complete = form.learningTarget.trim().length >= 3 && form.objective.trim().length >= 3 && form.strategies.trim().length >= 3
  const canConclude = complete && detail.sessions.length > 0 && form.notes.trim().length >= 5 && detail.students.every((s) => !!outcomes[s.id])
  const labels = {
    learningTarget: 'Aprendizaje a reforzar', objective: 'Objetivo', strategies: 'Estrategias y actividades previstas',
    resources: 'Recursos', evaluation: 'Cómo se comprobará el aprendizaje', schedule: 'Horario y frecuencia',
  } as const
  return <div className="space-y-5">
    <p className="text-sm text-muted-foreground">Completa la planificación docente. Puedes subir el plan en Archivos o generar su anexo en Informes. Registra las actividades realizadas y su asistencia en Sesiones.</p>
    <fieldset disabled={!editable || m.isPending} className="grid gap-4 sm:grid-cols-2">
      {Object.entries(labels).map(([key, label]) => <div key={key} className="space-y-1">
        <Label htmlFor={key}>{label}</Label>
        <Textarea id={key} rows={3} maxLength={6000} value={form[key as keyof typeof form]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
      </div>)}
    </fieldset>
    {editable && <Button disabled={!complete || m.isPending} onClick={() => m.mutate('save')}>Guardar plan</Button>}
    {editable && <fieldset disabled={m.isPending} className="space-y-3 rounded-lg border p-4">
      <legend className="px-1 font-medium">Valoración y decisión docente</legend>
      <p className="text-sm text-muted-foreground">Valora el aprendizaje de cada participante después de las actividades. Esta decisión queda en el historial y no modifica notas ni cierra automáticamente la alerta.</p>
      {detail.students.map((s) => <div key={s.id} className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`outcome-${s.id}`}>{s.name}</Label>
        <select id={`outcome-${s.id}`} className="rounded border bg-background p-2 text-sm" value={outcomes[s.id] ?? ''} onChange={(e) => setOutcomes((o) => ({ ...o, [s.id]: e.target.value as typeof outcomes[string] }))}>
          <option value="">Seleccionar resultado</option><option value="CONSOLIDATED">Aprendizaje consolidado</option><option value="NOT_CONSOLIDATED">Necesita continuar el apoyo</option>
        </select>
        <Input className="sm:max-w-xs" aria-label={`Valoración posterior de ${s.name}`} placeholder="Valoración posterior (opcional)" maxLength={128} value={assessments[s.id] ?? ''} onChange={(e) => setAssessments((a) => ({ ...a, [s.id]: e.target.value }))} />
      </div>)}
      <Label htmlFor="plan-notes">Conclusión y próximos pasos</Label>
      <Textarea id="plan-notes" maxLength={6000} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!canConclude || m.isPending} onClick={() => m.mutate('continue')}>Continuar refuerzo</Button>
        <Button disabled={!canConclude || m.isPending} onClick={() => m.mutate('close')}>Cerrar seguimiento</Button>
      </div>
    </fieldset>}
  </div>
}
