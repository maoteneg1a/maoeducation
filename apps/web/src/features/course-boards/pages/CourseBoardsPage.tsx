import { BoardMeetingForm, type BoardMeetingHandle } from '../components/BoardMeetingForm'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Badge } from '@/shared/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { normalizeStudentSearch } from '@/shared/lib/student-options'
import { openProtectedFile } from '@/shared/lib/protected-file'
import { useAuthStore } from '@/store/auth.store'
import * as api from '../api/course-boards.api'
import { BoardReportDialog } from '../components/BoardReportDialog'

function useOptions(yearId?: string) { return useQuery({ queryKey: ['course-boards', 'options', yearId], queryFn: () => api.getBoardOptions(yearId) }) }
const date = (value: string) => new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
function download(id: string, name: string) { return openProtectedFile(`course-board-evidence/${id}`, name, { download: true }).catch(() => toast.error('El documento quedó guardado. Descárgalo desde las evidencias de la junta')) }

export function CourseBoardsPage() {
  const [yearId, setYearId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const [showAll, setShowAll] = useState(false)
  const { data, isLoading, error } = useOptions(yearId || undefined)
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.user?.id)
  const currentPeriodId = periodId || data?.periods.find((p) => p.isActive)?.id || data?.periods[0]?.id || ''
  const open = useMutation({ mutationFn: (parallelId: string) => api.createBoard(parallelId, currentPeriodId), onSuccess: ({ id }) => navigate(`/course-boards/${id}`), onError: (e) => toast.error(getErrorMessage(e)) })
  if (isLoading) return <PageLoader />
  if (!data) return <p className="p-6 text-destructive">{getErrorMessage(error)}</p>
  const parallels = data.parallels.filter((p) => {
    const board = p.boards.find((item) => item.academicPeriodId === currentPeriodId)
    if (data.canConfigure) return showAll || !!board
    return p.secretaryId === userId || !!board && (p.participant || board.chairId === userId)
  })
  return <div className="space-y-5 p-4 sm:p-6">
    <div><h1 className="text-2xl font-bold">Juntas de curso</h1><p className="text-sm text-muted-foreground">Crea la convocatoria, realiza la junta y conserva sus documentos.</p></div>
    <div className="flex flex-wrap gap-3">
      <div className="space-y-1"><Label htmlFor="board-year">Año lectivo</Label><select id="board-year" className="block rounded-md border bg-background p-2" value={yearId || data.yearId} onChange={(e) => { setYearId(e.target.value); setPeriodId('') }}>{data.years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="board-period">Período</Label><select id="board-period" className="block rounded-md border bg-background p-2" value={currentPeriodId} onChange={(e) => setPeriodId(e.target.value)}>{data.periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
      {data.canConfigure && <div className="flex items-end"><Button variant="outline" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Ver solo juntas creadas' : `Mostrar todos los paralelos (${data.parallels.length})`}</Button></div>}
    </div>
    {!!parallels.length && <div className="overflow-hidden rounded-lg border">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_10rem_12rem] gap-4 bg-muted/60 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
        <span>Paralelo</span><span>Secretaría</span><span>Estado</span><span className="text-right">Acción</span>
      </div>
      {parallels.map((p) => {
        const board = p.boards.find((b) => b.academicPeriodId === currentPeriodId)
        const secretary = data.secretaryCandidates.find((candidate) => candidate.id === p.secretaryId)
        const canCreate = p.secretaryId === userId
        return <div key={p.id} className="grid gap-3 border-t px-4 py-3 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_10rem_12rem] md:items-center md:gap-4">
          <div><span className="text-xs text-muted-foreground md:hidden">Paralelo</span><h2 className="font-semibold">{p.name}</h2></div>
          <div><span className="text-xs text-muted-foreground md:hidden">Secretaría</span><p className="text-sm">{secretary?.name ?? 'Sin asignar'}</p></div>
          <div><Badge variant={board?.status === 'CLOSED' ? 'success' : 'secondary'}>{board?.status === 'CLOSED' ? 'Cerrada' : board ? 'Abierta' : 'Sin convocatoria'}</Badge></div>
          <div className="md:text-right">{board
            ? <Button className="w-full md:w-auto" variant="outline" onClick={() => navigate(`/course-boards/${board.id}`)}>Abrir junta</Button>
            : canCreate
              ? <Button className="w-full md:w-auto" variant="outline" disabled={open.isPending || !currentPeriodId} onClick={() => open.mutate(p.id)}>Crear convocatoria</Button>
              : <Button className="w-full md:w-auto" variant="outline" disabled>Solo secretaría</Button>}
          </div>
        </div>
      })}
    </div>}
    {!parallels.length && <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">{data.canConfigure ? 'Todavía no hay juntas creadas para este período. La asignación de secretarios está en Configuración → Juntas de curso.' : 'No tienes juntas asignadas para este período.'}</p>}
  </div>
}

export function CourseBoardDetailPage() {
  const { id = '' } = useParams()
  const qc = useQueryClient()
  const { data: board, isLoading, error } = useQuery({ queryKey: ['course-boards', 'detail', id], queryFn: () => api.getBoard(id), enabled: !!id })
  const { data: options } = useOptions(board?.yearId)
  const [search, setSearch] = useState('')
  const [conclusions, setConclusions] = useState('')
  const [signed, setSigned] = useState(false)
  const [meetingBusy, setMeetingBusy] = useState(false)
  const meetingForm = useRef<BoardMeetingHandle>(null)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (board) setConclusions(board.conclusions) }, [board?.id, board?.conclusions])
  const refresh = () => qc.invalidateQueries({ queryKey: ['course-boards'] })
  const fail = (e: unknown) => toast.error(getErrorMessage(e))
  const consolidated = useMutation({ mutationFn: () => api.consolidatedPdf(id), onSuccess: ({ id: fileId }) => { refresh(); download(fileId, 'consolidado.pdf') }, onError: fail })
  const close = useMutation({ mutationFn: async () => {
    const reviewedHash = board!.matrixHash
    const revision = await meetingForm.current?.saveIfNeeded() ?? board!.revision
    return api.closeBoard(id, conclusions, revision, reviewedHash)
  }, onSuccess: ({ id: fileId }) => { refresh(); toast.success('Junta cerrada; acta y consolidado guardados'); download(fileId, 'acta-junta.pdf') }, onError: fail })
  const reopen = useMutation({ mutationFn: () => api.reopenBoard(id), onSuccess: () => { refresh(); toast.success('Junta reabierta. Los documentos anteriores se conservan') }, onError: fail })
  const chair = useMutation({ mutationFn: (chairId: string) => api.setBoardChair(id, chairId), onSuccess: refresh, onError: fail })
  const upload = useMutation({ mutationFn: (file: File) => api.uploadBoardEvidence(id, file, signed), onSuccess: () => { refresh(); setSigned(false); toast.success('Evidencia guardada en la junta') }, onError: fail })
  if (isLoading) return <PageLoader />
  if (!board) return <div className="p-6"><Link to="/course-boards">Volver a juntas</Link><p className="text-destructive">{getErrorMessage(error)}</p></div>
  const m = board.matrix, cfg = m.config, closed = board.status === 'CLOSED'
  const terms = normalizeStudentSearch(search).split(/\s+/).filter(Boolean)
  const rows = m.rows.filter((r) => terms.every((term) => normalizeStudentSearch(`${r.name} ${r.dni ?? ''}`).includes(term)))
  const busy = consolidated.isPending || close.isPending || reopen.isPending || upload.isPending || chair.isPending || meetingBusy
  return <div className="space-y-5 p-4 sm:p-6">
    <Link className="text-sm text-primary underline" to="/course-boards">← Juntas de curso</Link>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">{m.parallelName} <Badge variant={closed ? 'success' : 'secondary'}>{closed ? 'Junta cerrada' : 'Junta abierta'}</Badge></h1><p className="text-sm text-muted-foreground">{m.yearName} · {m.periodName} · Tutor: {m.tutorName}</p><p className="text-sm text-muted-foreground">Dirige: {board.chairName}{board.secretaryName ? ` · Secretaría: ${board.secretaryName}` : ''}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => refresh()}>Actualizar</Button><Button variant="outline" disabled={busy} onClick={() => consolidated.mutate()}>{consolidated.isPending ? 'Generando...' : closed ? 'Descargar acta y consolidado' : 'Consolidado PDF'}</Button>{board.canReport && <BoardReportDialog board={board} />}</div></div>
    {closed && <p className="rounded-md border bg-muted/40 p-3 text-sm">Cerrada el {board.closedAt ? date(board.closedAt) : '—'}. Se muestra la copia revisada en la junta; las notas actuales pueden haber cambiado. Puedes adjuntar copias firmadas después del cierre.</p>}
    <div className="flex flex-wrap gap-4 rounded-md border p-3 text-sm"><span>Estudiantes: <strong>{m.rows.length}</strong></span><span>Materias: <strong>{m.subjects.length}</strong></span><span>Informes: <strong>{board.evidence.filter((f) => f.kind === 'REPORT').length}</strong></span><span>Sin nota: <strong>{m.rows.reduce((n, r) => n + r.grades.filter((g) => g.value === null).length, 0)}</strong></span></div>
    <Tabs defaultValue={board.invitation || closed ? 'consolidated' : 'invitation'}>
      <TabsList className="h-auto flex-wrap"><TabsTrigger value="invitation">Convocatoria</TabsTrigger><TabsTrigger value="consolidated">Consolidado</TabsTrigger><TabsTrigger value="meeting">Reunión y cierre</TabsTrigger><TabsTrigger value="evidence">Informes y evidencias</TabsTrigger></TabsList>
      <TabsContent value="consolidated" className="space-y-3">
        <Input aria-label="Buscar estudiante en el consolidado" placeholder="Buscar alumno por apellidos, nombres o cédula" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="max-h-[65vh] overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 z-20 bg-muted"><tr><th className="sticky left-0 z-30 min-w-56 bg-muted p-3 text-left">Apellidos y nombres</th>{m.subjects.map((s) => <th key={s.id} className="min-w-28 p-3" title={s.teacherName}>{s.name}</th>)}</tr></thead><tbody>{rows.map((r) => <tr className="border-t" key={r.id}><th className="sticky left-0 z-10 bg-background p-3 text-left font-medium">{r.name}</th>{r.grades.map((g) => <td className="p-3 text-center tabular-nums" key={g.assignmentId} title={g.partial ? 'Faltan componentes de la nota del período' : undefined}>{g.display}{g.partial && <span className="ml-1 text-amber-600">*</span>}</td>)}</tr>)}</tbody></table></div>
        <p className="text-xs text-muted-foreground">— Sin calificación registrada. * Faltan componentes de la nota del período. Datos {closed ? 'conservados al cierre' : 'actualizados al abrir o recargar la pantalla'}: {date(m.generatedAt)}.</p>
      </TabsContent>
      <BoardMeetingForm ref={meetingForm} key={board.id} board={board} disabled={busy} onBusyChange={setMeetingBusy}>
        <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm font-medium">Ver resumen de asistencia, incidencias y refuerzos del curso</summary>
        <div className="overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-left">Estudiante</th>{cfg.showAttendance && <><th className="p-3">Faltas</th><th className="p-3">Atrasos</th></>}{cfg.showIncidents && <th className="p-3">Incidencias</th>}{cfg.showReinforcement && <th className="p-3">Casos de refuerzo</th>}<th className="p-3 text-left">Comportamiento / observación</th></tr></thead><tbody>{m.rows.map((r) => <tr key={r.id} className="border-t"><td className="p-3">{r.name}</td>{cfg.showAttendance && <><td className="p-3 text-center">{r.absences}</td><td className="p-3 text-center">{r.late}</td></>}{cfg.showIncidents && <td className="p-3 text-center">{r.incidents}</td>}{cfg.showReinforcement && <td className="p-3 text-center">{r.reinforcement}</td>}<td className="max-w-md whitespace-pre-wrap p-3">{[r.behavior, r.observation].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></div>
        <p className="text-xs text-muted-foreground">La asistencia cuenta registros por materia o jornada, según el curso; no equivale necesariamente a días distintos. Las incidencias se muestran como cantidades, sin exponer expedientes confidenciales.</p>
        </details>
        {board.canAssignChair && !closed && options && <div className="max-w-md space-y-1"><Label htmlFor="board-chair">Persona que dirige la junta</Label><select id="board-chair" className="w-full rounded-md border bg-background p-2" value={board.chairId ?? ''} disabled={busy} onChange={(e) => chair.mutate(e.target.value)}><option value="" disabled>Seleccionar responsable</option>{options.chairs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
        <div className="space-y-2"><Label htmlFor="board-conclusions">Acuerdos y conclusiones</Label><Textarea id="board-conclusions" rows={5} maxLength={12000} value={conclusions} disabled={closed || !board.canDirect || busy} onChange={(e) => setConclusions(e.target.value)} placeholder="Registra lo acordado e indica responsables y fechas de seguimiento cuando corresponda." /></div>
        {board.canDirect && (closed ? <Button variant="outline" disabled={busy} onClick={() => reopen.mutate()}>{reopen.isPending ? 'Reabriendo...' : 'Reabrir junta'}</Button> : <div className="space-y-2"><p className="text-sm text-muted-foreground">Al cerrar se guardarán el consolidado y el acta de esta junta. Las calificaciones seguirán su proceso académico habitual.</p><Button disabled={busy || conclusions.trim().length < 5} onClick={() => close.mutate()}>{close.isPending ? 'Cerrando...' : 'Cerrar junta y generar acta'}</Button></div>)}
        {!board.canDirect && <p className="text-sm text-muted-foreground">El cierre lo realiza la persona designada para dirigir la junta o la autoridad.</p>}
      </BoardMeetingForm>
      <TabsContent value="evidence" className="space-y-4">
        <div className="space-y-3 rounded-md border p-4"><p className="text-sm">Carpeta de esta junta: <strong>{m.yearName} → {m.periodName} → {m.parallelName}</strong>. Los PDF generados quedan guardados aquí. También puedes adjuntar el documento físico escaneado o fotografiado.</p>
          {board.canUpload && <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} disabled={busy} />El archivo que voy a adjuntar contiene firmas manuscritas</label>
          <input ref={input} type="file" className="hidden" accept={board.uploadSettings.allowedMime.join(',')} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; if (file.size > board.uploadSettings.maxSizeMb * 1024 * 1024) return toast.error(`Máximo ${board.uploadSettings.maxSizeMb} MB`); upload.mutate(file) }} />
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>{upload.isPending ? 'Adjuntando...' : 'Adjuntar evidencia'}</Button><p className="text-xs text-muted-foreground">PDF o imagen · Máximo {board.uploadSettings.maxSizeMb} MB. La indicación de firmas la declara quien adjunta; no confirma la recepción física.</p></>}
        </div>
        {!board.evidence.length && <p className="text-sm text-muted-foreground">Todavía no hay documentos. Genera el consolidado o un informe para guardarlo aquí.</p>}
        {board.evidence.map((f) => <div key={f.id} className="space-y-2 rounded-md border p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{f.label} {f.isSigned && <Badge variant="secondary">Copia con firmas declaradas</Badge>}</p><p className="text-xs text-muted-foreground">{f.authorName} · {date(f.createdAt)}</p></div><Button variant="outline" size="sm" onClick={() => openProtectedFile(`course-board-evidence/${f.id}`, f.fileName).catch(fail)}>Ver / imprimir</Button></div>{f.document && <details className="text-sm"><summary className="cursor-pointer text-primary">Ver resumen del informe{f.document.subjectName ? ` · ${f.document.subjectName}` : ''}</summary><div className="mt-2 space-y-2">{(['situation', 'actions', 'recommendations'] as const).map((key) => <p className="whitespace-pre-wrap" key={key}><strong>{f.document!.labels[key]}: </strong>{f.document![key] || '—'}</p>)}</div></details>}</div>)}
      </TabsContent>
    </Tabs>
  </div>
}
