import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { getErrorMessage } from '@/shared/lib/utils'
import { useActaTemplate } from '@/features/settings/hooks/useActaTemplate'
import { createCommitment, type CommitmentDetails, type Incident } from '../api/incidents.api'

const emptyDetails = (): CommitmentDetails => ({ participants: [], agreements: [] })
const textareaClass = 'w-full rounded-md border border-input bg-transparent p-2 text-sm'

export function CommitmentForm({ incident, onCreated }: { incident: Incident; onCreated: () => void }) {
  const template = useActaTemplate()
  const [details, setDetails] = useState<CommitmentDetails>(emptyDetails)
  const [terms, setTerms] = useState('')
  const [followUpDate, setFollowUpDate] = useState('')
  const patch = (value: Partial<CommitmentDetails>) => setDetails((current) => ({ ...current, ...value }))
  const includeTimeline = details.includeTimeline ?? template.data?.includeTimeline ?? true
  const includeEvidenceList = details.includeEvidenceList ?? template.data?.includeEvidenceList ?? true
  const valid = (terms.trim() || details.agreements.length > 0)
    && details.agreements.every((a) => a.action.trim() && a.responsible.trim())
    && details.participants.every((p) => p.name.trim() && p.role.trim())
  const create = useMutation({
    mutationFn: () => createCommitment(incident.id, {
      terms, followUpDate: followUpDate || undefined,
      document: { ...details, includeTimeline, includeEvidenceList },
    }),
    onSuccess: () => {
      toast.success('Acta creada con el detalle del expediente')
      setDetails(emptyDetails()); setTerms(''); setFollowUpDate(''); onCreated()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const participant = (index: number, value: Partial<CommitmentDetails['participants'][number]>) =>
    patch({ participants: details.participants.map((row, i) => i === index ? { ...row, ...value } : row) })
  const agreement = (index: number, value: Partial<CommitmentDetails['agreements'][number]>) =>
    patch({ agreements: details.agreements.map((row, i) => i === index ? { ...row, ...value } : row) })

  return (
    <form className="space-y-4 border-t pt-4" onSubmit={(event) => { event.preventDefault(); if (valid && template.data && !create.isPending) create.mutate() }}>
      <h3 className="font-semibold">Nueva acta de compromiso</h3>
      <p className="text-xs text-muted-foreground">Se conservarán los datos del caso, la descripción del incidente y las actuaciones seleccionadas tal como están al crear el acta.</p>
      {template.isError && <Button type="button" variant="outline" onClick={() => template.refetch()}>Reintentar carga de plantilla</Button>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="meeting-date">Fecha de la reunión</Label><Input id="meeting-date" type="date" value={details.meetingDate ?? ''} onChange={(e) => patch({ meetingDate: e.target.value || undefined })} /></div>
        <div className="space-y-1"><Label htmlFor="meeting-place">Lugar de la reunión</Label><Input id="meeting-place" maxLength={250} value={details.meetingPlace ?? ''} onChange={(e) => patch({ meetingPlace: e.target.value })} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="meeting-purpose">Objetivo de la reunión</Label><textarea id="meeting-purpose" className={textareaClass} rows={2} maxLength={3000} value={details.purpose ?? ''} onChange={(e) => patch({ purpose: e.target.value })} /></div>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Participantes y firmas</legend>
        <p className="text-xs text-muted-foreground">Registra a quienes participaron. Sin participantes se usarán los espacios de firma de la plantilla institucional.</p>
        {details.participants.map((row, index) => (
          <div key={index} className="space-y-2 rounded-md bg-muted/40 p-3">
            <Input aria-label={`Nombre del participante ${index + 1}`} required maxLength={150} placeholder="Nombre completo" value={row.name} onChange={(e) => participant(index, { name: e.target.value })} />
            <div className="grid gap-2 sm:grid-cols-2"><Input aria-label={`Rol del participante ${index + 1}`} required maxLength={100} placeholder="Rol: estudiante, representante, DECE…" value={row.role} onChange={(e) => participant(index, { role: e.target.value })} /><Input aria-label={`Identificación del participante ${index + 1}`} maxLength={20} placeholder="Identificación (opcional)" value={row.dni ?? ''} onChange={(e) => participant(index, { dni: e.target.value })} /></div>
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ participants: details.participants.filter((_, i) => i !== index) })}>Quitar participante {index + 1}</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={details.participants.length >= 20} onClick={() => patch({ participants: [...details.participants, { name: '', role: '' }] })}>Agregar participante</Button>
      </fieldset>

      <fieldset className="space-y-3 rounded-md border p-3">
        <legend className="px-1 text-sm font-medium">Acuerdos y compromisos</legend>
        {details.agreements.map((row, index) => (
          <div key={index} className="space-y-2 rounded-md bg-muted/40 p-3">
            <Label htmlFor={`agreement-${index}`}>Acuerdo {index + 1} · acción a realizar</Label>
            <textarea id={`agreement-${index}`} className={textareaClass} rows={3} required maxLength={4000} value={row.action} onChange={(e) => agreement(index, { action: e.target.value })} />
            <Input aria-label={`Responsable del acuerdo ${index + 1}`} required maxLength={150} placeholder="Responsable del cumplimiento" value={row.responsible} onChange={(e) => agreement(index, { responsible: e.target.value })} />
            <div className="space-y-1"><Label htmlFor={`deadline-${index}`}>Plazo de cumplimiento</Label><Input id={`deadline-${index}`} type="date" value={row.dueDate ?? ''} onChange={(e) => agreement(index, { dueDate: e.target.value || undefined })} /></div>
            <textarea aria-label={`Verificación del acuerdo ${index + 1}`} className={textareaClass} rows={2} maxLength={2000} placeholder="¿Cómo se verificará el cumplimiento?" value={row.verification ?? ''} onChange={(e) => agreement(index, { verification: e.target.value })} />
            <Button type="button" variant="ghost" size="sm" onClick={() => patch({ agreements: details.agreements.filter((_, i) => i !== index) })}>Quitar acuerdo {index + 1}</Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" disabled={details.agreements.length >= 30} onClick={() => patch({ agreements: [...details.agreements, { action: '', responsible: '' }] })}>Agregar acuerdo detallado</Button>
        <div className="space-y-1"><Label htmlFor="acta-terms">Compromisos generales / texto adicional</Label><textarea id="acta-terms" className={textareaClass} rows={3} maxLength={20000} placeholder="Registra acuerdos detallados o escribe los compromisos en este campo." value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
      </fieldset>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeTimeline} onChange={(e) => patch({ includeTimeline: e.target.checked })} />Incluir bitácora del proceso</label>
        {includeTimeline && <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-3">
          {(incident.events ?? []).map((event) => (
            <label key={event.id} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={details.timelineEventIds?.includes(event.id) ?? true} onChange={(e) => {
              const selected = new Set(details.timelineEventIds ?? incident.events?.map((item) => item.id))
              if (e.target.checked) selected.add(event.id); else selected.delete(event.id)
              patch({ timelineEventIds: [...selected] })
            }} /><span>{event.description || 'Actuación registrada'}<span className="block text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString('es-EC')} · {event.actor?.profile?.firstName} {event.actor?.profile?.lastName}</span></span></label>
          ))}
          {!incident.events?.length && <p className="text-xs text-muted-foreground">Todavía no hay actuaciones registradas.</p>}
        </div>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeEvidenceList} onChange={(e) => patch({ includeEvidenceList: e.target.checked })} />Incluir relación de evidencias ({incident.attachments?.length ?? 0})</label>
        <p className="text-xs text-muted-foreground">El PDF listará los archivos de evidencia; los archivos se consultan desde el expediente.</p>
      </div>
      <div className="space-y-1"><Label htmlFor="acta-observations">Observaciones de la reunión</Label><textarea id="acta-observations" className={textareaClass} rows={3} maxLength={10000} value={details.observations ?? ''} onChange={(e) => patch({ observations: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="acta-follow-up">Fecha de seguimiento</Label><Input id="acta-follow-up" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} /></div>
      <p className="text-xs text-muted-foreground">Registra al menos un acuerdo detallado con responsable o un compromiso general para crear el acta.</p>
      <Button type="submit" disabled={!valid || !template.data} loading={create.isPending}>Crear acta detallada</Button>
    </form>
  )
}
