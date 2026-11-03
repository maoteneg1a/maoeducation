import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Save, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { useUnsavedChanges } from '@/shared/hooks/useUnsavedChanges'
import { getErrorMessage } from '@/shared/lib/utils'
import { reinforcementDeskApi, type AttendanceStatus, type CaseActivity, type CaseDetail, type CaseSession, type FormativeOptions, type RegisterCell } from '../api/reinforcement-desk.api'

type Draft = RegisterCell & { text: string }
const keyOf = (student: string, session: string) => `${student}:${session}`
const display = (value: number | null | undefined) => value == null ? '—' : value.toFixed(2)

export function ReinforcementGradeRegister({ planId, detail, options, activities, onEdit, onBusyChange }: {
  planId: string; detail: CaseDetail; options: FormativeOptions; activities: CaseActivity[]; onEdit: (session: CaseSession) => void; onBusyChange: (busy: boolean) => void
}) {
  const qc = useQueryClient()
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const busy = React.useRef(false)
  const editable = options.canApply && detail.canEdit && detail.case.caseStatus !== 'CLOSED'
  const { confirmDiscard } = useUnsavedChanges(Object.keys(drafts).length > 0, true)
  const original = (studentId: string, session: CaseSession): Draft => {
    const attendance = session.attendances.find((row) => row.studentId === studentId)
    return { studentId, sessionId: session.id, score: attendance?.score ?? null, status: attendance?.status ?? 'present', text: attendance?.score == null ? '' : String(attendance.score), expected: { score: attendance?.score ?? null, status: attendance?.status ?? null } }
  }
  const read = (studentId: string, session: CaseSession) => drafts[keyOf(studentId, session.id)] ?? original(studentId, session)
  const locked = (studentId: string, session: CaseSession) => session.attendances.some((row) => row.studentId === studentId && row.appliedScore != null) || (!!session.targetActivityId && !activities.some((activity) => activity.id === session.targetActivityId && !activity.summative))
  const invalidate = async () => {
    await qc.invalidateQueries({ predicate: (query) => /reinforcement|grade|report|alert|dossier|boletin/i.test(String(query.queryKey[0])) })
  }
  const save = useMutation({
    mutationFn: async () => {
      const items = Object.values(drafts).map(({ text, ...cell }) => {
        const score = text.trim() === '' ? null : Number(text.replace(',', '.'))
        if (score != null && (!Number.isFinite(score) || score < 0 || score > options.scale)) throw new Error(`Ingresa notas entre 0 y ${options.scale}`)
        return { ...cell, score }
      })
      return reinforcementDeskApi.saveRegister(planId, items)
    },
    onSuccess: async (data) => {
      setDrafts({})
      qc.setQueryData(['reinforcement-desk-detail', planId], data)
      toast.success('Notas guardadas y promedio actualizado')
      await invalidate()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { busy.current = false },
  })
  const remove = useMutation({
    mutationFn: (id: string) => reinforcementDeskApi.deleteSession(planId, id),
    onSuccess: invalidate,
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { busy.current = false },
  })
  const pending = save.isPending || remove.isPending
  const hasDrafts = Object.keys(drafts).length > 0
  React.useEffect(() => { onBusyChange(pending || hasDrafts); return () => onBusyChange(false) }, [pending, hasDrafts, onBusyChange])
  const change = (studentId: string, session: CaseSession, patch: Partial<Draft>) => {
    if (!editable || busy.current) return
    setDrafts((previous) => {
      const key = keyOf(studentId, session.id)
      return { ...previous, [key]: { ...(previous[key] ?? original(studentId, session)), ...patch } }
    })
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
      <div className="text-sm"><p>{detail.case.caseStatus === 'CLOSED' ? 'Seguimiento finalizado. Las notas están protegidas; usa «Corregir notas» si necesitas un cambio.' : 'Escribe las notas y guarda. El promedio se actualiza con la regla institucional.'}</p>
        <p className="text-xs text-muted-foreground">{options.policy.mode === 'activity_set' ? 'Actividades originales vinculadas' : 'Promedio formativo del período'} · Refuerzo {options.policy.reinforcementWeight}% · Tope {options.policy.cap}. Vacío no cuenta; 0 sí cuenta.</p></div>
      {editable && <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={pending || !detail.sessions.length} onClick={() => {
        for (const session of detail.sessions) for (const student of detail.students) {
          if (!locked(student.id, session) && read(student.id, session).expected.status === null && !drafts[keyOf(student.id, session.id)] && !(options.policy.mode === 'activity_set' && !session.targetActivityId)) change(student.id, session, { status: 'present' })
        }
      }} title="Marca como presentes solamente las asistencias sin registrar">Completar asistencia</Button><Button loading={save.isPending} disabled={pending || !detail.sessions.length} onClick={() => { if (busy.current) return; busy.current = true; save.mutate() }}><Save className="mr-2 h-4 w-4" />Guardar notas{Object.keys(drafts).length ? ` (${Object.keys(drafts).length})` : ''}</Button></div>}
    </div>
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm"><caption className="sr-only">Actividades de refuerzo y resultados del período</caption><thead><tr>
        <th scope="col" className="sticky left-0 z-10 min-w-48 border-r bg-muted p-3 text-left">Estudiante</th>
        {detail.sessions.map((session) => <th key={session.id} scope="col" className="min-w-40 max-w-56 border-r border-blue-100 bg-blue-50/80 p-3 text-left align-top dark:border-blue-900/50 dark:bg-blue-950/25">
          <div className="flex items-center justify-between gap-2"><span>{session.title}</span>{editable && <span className="flex">
            <Button variant="ghost" size="sm" title="Editar actividad" aria-label={`Editar ${session.title}`} disabled={pending || Object.keys(drafts).length > 0} onClick={() => onEdit(session)}><Pencil className="h-3 w-3" /></Button>
            <Button variant="ghost" size="sm" title="Eliminar actividad" aria-label={`Eliminar ${session.title}`} disabled={pending || Object.keys(drafts).length > 0} onClick={async () => {
              if (busy.current || !await confirmDiscard() || !await confirmDialog({ title: '¿Eliminar actividad?', description: 'Se borrarán sus notas y el promedio se recalculará. El historial conservará el cambio.', confirmText: 'Eliminar', destructive: true })) return
              busy.current = true; remove.mutate(session.id)
            }}><Trash2 className="h-3 w-3" /></Button></span>}</div>
          <div className="text-xs font-normal text-muted-foreground">{session.date.slice(0, 10)}</div>
          {session.targetActivityId && <div className="mt-1 text-xs font-normal">Original: {activities.find((activity) => activity.id === session.targetActivityId)?.name ?? 'Actividad anterior'}</div>}
          {options.policy.mode === 'activity_set' && !session.targetActivityId && <div className="text-xs font-normal text-amber-700">Edita esta columna para elegir su actividad original.</div>}
        </th>)}
        <th scope="col" className="min-w-36 border-l-2 border-violet-200 bg-violet-100/60 p-3 text-center dark:border-violet-800 dark:bg-violet-950/30">Promedio del refuerzo</th><th scope="col" className="min-w-32 border-l bg-muted/50 p-3 text-center">Formativa antes</th><th scope="col" className="min-w-32 border-l-2 border-teal-200 bg-teal-100/60 p-3 text-center dark:border-teal-800 dark:bg-teal-950/30">Formativa actual</th><th scope="col" className="min-w-32 border-l border-teal-200 bg-teal-100 p-3 text-center dark:border-teal-800 dark:bg-teal-950/40">Total del período</th>
      </tr></thead><tbody>{detail.students.map((student, rowIndex) => {
        const graded = detail.sessions.filter((session) => !locked(student.id, session)).map((session) => read(student.id, session)).filter((cell) => cell.status === 'present' && cell.text.trim() !== '').map((cell) => Number(cell.text.replace(',', '.'))).filter((value) => Number.isFinite(value) && value >= 0 && value <= options.scale)
        const summary = detail.scores.find((score) => score.studentId === student.id)
        return <tr key={student.id} className="border-t"><th scope="row" className="sticky left-0 z-10 border-r bg-background p-3 text-left font-medium">{student.name}</th>
          {detail.sessions.map((session, columnIndex) => {
            const cell = read(student.id, session)
            const individual = locked(student.id, session)
            const disabled = !editable || pending || individual || (options.policy.mode === 'activity_set' && !session.targetActivityId)
            return <td key={session.id} className="border-r border-blue-100 bg-blue-50/20 p-2 align-top dark:border-blue-900/50 dark:bg-blue-950/10">
              <input aria-label={`${student.name}, ${session.title}`} data-register-row={rowIndex} data-register-column={columnIndex} className="h-10 w-24 rounded border bg-background px-3 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50" inputMode="decimal" value={cell.text} disabled={disabled || cell.status !== 'present'}
                onChange={(event) => change(student.id, session, { text: event.target.value, status: 'present' })}
                onKeyDown={(event) => {
                  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return
                  event.preventDefault()
                  const row = rowIndex + (event.key === 'ArrowUp' ? -1 : 1)
                  document.querySelector<HTMLInputElement>(`input[data-register-row="${row}"][data-register-column="${columnIndex}"]`)?.focus()
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData('text')
                  if (!/[\t\n]/.test(text)) return
                  event.preventDefault()
                  const updates: Array<{ studentId: string; session: CaseSession; text: string }> = []
                  const rows = text.replace(/\r/g, '').replace(/\n$/, '').split('\n')
                  for (let r = 0; r < rows.length; r++) {
                    const columns = rows[r].split('\t')
                    for (let c = 0; c < columns.length; c++) {
                      const student = detail.students[rowIndex + r], target = detail.sessions[columnIndex + c]
                      const value = columns[c].trim(), score = value === '' ? null : Number(value.replace(',', '.'))
                      if (!student || !target || locked(student.id, target) || (options.policy.mode === 'activity_set' && !target.targetActivityId) || (score != null && (!Number.isFinite(score) || score < 0 || score > options.scale))) { toast.error('Revisa el rango y las notas pegadas; no se cambió ninguna celda'); return }
                      updates.push({ studentId: student.id, session: target, text: value })
                    }
                  }
                  for (const update of updates) change(update.studentId, update.session, { text: update.text, status: 'present' })
                }} />
              {individual ? <p className="text-xs text-muted-foreground">Mejora individual · ver Notas</p> : <select aria-label={`Asistencia de ${student.name}, ${session.title}`} className="mt-1 block w-full bg-transparent text-xs text-muted-foreground" value={!drafts[keyOf(student.id, session.id)] && cell.expected.status === null ? 'unrecorded' : cell.status} disabled={disabled} onChange={(event) => { const status = event.target.value as AttendanceStatus; change(student.id, session, { status, ...(status !== 'present' ? { text: '' } : {}) }) }}><option value="unrecorded" disabled>Sin registrar</option><option value="present">Asistió</option><option value="absent">No asistió</option><option value="justified">Justificado</option></select>}
            </td>
          })}
          <td className="border-l-2 border-violet-200 bg-violet-50/50 p-3 text-center font-medium tabular-nums dark:border-violet-800 dark:bg-violet-950/15">{display(graded.length ? graded.reduce((sum, value) => sum + value, 0) / graded.length : null)}</td><td className="border-l bg-muted/20 p-3 text-center tabular-nums">{display(summary?.beforeReinforcement)}</td><td className="border-l-2 border-teal-200 bg-teal-50/60 p-3 text-center text-base font-semibold tabular-nums dark:border-teal-800 dark:bg-teal-950/20">{display(summary?.formative)}</td><td className="border-l border-teal-200 bg-teal-100/50 p-3 text-center text-base font-bold tabular-nums dark:border-teal-800 dark:bg-teal-950/30">{display(summary?.total)}</td>
        </tr>
      })}</tbody></table>
    </div>
    <p className="text-xs text-muted-foreground">Puedes pegar un bloque desde Excel y usar Enter o las flechas para avanzar. Formativa y total muestran las notas guardadas; se actualizan al guardar. La regla considera el refuerzo de la misma asignatura y período.</p>
    {Object.keys(drafts).length > 0 && <p role="status" className="text-sm text-amber-700">Hay notas sin guardar. Guarda antes de editar las columnas o cambiar de apartado.</p>}
  </div>
}
