import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { getErrorMessage } from '@/shared/lib/utils'
import { getStudentAbsences, requestJustification } from '../api/attendance.api'

/** La familia elige las faltas/atrasos y explica el motivo; inspección lo revisa. */
export function RequestJustificationDialog({ studentId, open, onOpenChange }: { studentId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [reason, setReason] = React.useState('')
  React.useEffect(() => {
    if (open) {
      setSelected(new Set())
      setReason('')
    }
  }, [open])

  const { data, isLoading } = useQuery({
    queryKey: ['student-absences', studentId],
    queryFn: () => getStudentAbsences(studentId),
    enabled: open && !!studentId,
  })
  const records = data?.records ?? []

  const send = useMutation({
    mutationFn: () => requestJustification({ studentId, attendanceRecordIds: [...selected], reason }),
    onSuccess: () => {
      toast.success('Solicitud enviada. Te avisaremos cuando sea revisada.')
      qc.invalidateQueries({ queryKey: ['student-absences', studentId] })
      onOpenChange(false)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Justificar faltas o atrasos</DialogTitle>
          <DialogDescription>Selecciona las fechas y explica el motivo. Inspección revisará tu solicitud.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : records.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No hay faltas ni atrasos pendientes de justificar.</p>
        ) : (
          <div className="space-y-3">
            <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border p-2">
              {records.map((r) => (
                <li key={r.id}>
                  <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50">
                    <input type="checkbox" className="h-4 w-4" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                    <span className="tabular-nums">
                      {new Date(`${r.date}T12:00:00`).toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' })}
                    </span>
                    <span className="text-muted-foreground">
                      · {r.status === 'absent' ? 'Falta' : 'Atraso'}
                      {r.subject ? ` · ${r.subject.name}` : ''}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="space-y-1.5">
              <Label htmlFor="just-reason">Motivo</Label>
              <Textarea
                id="just-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: cita médica, enfermedad, calamidad doméstica…"
                maxLength={2000}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={() => send.mutate()} disabled={selected.size === 0 || reason.trim().length < 3} loading={send.isPending}>
            Enviar solicitud
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
