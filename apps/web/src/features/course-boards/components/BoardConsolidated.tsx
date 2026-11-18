import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { getErrorMessage } from '@/shared/lib/utils'
import { normalizeStudentSearch } from '@/shared/lib/student-options'
import { confirmBoardGrades, type BoardData } from '../api/course-boards.api'
import { BoardTutorReports } from './BoardTutorReports'

export function BoardConsolidated({ board }: { board: BoardData }) {
  const [search, setSearch] = useState('')
  const qc = useQueryClient()
  const confirm = useMutation({ mutationFn: () => confirmBoardGrades(board.id, board.gradesHash), onSuccess: () => { qc.invalidateQueries({ queryKey: ['course-boards'] }); toast.success('Notas confirmadas por el tutor') }, onError: (e) => toast.error(getErrorMessage(e)) })
  const terms = normalizeStudentSearch(search).split(/\s+/).filter(Boolean)
  const rows = board.matrix.rows.filter((row) => terms.every((term) => normalizeStudentSearch(`${row.name} ${row.dni ?? ''}`).includes(term)))
  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <p className="text-sm">{board.notesConfirmed ? 'Notas confirmadas por el tutor.' : 'Pendiente de revisión y confirmación del tutor.'}</p>
      {board.canConfirmGrades && <Button disabled={confirm.isPending} onClick={() => confirm.mutate()}>{confirm.isPending ? 'Confirmando...' : 'Confirmar notas'}</Button>}
    </div>
    {board.isTutor && board.status === 'OPEN' && <p className="text-sm text-muted-foreground">Revisa todas las materias y confirma que las notas estén correctas. Si cambian después, tendrás que confirmarlas nuevamente. Las correcciones se registran en Calificar.</p>}
    <Input aria-label="Buscar estudiante en el consolidado" placeholder="Buscar por apellidos, nombres o cédula" value={search} onChange={(e) => setSearch(e.target.value)} />
    <div className="max-h-[65vh] overflow-auto rounded-md border"><table className="w-full text-sm"><thead className="sticky top-0 z-20 bg-muted"><tr><th className="sticky left-0 z-30 min-w-56 bg-muted p-3 text-left">Apellidos y nombres</th>{board.matrix.subjects.map((subject) => <th key={subject.id} className="min-w-28 p-3" title={subject.teacherName}>{subject.name}</th>)}</tr></thead><tbody>{rows.map((row) => <tr className="border-t" key={row.id}><th className="sticky left-0 z-10 bg-background p-3 text-left font-medium">{row.name}</th>{row.grades.map((grade) => <td className="p-3 text-center tabular-nums" key={grade.assignmentId}>{grade.display}{grade.partial && <span className="ml-1 text-amber-600">*</span>}</td>)}</tr>)}</tbody></table></div>
    <p className="text-xs text-muted-foreground">— Sin calificación registrada. * Faltan componentes de la nota del período.</p>
    {board.isAuthority && <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Observaciones del curso</summary><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left">Estudiante</th>{board.matrix.config.showAttendance && <th className="p-2">Faltas / atrasos</th>}{board.matrix.config.showIncidents && <th className="p-2">Incidencias</th>}{board.matrix.config.showReinforcement && <th className="p-2">Refuerzos</th>}<th className="p-2 text-left">Observación</th></tr></thead><tbody>{board.matrix.rows.map((row) => <tr key={row.id} className="border-t"><td className="p-2">{row.name}</td>{board.matrix.config.showAttendance && <td className="p-2 text-center">{row.absences} / {row.late}</td>}{board.matrix.config.showIncidents && <td className="p-2 text-center">{row.incidents}</td>}{board.matrix.config.showReinforcement && <td className="p-2 text-center">{row.reinforcement}</td>}<td className="p-2">{[row.behavior, row.observation].filter(Boolean).join(' · ') || '—'}</td></tr>)}</tbody></table></div></details>}
    {board.isTutor && <BoardTutorReports board={board} />}
  </section>
}
