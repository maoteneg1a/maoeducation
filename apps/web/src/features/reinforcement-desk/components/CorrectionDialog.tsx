import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { reinforcementDeskApi } from '../api/reinforcement-desk.api'
const reasons = ['Corregir una nota mal digitada', 'Completar una evidencia pendiente', 'Corregir asistencia o actividad']
export function CorrectionDialog({ planId, open, onClose }: { planId: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient(), lock = React.useRef(false)
  const correction = useMutation({
    mutationFn: (reason: string) => reinforcementDeskApi.reopenForCorrection(planId, reason),
    onSuccess: async () => { await qc.invalidateQueries({ predicate: (query) => /reinforcement|grade|report|alert/.test(String(query.queryKey[0])) }); toast.success('Puedes corregir las notas. El motivo quedó registrado.'); onClose() },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { lock.current = false },
  })
  return <Dialog open={open} onOpenChange={(value) => !value && !correction.isPending && onClose()}><DialogContent><DialogHeader><DialogTitle>Corregir notas</DialogTitle><DialogDescription>Elige el motivo. Se habilitarán las notas y las actividades del seguimiento para corregirlas. Después revisa el resultado y finaliza nuevamente.</DialogDescription></DialogHeader><div className="grid gap-2">{reasons.map((reason) => <Button key={reason} variant="outline" loading={correction.isPending && correction.variables === reason} disabled={correction.isPending} onClick={() => { if (lock.current) return; lock.current = true; correction.mutate(reason) }}>{reason}</Button>)}</div></DialogContent></Dialog>
}
