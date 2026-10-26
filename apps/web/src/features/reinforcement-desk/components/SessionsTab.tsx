import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  reinforcementDeskApi,
  type AttendanceStatus,
  type CaseActivity,
  type CaseDetail,
  type CaseSession,
} from '../api/reinforcement-desk.api'

const NONE = 'none'
const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = { present: 'Asistió', absent: 'No asistió', justified: 'Justificado' }
const MODE_LABEL: Record<string, string> = {
  agreement_formative: 'Refuerzo formativo (promedio con tope)',
  agreement_direct: 'Mejora sumativa directa',
  agreement_with_reinforcement: 'Mejora sumativa con refuerzo',
  average: 'Promedio con la nota original',
  replace: 'Reemplaza la nota original',
}
const n = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(2))

interface Props {
  planId: string
  detail: CaseDetail
}

export function SessionsTab({ planId, detail }: Props) {
  const [editing, setEditing] = React.useState<CaseSession | 'new' | null>(null)
  const { data: activities = [] } = useQuery({
    queryKey: ['reinforcement-desk-activities', planId],
    queryFn: () => reinforcementDeskApi.activities(planId),
  })
  const { data: formative } = useQuery({ queryKey: ['reinforcement-formative', planId], queryFn: () => reinforcementDeskApi.formativeOptions(planId) })
  const activityById = new Map(activities.map((a) => [a.id, a]))

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {formative?.policy.mode ? 'Registra las actividades del plan, su horario y asistencia. Las notas formativas se aplican desde Resultado formativo, después de revisar la vista previa. Puedes dejar prácticas sin nota.' : 'Cada sesión registra la asistencia al refuerzo. Si apunta a una actividad original, la nota se aplica con las reglas de la institución.'}
        </p>
        {detail.canEdit && (
          <Button size="sm" onClick={() => setEditing('new')}><Plus className="mr-1.5 h-4 w-4" /> Nueva sesión</Button>
        )}
      </div>

      {detail.sessions.length === 0 ? (
        <EmptyState title="Sin sesiones de refuerzo" description="Registra la primera sesión para llevar la asistencia." />
      ) : (
        detail.sessions.map((s) => (
          <SessionCard
            key={s.id}
            planId={planId}
            session={s}
            formativeScale={formative?.policy.mode ? formative.scale : undefined}
            detail={detail}
            activity={s.targetActivityId ? activityById.get(s.targetActivityId) ?? null : null}
            onEdit={() => setEditing(s)}
          />
        ))
      )}

      {editing && (
        <SessionDialog
          planId={planId}
          session={editing === 'new' ? null : editing}
          activities={activities}
          students={detail.students}
          formativeEnabled={!!formative?.policy.mode}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function SessionCard({
  planId,
  session,
  detail,
  activity,
  onEdit,
  formativeScale,
}: {
  planId: string
  session: CaseSession
  detail: CaseDetail
  activity: CaseActivity | null
  onEdit: () => void
  formativeScale?: number
}) {
  const qc = useQueryClient()
  const formativeMode = formativeScale != null && !activity?.summative
  const showScore = !!activity || formativeMode
  type Row = { status: AttendanceStatus; score: string; observation: string }
  const initial = React.useCallback((): Record<string, Row> => {
    const out: Record<string, Row> = {}
    for (const st of detail.students) {
      const a = session.attendances.find((x) => x.studentId === st.id)
      out[st.id] = { status: a?.status ?? 'present', score: a?.score != null ? String(a.score) : '', observation: a?.observation ?? '' }
    }
    return out
  }, [detail.students, session.attendances])
  const [rows, setRows] = React.useState<Record<string, Row>>(initial)
  React.useEffect(() => setRows(initial()), [initial])

  const save = useMutation({
    mutationFn: () => reinforcementDeskApi.saveAttendance(planId, session.id, detail.students.map((st) => {
      const r = rows[st.id]
      const score = r.status === 'present' && showScore && r.score.trim() !== '' ? Number(r.score) : null
      return { studentId: st.id, status: r.status, score, observation: r.observation || null }
    })),
    onSuccess: () => {
      toast.success('Asistencia guardada')
      qc.invalidateQueries({ queryKey: ['reinforcement-desk-detail', planId] })
      qc.invalidateQueries({ queryKey: ['reinforcement-desk-activities', planId] })
      qc.invalidateQueries({ queryKey: ['reinforcement-formative', planId] })
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const remove = useMutation({
    mutationFn: () => reinforcementDeskApi.deleteSession(planId, session.id),
    onSuccess: () => {
      toast.success('Sesión eliminada')
      qc.invalidateQueries({ queryKey: ['reinforcement-desk-detail', planId] })
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  async function onDelete() {
    const ok = await confirmDialog({
      title: 'Eliminar sesión',
      description: formativeMode ? 'Se eliminará la sesión y su asistencia. Los resultados formativos ya aplicados conservan sus evidencias y calificaciones; puedes retirarlos desde Resultado formativo.' : 'Se eliminará la sesión y su asistencia. Las notas que esta sesión aplicó a la actividad original se revertirán a la nota inicial.',
      confirmText: 'Eliminar',
      destructive: true,
    })
    if (ok) remove.mutate()
  }

  const set = (id: string, patch: Partial<Row>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-medium">{session.date} · {session.title}</p>
            {session.description && <p className="text-sm text-muted-foreground">{session.description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              {activity
                ? <>Actividad original: <span className="font-medium">{activity.name}</span> ({activity.type}{activity.summative ? ' · sumativa' : ' · formativa'}, sobre {activity.maxScore})</>
                : formativeMode ? `Actividad del plan de refuerzo. Calificación opcional sobre ${formativeScale}.` : 'Sin actividad original: solo registra asistencia y observaciones.'}
            </p>
          </div>
          {detail.canEdit && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}><Pencil className="mr-1 h-3.5 w-3.5" /> Editar</Button>
              <Button variant="outline" size="sm" onClick={onDelete} disabled={remove.isPending}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2">Estudiante</th>
                <th className="py-2 pr-2">Asistencia</th>
                {activity && <th className="py-2 pr-2">Nota inicial</th>}
                {showScore && <th className="py-2 pr-2">{formativeMode ? `Resultado / ${formativeScale}` : 'Nota de refuerzo'}</th>}
                {activity && !formativeMode && <th className="py-2 pr-2">Registrada</th>}
                <th className="py-2 pr-2">Observación</th>
              </tr>
            </thead>
            <tbody>
              {detail.students.map((st) => {
                const r = rows[st.id]
                if (!r) return null
                const att = session.attendances.find((x) => x.studentId === st.id)
                const original = activity?.grades.find((g) => g.studentId === st.id)?.original ?? null
                const canScore = detail.canEdit && showScore && r.status === 'present'
                return (
                  <tr key={st.id} className="border-b last:border-0">
                    <td className="py-2 pr-2 font-medium">{st.name}</td>
                    <td className="py-2 pr-2">
                      {detail.canEdit ? (
                        <Select value={r.status} onValueChange={(v) => set(st.id, { status: v as AttendanceStatus })}>
                          <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(Object.keys(ATTENDANCE_LABEL) as AttendanceStatus[]).map((k) => <SelectItem key={k} value={k}>{ATTENDANCE_LABEL[k]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      ) : ATTENDANCE_LABEL[r.status]}
                    </td>
                    {activity && <td className="py-2 pr-2">{n(original)}</td>}
                    {showScore && (
                      <td className="py-2 pr-2">
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          max={formativeMode ? formativeScale : activity?.maxScore}
                          className="h-8 w-24"
                          value={r.score}
                          disabled={!canScore}
                          onChange={(e) => set(st.id, { score: e.target.value })}
                        />
                      </td>
                    )}
                    {activity && !formativeMode && (
                      <td className="py-2 pr-2 text-xs">
                        {att?.appliedScore != null ? (
                          <div>
                            <span className="font-semibold">{n(att.appliedScore)}</span>
                            {att.appliedMode && <p className="text-muted-foreground">{MODE_LABEL[att.appliedMode] ?? att.appliedMode}</p>}
                          </div>
                        ) : '—'}
                      </td>
                    )}
                    <td className="py-2 pr-2">
                      <Input
                        className="h-8 min-w-40"
                        value={r.observation}
                        disabled={!detail.canEdit}
                        onChange={(e) => set(st.id, { observation: e.target.value })}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {detail.canEdit && (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> Guardar asistencia
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SessionDialog({
  planId,
  session,
  activities,
  students,
  formativeEnabled,
  onClose,
}: {
  planId: string
  session: CaseSession | null
  activities: CaseActivity[]
  students: Array<{ id: string; name: string }>
  formativeEnabled: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [date, setDate] = React.useState(session?.date ?? new Date().toISOString().slice(0, 10))
  const [title, setTitle] = React.useState(session?.title ?? '')
  const [description, setDescription] = React.useState(session?.description ?? '')
  const [target, setTarget] = React.useState(session?.targetActivityId ?? NONE)
  const selected = activities.find((a) => a.id === target) ?? null

  const save = useMutation({
    mutationFn: () => {
      const data = { date, title, description: description || null, targetActivityId: target === NONE ? null : target }
      return session ? reinforcementDeskApi.updateSession(planId, session.id, data) : reinforcementDeskApi.createSession(planId, data)
    },
    onSuccess: () => {
      toast.success(session ? 'Sesión actualizada' : 'Sesión creada')
      qc.invalidateQueries({ queryKey: ['reinforcement-desk-detail', planId] })
      onClose()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{session ? 'Editar sesión' : 'Nueva sesión de refuerzo'}</DialogTitle>
          <DialogDescription>
            {formativeEnabled ? 'Registra una actividad del plan de refuerzo y su fecha. Su calificación formativa es opcional y se aplica desde Resultado formativo. Las evaluaciones sumativas conservan su procedimiento individual.' : 'La nota se aplica a la actividad original con las reglas de mejora configuradas por la institución.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Taller de fracciones" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Descripción</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="space-y-1">
            <Label>Actividad original (opcional)</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{formativeEnabled ? 'Actividad del plan sin actividad original' : 'Sin actividad original (solo asistencia)'}</SelectItem>
                {activities.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name} · {a.type}{a.summative ? ' (sumativa)' : ''}{a.date ? ` · ${a.date}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selected && (
            <div className="rounded-md border bg-muted/40 p-3 text-xs">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={selected.summative ? 'warning' : 'secondary'}>{selected.summative ? 'Sumativa' : 'Formativa'}</Badge>
                <span>Sobre {selected.maxScore}{selected.insumo ? ` · ${selected.insumo}` : ''}</span>
              </div>
              {students.map((st) => {
                const g = selected.grades.find((x) => x.studentId === st.id)
                return (
                  <p key={st.id}>
                    {st.name}: nota inicial {n(g?.original)}{g?.reinforced ? ` · vigente ${n(g.effective)} (ya reforzada)` : ''}
                  </p>
                )
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim() || !date}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
