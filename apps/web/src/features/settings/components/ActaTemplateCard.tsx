import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import { actaTemplateApi, type ActaTemplate } from '../api/acta-template.api'
import { useActaTemplate } from '../hooks/useActaTemplate'

export function ActaTemplateCard() {
  const query = useActaTemplate()
  const [template, setTemplate] = useState<ActaTemplate | null>(null)
  const qc = useQueryClient()
  useEffect(() => { if (query.data) setTemplate(structuredClone(query.data)) }, [query.data])
  const save = useMutation({
    mutationFn: actaTemplateApi.save,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['acta-template'] }); toast.success('Plantilla de actas guardada') },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const preview = useMutation({ mutationFn: actaTemplateApi.preview, onError: (error) => toast.error(getErrorMessage(error)) })
  if (!template) return <Card><CardContent className="pt-6">{query.isError ? <Button variant="outline" onClick={() => query.refetch()}>Reintentar carga de plantilla de actas</Button> : 'Cargando plantilla de actas…'}</CardContent></Card>
  const patch = (value: Partial<ActaTemplate>) => setTemplate({ ...template, ...value })
  const valid = !!template.title.trim() && template.signatureLabels.length > 0 && template.signatureLabels.length <= 12 && template.signatureLabels.every((value) => value.trim())
  return (
    <Card>
      <CardHeader>
        <CardTitle>Actas de compromiso</CardTitle>
        <CardDescription>Personaliza el PDF de las nuevas actas. Las nuevas actas conservarán los textos y datos guardados al crearlas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="acta-title">Título del acta</Label><Input id="acta-title" maxLength={150} value={template.title} onChange={(e) => patch({ title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="acta-subtitle">Subtítulo</Label><Input id="acta-subtitle" maxLength={250} value={template.subtitle} onChange={(e) => patch({ subtitle: e.target.value })} /></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="acta-introduction">Texto de apertura</Label><textarea id="acta-introduction" rows={3} maxLength={4000} className="w-full rounded-md border p-2 text-sm" value={template.introduction} onChange={(e) => patch({ introduction: e.target.value })} /></div>
        <div className="space-y-1.5"><Label htmlFor="acta-closing">Texto de cierre y seguimiento</Label><textarea id="acta-closing" rows={3} maxLength={4000} className="w-full rounded-md border p-2 text-sm" value={template.closing} onChange={(e) => patch({ closing: e.target.value })} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="acta-color">Color de títulos</Label><Input id="acta-color" type="color" className="w-24" value={template.accentColor} onChange={(e) => patch({ accentColor: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="acta-signatures">Firmas por defecto · una por línea</Label><textarea id="acta-signatures" rows={3} className="w-full rounded-md border p-2 text-sm" value={template.signatureLabels.join('\n')} onChange={(e) => patch({ signatureLabels: e.target.value.split('\n') })} /><p className="text-xs text-muted-foreground">Si el acta registra participantes, se usarán sus nombres y roles en las firmas.</p></div>
        </div>
        <div className="space-y-2 text-sm">
          {([['includeTimeline', 'Incluir bitácora por defecto'], ['includeEvidenceList', 'Incluir relación de evidencias por defecto'], ['showWatermark', 'Usar el logotipo como marca de agua']] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={template[key]} onChange={(e) => patch({ [key]: e.target.checked })} />{label}</label>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={!valid} loading={preview.isPending} onClick={() => preview.mutate({ ...template, signatureLabels: template.signatureLabels.map((value) => value.trim()) })}>Descargar vista previa</Button>
          <Button disabled={!valid} loading={save.isPending} onClick={() => save.mutate({ ...template, signatureLabels: template.signatureLabels.map((value) => value.trim()) })}>Guardar plantilla de actas</Button>
        </div>
      </CardContent>
    </Card>
  )
}
