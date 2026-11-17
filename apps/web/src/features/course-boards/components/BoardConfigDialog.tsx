import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { saveBoardConfig, type BoardConfig } from '../api/course-boards.api'

interface Props {
  config: BoardConfig
  parallels: Array<{ id: string; name: string; secretaryId: string | null }>
  candidates: Array<{ id: string; name: string }>
}

export function BoardConfigDialog({ config, parallels, candidates }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(config)
  const mutation = useMutation({ mutationFn: saveBoardConfig, onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-boards'] }); setOpen(false); toast.success('Configuración guardada') }, onError: (e) => toast.error(getErrorMessage(e)) })
  return <Dialog open={open} onOpenChange={(value) => { if (mutation.isPending) return; if (value) setDraft(structuredClone(config)); setOpen(value) }}>
    <DialogTrigger asChild><Button variant="outline">Configurar juntas</Button></DialogTrigger>
    <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader><DialogTitle>Configuración de juntas</DialogTitle><DialogDescription>Los períodos, materias y reglas de notas se toman de la configuración académica. Los documentos ya emitidos conservan su formato.</DialogDescription></DialogHeader>
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <div className="space-y-3 rounded-lg border p-4">
          <div><h3 className="font-medium">Secretaría de cada junta</h3><p className="text-xs text-muted-foreground">Puede ser un docente de otro paralelo. La persona asignada podrá preparar y enviar la convocatoria, pero no cerrar la junta.</p></div>
          {parallels.map((parallel) => <div key={parallel.id} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <Label htmlFor={`board-secretary-${parallel.id}`}>{parallel.name}</Label>
            <select id={`board-secretary-${parallel.id}`} className="w-full rounded-md border bg-background p-2 text-sm" value={draft.secretaries[parallel.id] ?? ''} onChange={(e) => {
              const secretaries = { ...draft.secretaries }
              if (e.target.value) secretaries[parallel.id] = e.target.value
              else delete secretaries[parallel.id]
              setDraft({ ...draft, secretaries })
            }}><option value="">Sin secretario asignado</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select>
          </div>)}
          {!parallels.length && <p className="text-sm text-muted-foreground">No hay paralelos en el año seleccionado.</p>}
        </div>
        {(['title', 'situationLabel', 'actionsLabel', 'recommendationsLabel'] as const).map((key, i) => <div key={key} className="space-y-1"><Label htmlFor={`board-config-${key}`}>{['Nombre del módulo/documento', 'Primer campo del informe', 'Segundo campo del informe', 'Tercer campo del informe'][i]}</Label><Input id={`board-config-${key}`} value={draft[key]} maxLength={key === 'title' ? 120 : 100} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>)}
        <div className="space-y-1"><Label htmlFor="board-config-background">Antecedentes predeterminados de la convocatoria</Label><Textarea id="board-config-background" rows={4} maxLength={4000} value={draft.convocationBackground} onChange={(e) => setDraft({ ...draft, convocationBackground: e.target.value })} /><p className="text-xs text-muted-foreground">Se precargan en las convocatorias nuevas y en las abiertas sin antecedentes. Puedes editarlos en cada convocatoria.</p></div>
        <div className="grid grid-cols-2 gap-3">{(['headerBackground', 'tableHeaderBackground', 'textColor', 'borderColor'] as const).map((key, i) => <div key={key} className="space-y-1"><Label htmlFor={`board-config-${key}`}>{['Encabezados y secciones', 'Cabecera de tablas', 'Texto', 'Bordes'][i]}</Label><Input id={`board-config-${key}`} type="color" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>)}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.watermarkEnabled} onChange={(e) => setDraft({ ...draft, watermarkEnabled: e.target.checked })} />Usar el logo institucional como marca de agua</label>
        {draft.watermarkEnabled && <div className="space-y-1"><Label htmlFor="board-config-watermark">Opacidad de la marca de agua: {Math.round(draft.watermarkOpacity * 100)} %</Label><input id="board-config-watermark" className="w-full" type="range" min={0} max={15} step={1} value={Math.round(draft.watermarkOpacity * 100)} onChange={(e) => setDraft({ ...draft, watermarkOpacity: Number(e.target.value) / 100 })} /><p className="text-xs text-muted-foreground">Por defecto 5 %, para mantenerla tenue al imprimir.</p></div>}
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
