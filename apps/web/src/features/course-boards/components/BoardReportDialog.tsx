import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { openProtectedFile } from '@/shared/lib/protected-file'
import { generateBoardReport, type BoardData } from '../api/course-boards.api'

export function BoardReportDialog({ board }: { board: BoardData }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [typeKey, setTypeKey] = useState('')
  const [assignmentId, setAssignmentId] = useState('general')
  const [situation, setSituation] = useState('')
  const [actions, setActions] = useState('')
  const [recommendations, setRecommendations] = useState('')
  const cfg = board.matrix.config
  const types = cfg.reportTypes.filter((t) => t.enabled && (board.isAuthority || (t.authors !== 'teacher' && board.isTutor) || (t.authors !== 'tutor' && board.ownAssignmentIds.length > 0)))
  const selectedType = types.find((t) => t.key === typeKey)
  const subjects = board.matrix.subjects.filter((s) => board.isAuthority || board.ownAssignmentIds.includes(s.id))
  const generalAllowed = selectedType?.authors !== 'teacher' && (board.isTutor || board.isAuthority)
  const selectedAssignment = assignmentId === 'general' ? generalAllowed : selectedType?.authors !== 'tutor' && subjects.some((s) => s.id === assignmentId)
  const mutation = useMutation({
    mutationFn: () => generateBoardReport(board.id, { typeKey, courseAssignmentId: assignmentId === 'general' ? undefined : assignmentId, situation, actions, recommendations }),
    onSuccess: ({ id }) => {
      qc.invalidateQueries({ queryKey: ['course-boards'] }); setOpen(false); toast.success('Informe guardado en las evidencias de la junta')
      openProtectedFile(`course-board-evidence/${id}`, 'informe.pdf', { download: true }).catch(() => toast.error('El informe está guardado; puedes descargarlo desde Evidencias'))
    }, onError: (e) => toast.error(getErrorMessage(e)),
  })
  return <Dialog open={open} onOpenChange={(value) => {
    if (mutation.isPending) return
    if (value) { setTypeKey(types[0]?.key ?? ''); setAssignmentId(types[0]?.authors !== 'teacher' && (board.isTutor || board.isAuthority) ? 'general' : subjects[0]?.id ?? ''); setSituation(''); setActions(''); setRecommendations('') }
    setOpen(value)
  }}>
    <DialogTrigger asChild><Button disabled={!types.length}>Generar informe</Button></DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Informe para imprimir</DialogTitle><DialogDescription>Se guardará una copia del PDF en esta junta. Solo completa el informe cuando sea necesario.</DialogDescription></DialogHeader>
      <fieldset disabled={mutation.isPending} className="space-y-3">
        <div className="space-y-1"><Label htmlFor="board-report-type">Tipo de informe</Label><select id="board-report-type" className="w-full rounded-md border bg-background p-2" value={typeKey} onChange={(e) => { setTypeKey(e.target.value); const type = types.find((t) => t.key === e.target.value); setAssignmentId(type?.authors === 'tutor' || (type?.authors === 'both' && (board.isTutor || board.isAuthority)) ? 'general' : subjects[0]?.id ?? '') }}>{types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="board-report-subject">Alcance</Label><select id="board-report-subject" className="w-full rounded-md border bg-background p-2" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>{generalAllowed && <option value="general">General del curso</option>}{selectedType?.authors !== 'tutor' && subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="board-situation">{cfg.situationLabel} *</Label><Textarea id="board-situation" value={situation} maxLength={6000} onChange={(e) => setSituation(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="board-actions">{cfg.actionsLabel}</Label><Textarea id="board-actions" value={actions} maxLength={6000} onChange={(e) => setActions(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="board-recommendations">{cfg.recommendationsLabel}</Label><Textarea id="board-recommendations" value={recommendations} maxLength={6000} onChange={(e) => setRecommendations(e.target.value)} /></div>
      </fieldset>
      <DialogFooter><Button variant="outline" disabled={mutation.isPending} onClick={() => setOpen(false)}>Cancelar</Button><Button disabled={mutation.isPending || !selectedType || !selectedAssignment || !situation.trim()} onClick={() => mutation.mutate()}>{mutation.isPending ? 'Generando...' : 'Generar y descargar PDF'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
