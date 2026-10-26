import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import type { EarlyAlertItem } from '@/features/early-alerts/api/early-alerts.api'
import { reinforcementDeskApi } from '../api/reinforcement-desk.api'
import { activitiesApi } from '@/features/activities/api/activities.api'
import { PlanTextChoice, PLAN_STRATEGIES, PLAN_FREQUENCIES, suggestedObjective } from './PlanTextChoice'

export function StartReinforcementDialog({ alerts, periodId, onClose }: { alerts: EarlyAlertItem[]; periodId: string; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [target, setTarget] = React.useState('')
  const [objective, setObjective] = React.useState('')
  const [strategies, setStrategies] = React.useState('')
  const [schedule, setSchedule] = React.useState('')
  const lock = React.useRef(false)
  const assignmentId = alerts[0]?.assignment.id
  const activities = useQuery({ queryKey: ['reinforcement-start-activities', assignmentId, periodId], queryFn: () => activitiesApi.getActivities({ courseAssignmentId: assignmentId!, periodId }), enabled: !!assignmentId && !!periodId && alerts.length > 0 })
  const targets = [...new Set((activities.data ?? []).map((activity) => activity.curriculumSkill?.description || activity.competency?.text || `Aprendizajes evaluados en ${activity.name}`).filter((value) => value.length <= 3000))]
  React.useEffect(() => { setTarget(''); setObjective(''); setStrategies(''); setSchedule('') }, [alerts])
  const m = useMutation({
    mutationFn: () => reinforcementDeskApi.startFromAlerts({ alertIds: alerts.map((a) => a.id), learningTarget: target.trim(), objective: objective.trim() || suggestedObjective(target.trim()), strategies, schedule }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['early-alerts-v2'] })
      qc.invalidateQueries({ queryKey: ['reinforcement-desk'] })
      toast.success(result.alreadyLinked ? 'Se abrió el plan existente' : 'Plan de refuerzo iniciado')
      onClose()
      navigate(`/refuerzo/casos/${result.id}?tab=sessions&newSession=1`)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  return <Dialog open={alerts.length > 0} onOpenChange={(open) => !open && !m.isPending && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Iniciar plan de refuerzo</DialogTitle><DialogDescription>
        {alerts.map((a) => a.student.name).join(', ')} · {alerts[0]?.assignment.subjectName}. El plan quedará vinculado a estas alertas.
      </DialogDescription></DialogHeader>
      <fieldset disabled={m.isPending} className="space-y-4">
        <PlanTextChoice label="Aprendizaje o actividad a reforzar" value={target} onChange={setTarget} options={targets} />
        {activities.isFetching && <p className="text-xs text-muted-foreground">Cargando aprendizajes de las actividades…</p>}
        {activities.isError && <p role="alert" className="text-xs text-destructive">No se pudieron cargar las actividades. Puedes escribir el aprendizaje.</p>}
        <PlanTextChoice label="Estrategia prevista" value={strategies} onChange={setStrategies} options={PLAN_STRATEGIES} />
        {target.trim() && <p className="rounded border bg-muted/30 p-3 text-sm">Objetivo propuesto: {objective.trim() || suggestedObjective(target.trim())}</p>}
        <details><summary className="cursor-pointer text-sm text-primary">Personalizar objetivo y frecuencia · opcional</summary><div className="mt-3 space-y-3">
          <PlanTextChoice label="Objetivo personalizado" value={objective} onChange={setObjective} options={target.trim() ? [suggestedObjective(target.trim())] : []} optional />
          <PlanTextChoice label="Frecuencia prevista" value={schedule} onChange={setSchedule} options={PLAN_FREQUENCIES} optional />
        </div></details>
      </fieldset>
      <p className="text-xs text-muted-foreground">Al confirmar se guardará este plan y podrás registrar la primera actividad. No se modifican calificaciones.</p>
      <DialogFooter><Button variant="outline" disabled={m.isPending} onClick={onClose}>Cancelar</Button><Button loading={m.isPending} disabled={target.trim().length < 3 || strategies.trim().length < 3} onClick={async () => { if (lock.current) return; lock.current = true; try { await m.mutateAsync() } catch { /* La mutación muestra el error. */ } finally { lock.current = false } }}>Iniciar y registrar actividad</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
