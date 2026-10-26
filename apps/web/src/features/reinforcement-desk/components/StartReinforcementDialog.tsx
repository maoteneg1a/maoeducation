import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import type { EarlyAlertItem } from '@/features/early-alerts/api/early-alerts.api'
import { reinforcementDeskApi } from '../api/reinforcement-desk.api'

export function StartReinforcementDialog({ alerts, onClose }: { alerts: EarlyAlertItem[]; onClose: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [target, setTarget] = React.useState('')
  const [objective, setObjective] = React.useState('')
  const [strategies, setStrategies] = React.useState('')
  const [schedule, setSchedule] = React.useState('')
  React.useEffect(() => { setTarget(''); setObjective(''); setStrategies(''); setSchedule('') }, [alerts])
  const m = useMutation({
    mutationFn: () => reinforcementDeskApi.startFromAlerts({ alertIds: alerts.map((a) => a.id), learningTarget: target.trim(), objective, strategies, schedule }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['early-alerts-v2'] })
      qc.invalidateQueries({ queryKey: ['reinforcement-desk'] })
      toast.success(result.alreadyLinked ? 'Se abrió el plan existente' : 'Plan de refuerzo iniciado')
      onClose()
      navigate(`/refuerzo/casos/${result.id}`)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  return <Dialog open={alerts.length > 0} onOpenChange={(open) => !open && !m.isPending && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Iniciar plan de refuerzo</DialogTitle><DialogDescription>
        {alerts.map((a) => a.student.name).join(', ')} · {alerts[0]?.assignment.subjectName}. El plan quedará vinculado a estas alertas.
      </DialogDescription></DialogHeader>
      {([['Aprendizaje que necesita refuerzo', target, setTarget], ['Objetivo', objective, setObjective], ['Estrategias y actividades previstas', strategies, setStrategies], ['Horario y frecuencia', schedule, setSchedule]] as const).map(([label, value, setter]) =>
        <div key={label} className="space-y-1"><Label>{label}</Label><Textarea aria-label={label} maxLength={label.startsWith('Aprendizaje') ? 3000 : 6000} value={value} onChange={(e) => setter(e.target.value)} /></div>)}
      <p className="text-xs text-muted-foreground">Luego podrás completar el plan, adjuntar su PDF, registrar actividades, asistencia y resultados, y generar los anexos.</p>
      <DialogFooter><Button variant="outline" disabled={m.isPending} onClick={onClose}>Cancelar</Button><Button disabled={target.trim().length < 3 || m.isPending} onClick={() => m.mutate()}>Iniciar plan</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
