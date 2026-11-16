import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { getErrorMessage } from '@/shared/lib/utils'
import { openProtectedFile } from '@/shared/lib/protected-file'
import { saveMeeting, meetingPdf, type BoardData, type MeetingDetails } from '../api/course-boards.api'

export function BoardMeetingForm({ board, disabled, onDirtyChange }: { board: BoardData; disabled: boolean; onDirtyChange: (dirty: boolean) => void }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState(board.meeting)
  const [expanded, setExpanded] = useState(!board.meeting.meetingDate)
  const saved = JSON.stringify(board.meeting)
  useEffect(() => { setDraft(board.meeting) }, [board.id, saved])
  const dirty = JSON.stringify(draft) !== saved
  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  const fail = (e: unknown) => toast.error(getErrorMessage(e))
  const save = useMutation({ mutationFn: () => saveMeeting(board.id, draft, board.revision), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['course-boards'] }); toast.success('Datos de la reunión guardados'); setExpanded(false) }, onError: fail })
  const pdf = useMutation({ mutationFn: (kind: 'CALL' | 'ATTENDANCE' | 'MINUTES') => meetingPdf(board.id, kind), onSuccess: ({ id }) => {
    qc.invalidateQueries({ queryKey: ['course-boards'] })
    openProtectedFile(`course-board-evidence/${id}`, 'documento-junta.pdf', { download: true }).catch(() => toast.error('El PDF está guardado en las evidencias de la junta'))
  }, onError: fail })
  const busy = disabled || save.isPending || pdf.isPending
  const set = (key: keyof Omit<MeetingDetails, 'participants'>, value: string) => setDraft({ ...draft, [key]: value })
  function field(key: keyof Omit<MeetingDetails, 'participants'>, label: string, type = 'text', maxLength = 200) {
    return <div className="space-y-1" key={key}><Label htmlFor={`meeting-${key}`}>{label}</Label><Input id={`meeting-${key}`} type={type} value={draft[key]} maxLength={maxLength} onChange={(e) => set(key, e.target.value)} /></div>
  }
  function person(index: number, values: Partial<MeetingDetails['participants'][number]>) { setDraft({ ...draft, participants: draft.participants.map((p, i) => i === index ? { ...p, ...values } : p) }) }
  return <section className="space-y-3 rounded-md border p-4">
    <details open={expanded} onToggle={(e) => setExpanded(e.currentTarget.open)}>
      <summary className="cursor-pointer font-semibold">Datos de la reunión · {board.matrix.parallelName}{draft.shift ? ` · ${draft.shift}` : ''}</summary>
      <p className="my-3 text-sm text-muted-foreground">Una sola ficha completa los encabezados de convocatoria, asistencia y acta. Las firmas quedan en blanco para el papel.</p>
      <fieldset disabled={!board.canEditMeeting || busy} className="min-w-0 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {field('number', 'Número de junta', 'text', 30)}
          <div className="space-y-1"><Label htmlFor="meeting-shift">Jornada</Label><Input id="meeting-shift" list="meeting-shifts" value={draft.shift} maxLength={80} onChange={(e) => set('shift', e.target.value)} /><datalist id="meeting-shifts"><option value="Matutina" /><option value="Vespertina" /><option value="Nocturna" /></datalist></div>
          {field('location', 'Lugar')}{field('invitationDate', 'Fecha de convocatoria', 'date')}{field('meetingDate', 'Fecha de reunión', 'date')}
          {field('responsible', 'Responsable de la convocatoria')}{field('startTime', 'Hora de inicio', 'time')}{field('scheduledEndTime', 'Finalización prevista', 'time')}
        </div>
        <details><summary className="cursor-pointer text-sm">Contacto y antecedentes (opcional)</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">{field('phone', 'Teléfono / extensión', 'text', 100)}{field('email', 'Correo electrónico', 'email')}</div><div className="mt-3 space-y-1"><Label htmlFor="meeting-background">Antecedentes de la convocatoria</Label><Textarea id="meeting-background" value={draft.background} maxLength={4000} onChange={(e) => set('background', e.target.value)} /></div></details>
        <div className="space-y-1"><Label htmlFor="meeting-agenda">Orden del día</Label><Textarea id="meeting-agenda" rows={4} value={draft.agenda} maxLength={6000} onChange={(e) => set('agenda', e.target.value)} /></div>
        <div className="space-y-2"><Label>Convocados y asistencia</Label><p className="text-xs text-muted-foreground">Puedes agregar invitados y escribir funciones como Tutor/a o Secretario/a. Registra la asistencia real cuando corresponda.</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-sm"><thead><tr><th className="p-2 text-left">Nombres</th><th className="p-2 text-left">Cargo / función</th><th className="p-2 text-left">Asistencia</th><th /></tr></thead><tbody>{draft.participants.map((p, i) => <tr key={i}><td className="p-1"><Input aria-label={`Nombre del convocado ${i + 1}`} value={p.name} maxLength={200} onChange={(e) => person(i, { name: e.target.value })} /></td><td className="p-1"><Input aria-label={`Función del convocado ${i + 1}`} value={p.role} maxLength={200} onChange={(e) => person(i, { role: e.target.value })} /></td><td className="p-1"><select aria-label={`Asistencia del convocado ${i + 1}`} className="rounded-md border bg-background p-2" value={p.attendance} onChange={(e) => person(i, { attendance: e.target.value as typeof p.attendance })}><option value="pending">Sin registrar</option><option value="present">Asistió</option><option value="absent">No asistió</option></select></td><td className="p-1"><Button type="button" variant="ghost" size="sm" aria-label={`Quitar convocado ${i + 1}`} onClick={() => setDraft({ ...draft, participants: draft.participants.filter((_, index) => index !== i) })}>Quitar</Button></td></tr>)}</tbody></table></div>
          <Button variant="outline" disabled={draft.participants.length >= 100} onClick={() => setDraft({ ...draft, participants: [...draft.participants, { name: '', role: '', attendance: 'pending' }] })}>Agregar convocado</Button>
        </div>
        <div className="space-y-1"><Label htmlFor="meeting-development">Desarrollo de los puntos tratados</Label><Textarea id="meeting-development" rows={5} value={draft.development} maxLength={12000} onChange={(e) => set('development', e.target.value)} placeholder="Registra lo tratado en cada punto, incluida la constatación del quórum." /></div>
        <div className="max-w-xs">{field('actualEndTime', 'Hora real de finalización (para el acta)', 'time')}</div>
        {board.canEditMeeting && <Button disabled={!dirty || busy} onClick={() => save.mutate()}>{save.isPending ? 'Guardando...' : 'Guardar datos de la reunión'}</Button>}
      </fieldset>
    </details>
    {dirty && <p className="text-sm text-amber-700">Guarda los datos de la reunión antes de generar documentos o cerrar la junta.</p>}
    <div className="flex flex-wrap gap-2">{(['CALL', 'ATTENDANCE', 'MINUTES'] as const).map((kind, i) => <Button key={kind} variant="outline" disabled={busy || dirty || (kind === 'MINUTES' && board.status !== 'CLOSED') || (board.status === 'CLOSED' && !board.evidence.some((f) => f.kind === kind))} onClick={() => pdf.mutate(kind)}>{['Convocatoria PDF', 'Asistencia PDF', 'Acta y consolidado PDF'][i]}</Button>)}</div>
    {board.status !== 'CLOSED' && <p className="text-xs text-muted-foreground">El acta definitiva se genera al cerrar la junta. Los tres documentos se guardan en sus evidencias.</p>}
  </section>
}
