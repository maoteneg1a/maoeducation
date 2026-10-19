import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  AUDIENCE_LABEL,
  EVENT_TYPE_META,
  calendarApi,
  type CalendarAudience,
  type CalendarEvent,
  type CalendarEventInput,
  type CalendarEventType,
} from '../api/calendar.api'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initialDate?: string
  editing?: CalendarEvent | null
}

export function CalendarEventDialog({ open, onOpenChange, initialDate, editing }: Props) {
  const qc = useQueryClient()
  const blank = (): CalendarEventInput => ({
    title: '',
    description: '',
    type: 'event',
    startDate: initialDate ?? '',
    endDate: null,
    audience: 'all',
  })
  const [form, setForm] = React.useState<CalendarEventInput>(blank)
  React.useEffect(() => {
    if (open) setForm(editing ? { ...editing } : blank())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, initialDate])
  const set = <K extends keyof CalendarEventInput>(k: K, v: CalendarEventInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, endDate: form.endDate || null, description: form.description || null }
      return editing ? calendarApi.update(editing.id, payload) : calendarApi.create(payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] })
      toast.success(editing ? 'Evento actualizado' : 'Evento creado')
      onOpenChange(false)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar evento' : 'Nuevo evento del calendario'}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!form.title.trim() || !form.startDate) return toast.error('Título y fecha son obligatorios')
            save.mutate()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input id="ev-title" value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="Ej: Feriado de Carnaval" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={form.type} onValueChange={(v) => set('type', v as CalendarEventType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EVENT_TYPE_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Visible para</Label>
              <Select value={form.audience} onValueChange={(v) => set('audience', v as CalendarAudience)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AUDIENCE_LABEL).map(([k, l]) => (
                    <SelectItem key={k} value={k}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start">Desde</Label>
              <Input id="ev-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end">Hasta (opcional)</Label>
              <Input id="ev-end" type="date" value={form.endDate ?? ''} min={form.startDate} onChange={(e) => set('endDate', e.target.value || null)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descripción</Label>
            <Textarea id="ev-desc" rows={3} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={save.isPending}>Guardar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
