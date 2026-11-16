import { forwardRef, useEffect, useImperativeHandle, useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { TabsContent } from '@/shared/components/ui/tabs'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { getErrorMessage } from '@/shared/lib/utils'
import { openProtectedFile } from '@/shared/lib/protected-file'
import { saveMeeting, meetingPdf, previewInvitation, publishInvitation, type InvitationPreview, type BoardData, type MeetingDetails } from '../api/course-boards.api'

export interface BoardMeetingHandle { saveIfNeeded: () => Promise<number> }

export const BoardMeetingForm = forwardRef<BoardMeetingHandle, { board: BoardData; disabled: boolean; onBusyChange: (busy: boolean) => void; children: ReactNode }>(function BoardMeetingForm({ board, disabled, onBusyChange, children }, ref) {
  const qc = useQueryClient()
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [draft, setDraft] = useState(board.meeting)
  const saved = JSON.stringify(board.meeting)
  useEffect(() => { setDraft(board.meeting) }, [board.id, saved])
  const dirty = JSON.stringify(draft) !== saved
  const fail = (e: unknown) => toast.error(getErrorMessage(e))
  async function persist() {
    if (!dirty) return board.revision
    const result = await saveMeeting(board.id, draft, board.revision)
    setDraft(result.meeting)
    // Actualiza la ficha sin sustituir las notas que la persona está revisando.
    qc.setQueryData<BoardData>(['course-boards', 'detail', board.id], (previous) => previous ? { ...previous, meeting: result.meeting, revision: result.revision } : previous)
    return result.revision
  }
  useImperativeHandle(ref, () => ({ saveIfNeeded: persist }))
  const save = useMutation({ mutationFn: persist, onSuccess: () => { toast.success('Borrador guardado') }, onError: fail })
  const pdf = useMutation({ mutationFn: async (kind: 'CALL' | 'ATTENDANCE') => { await persist(); return meetingPdf(board.id, kind) }, onSuccess: ({ id }) => {
    qc.invalidateQueries({ queryKey: ['course-boards'] })
    openProtectedFile(`course-board-evidence/${id}`, 'documento-junta.pdf', { download: true }).catch(() => toast.error('El PDF está guardado en las evidencias de la junta'))
  }, onError: fail })
  const preview = useMutation({ mutationFn: async () => { await persist(); return previewInvitation(board.id) }, onSuccess: setInvitation, onError: fail })
  const publish = useMutation({ mutationFn: () => publishInvitation(board.id, invitation!.revision), onSuccess: () => {
    setInvitation(null); qc.invalidateQueries({ queryKey: ['course-boards'] }); toast.success('Convocatoria publicada en Avisos')
  }, onError: fail })
  const pending = save.isPending || pdf.isPending || preview.isPending || publish.isPending
  useEffect(() => { onBusyChange(pending) }, [pending, onBusyChange])
  const busy = disabled || pending
  const set = (key: keyof Omit<MeetingDetails, 'participants'>, value: string) => setDraft({ ...draft, [key]: value })
  function field(key: keyof Omit<MeetingDetails, 'participants'>, label: string, type = 'text', maxLength = 200) {
    return <div className="space-y-1" key={key}><Label htmlFor={`meeting-${key}`}>{label}</Label><Input id={`meeting-${key}`} type={type} value={draft[key]} maxLength={maxLength} onChange={(e) => set(key, e.target.value)} /></div>
  }
  function person(index: number, values: Partial<MeetingDetails['participants'][number]>) { setDraft({ ...draft, participants: draft.participants.map((p, i) => i === index ? { ...p, ...values } : p) }) }
  const saveDraft = board.canEditMeeting && dirty && <Button variant="outline" disabled={busy} onClick={() => save.mutate()}>{save.isPending ? 'Guardando...' : 'Guardar borrador'}</Button>
  return <>
    <TabsContent value="invitation" forceMount className="space-y-3 data-[state=inactive]:hidden">
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-semibold">Convocatoria · {board.matrix.parallelName}</h2>
      <p className="my-3 text-sm text-muted-foreground">Una sola ficha completa los encabezados de convocatoria, asistencia y acta. Las firmas quedan en blanco para el papel.</p>
      <fieldset disabled={!board.canEditMeeting || busy} className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('number', 'Número de junta', 'text', 30)}
          <div className="space-y-1"><Label htmlFor="meeting-shift">Jornada</Label><Input id="meeting-shift" list="meeting-shifts" value={draft.shift} maxLength={80} onChange={(e) => set('shift', e.target.value)} /><datalist id="meeting-shifts"><option value="Matutina" /><option value="Vespertina" /><option value="Nocturna" /></datalist></div>
          {field('location', 'Lugar')}{field('invitationDate', 'Fecha de convocatoria', 'date')}{field('meetingDate', 'Fecha de reunión', 'date')}
          {field('responsible', 'Responsable de la convocatoria')}{field('startTime', 'Hora de inicio', 'time')}{field('scheduledEndTime', 'Finalización prevista', 'time')}
        </div>
        <details><summary className="cursor-pointer text-sm">Contacto (opcional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{field('phone', 'Teléfono / extensión', 'text', 100)}{field('email', 'Correo electrónico', 'email')}</div></details><div className="space-y-1"><Label htmlFor="meeting-background">Antecedentes de la convocatoria</Label><Textarea id="meeting-background" value={draft.background} maxLength={4000} onChange={(e) => set('background', e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="meeting-agenda">Orden del día</Label><Textarea id="meeting-agenda" rows={4} value={draft.agenda} maxLength={6000} onChange={(e) => set('agenda', e.target.value)} /></div>

      </fieldset>
    <fieldset disabled={!board.canEditMeeting || busy} className="min-w-0 space-y-4">
        <div className="space-y-2"><Label>Convocados</Label><p className="text-xs text-muted-foreground">El tutor y los docentes del curso aparecen al crear la convocatoria. Puedes agregar otros invitados.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr><th className="p-2 text-left">Nombres</th><th className="p-2 text-left">Cargo / función</th><th /></tr></thead><tbody>{draft.participants.map((p, i) => <tr key={i}><td className="p-1"><Input aria-label={`Nombre del convocado ${i + 1}`} value={p.name} maxLength={200} onChange={(e) => person(i, { name: e.target.value, userId: undefined })} /></td><td className="p-1"><Input aria-label={`Función del convocado ${i + 1}`} value={p.role} maxLength={200} onChange={(e) => person(i, { role: e.target.value })} /></td><td className="p-1"><Button type="button" variant="ghost" size="sm" aria-label={`Quitar convocado ${i + 1}`} onClick={() => setDraft({ ...draft, participants: draft.participants.filter((_, index) => index !== i) })}>Quitar</Button></td></tr>)}</tbody></table></div>
          <Button variant="outline" disabled={draft.participants.length >= 100} onClick={() => setDraft({ ...draft, participants: [...draft.participants, { name: '', role: '', attendance: 'pending' }] })}>Agregar convocado</Button>
        </div>
    </fieldset>
    {dirty && <p className="text-sm text-muted-foreground">Los cambios se guardan al publicar, descargar un documento o cerrar la junta.</p>}
    {saveDraft}
    <div className="flex flex-wrap gap-2">
      {board.canEditMeeting && <Button disabled={busy} onClick={() => preview.mutate()}>{preview.isPending ? 'Preparando...' : board.invitation ? 'Revisar convocatoria en Avisos' : 'Publicar en Avisos'}</Button>}
      {board.invitation && <Button variant="outline" asChild><Link to={`/announcements?notice=${board.invitation.id}`}>Ver aviso publicado</Link></Button>}
    </div>
    <Dialog open={!!invitation} onOpenChange={(open) => { if (!open && !publish.isPending) setInvitation(null) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Convocatoria en Avisos</DialogTitle></DialogHeader>
        {invitation && <div className="space-y-4">
          <h3 className="font-semibold">{invitation.title}</h3><p className="whitespace-pre-line text-sm">{invitation.body}</p>
          <div><p className="font-medium">Destinatarios ({invitation.recipients.length})</p><p className="text-sm">{invitation.recipients.map((p) => p.name).join(', ')}</p></div>
          {!!invitation.unlinked.length && <p className="text-sm">Sin cuenta vinculada: {invitation.unlinked.join(', ')}. Entrégales la convocatoria en PDF.</p>}
          <p className="text-sm text-muted-foreground">Se adjunta el PDF y se guarda una copia en las evidencias. Confirmar la invitación no registra asistencia real.</p>
          {invitation.alreadyPublished ? <Button asChild><Link to={`/announcements?notice=${invitation.noticeId}`}>Ver convocatoria publicada</Link></Button> : <>
            {invitation.updating && <p className="text-sm">Se actualizará el mismo aviso. Los convocados deberán confirmar nuevamente los datos actualizados.</p>}
            <Button disabled={publish.isPending} onClick={() => publish.mutate()}>{publish.isPending ? 'Publicando...' : invitation.updating ? 'Actualizar convocatoria' : 'Publicar convocatoria'}</Button>
          </>}
        </div>}
      </DialogContent>
    </Dialog>
    <Button variant="outline" disabled={busy || (board.status === 'CLOSED' && !board.evidence.some((f) => f.kind === 'CALL'))} onClick={() => pdf.mutate('CALL')}>Descargar convocatoria</Button>
    </section>
    </TabsContent>
    <TabsContent value="meeting" forceMount className="space-y-4 data-[state=inactive]:hidden">
      <section className="space-y-4 rounded-md border p-4">
        <h2 className="font-semibold">Asistencia y desarrollo de la junta</h2>
        <p className="text-sm text-muted-foreground">Registra quién asistió realmente, lo tratado y la hora de finalización.</p>
        <fieldset disabled={!board.canEditMeeting || busy} className="space-y-4">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Convocado</th><th className="p-2 text-left">Asistencia real</th></tr></thead><tbody>{draft.participants.map((p, i) => <tr key={i}><td className="p-2">{p.name}<span className="ml-2 text-muted-foreground">{p.role}</span></td><td className="p-2"><select aria-label={`Asistencia del convocado ${i + 1}`} className="rounded-md border bg-background p-2" value={p.attendance} onChange={(e) => person(i, { attendance: e.target.value as typeof p.attendance })}><option value="pending">Sin registrar</option><option value="present">Asistió</option><option value="absent">No asistió</option></select></td></tr>)}</tbody></table></div>
        <div className="space-y-1"><Label htmlFor="meeting-development">Desarrollo de los puntos tratados</Label><Textarea id="meeting-development" rows={5} value={draft.development} maxLength={12000} onChange={(e) => set('development', e.target.value)} placeholder="Registra lo tratado en cada punto, incluida la constatación del quórum." /></div>
        <div className="max-w-xs">{field('actualEndTime', 'Hora real de finalización (para el acta)', 'time')}</div>
        </fieldset>
        {saveDraft}
        <Button variant="outline" disabled={busy || (board.status === 'CLOSED' && !board.evidence.some((f) => f.kind === 'ATTENDANCE'))} onClick={() => pdf.mutate('ATTENDANCE')}>Descargar asistencia</Button>
      </section>
      {children}
    </TabsContent>
  </>
})
