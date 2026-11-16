import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { saveBoardConfig, type BoardConfig } from '../api/course-boards.api'

export function BoardConfigDialog({ config }: { config: BoardConfig }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(config)
  const mutation = useMutation({ mutationFn: saveBoardConfig, onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-boards'] }); setOpen(false); toast.success('Configuración guardada') }, onError: (e) => toast.error(getErrorMessage(e)) })
  return <Dialog open={open} onOpenChange={(value) => { if (mutation.isPending) return; if (value) setDraft(structuredClone(config)); setOpen(value) }}>
    <DialogTrigger asChild><Button variant="outline">Configurar juntas</Button></DialogTrigger>
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader><DialogTitle>Configuración de juntas</DialogTitle><DialogDescription>Los períodos, materias y reglas de notas se toman de la configuración académica. Los documentos ya emitidos conservan su formato.</DialogDescription></DialogHeader>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        {(['title', 'situationLabel', 'actionsLabel', 'recommendationsLabel'] as const).map((key, i) => <div key={key} className="space-y-1"><Label htmlFor={`board-config-${key}`}>{['Nombre del módulo/documento', 'Primer campo del informe', 'Segundo campo del informe', 'Tercer campo del informe'][i]}</Label><Input id={`board-config-${key}`} value={draft[key]} maxLength={key === 'title' ? 120 : 100} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>)}
        <div className="flex flex-wrap gap-4">{(['showAttendance', 'showIncidents', 'showReinforcement'] as const).map((key, i) => <label className="flex items-center gap-2 text-sm" key={key}><input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} />{['Asistencia', 'Incidencias (cantidad)', 'Casos de refuerzo'][i]}</label>)}</div>
        <div className="space-y-2"><Label>Tipos de informe (siempre opcionales)</Label>
          {draft.reportTypes.map((t, index) => <div className="flex flex-wrap items-center gap-2 rounded-md border p-2" key={t.key}>
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={t.enabled} onChange={(e) => setDraft({ ...draft, reportTypes: draft.reportTypes.map((v, i) => i === index ? { ...v, enabled: e.target.checked } : v) })} />Activo</label>
            <Input className="min-w-40 flex-1" aria-label="Nombre del informe" value={t.label} maxLength={120} onChange={(e) => setDraft({ ...draft, reportTypes: draft.reportTypes.map((v, i) => i === index ? { ...v, label: e.target.value } : v) })} />
            <select className="rounded-md border bg-background p-2 text-sm" aria-label="Quién puede emitir el informe" value={t.authors} onChange={(e) => setDraft({ ...draft, reportTypes: draft.reportTypes.map((v, i) => i === index ? { ...v, authors: e.target.value as typeof t.authors } : v) })}><option value="tutor">Tutor (general)</option><option value="teacher">Docente (su materia)</option><option value="both">Tutor o docente</option></select>
          </div>)}
          <Button variant="outline" disabled={draft.reportTypes.length >= 12} onClick={() => setDraft({ ...draft, reportTypes: [...draft.reportTypes, { key: `custom_${Date.now()}`, label: 'Nuevo informe', enabled: true, authors: 'both' }] })}>Agregar tipo de informe</Button>
        </div>
      </fieldset>
      <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>Cancelar</Button><Button onClick={() => mutation.mutate(draft)} disabled={mutation.isPending}>{mutation.isPending ? 'Guardando...' : 'Guardar configuración'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
