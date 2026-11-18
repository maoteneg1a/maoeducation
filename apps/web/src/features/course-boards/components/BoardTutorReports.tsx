import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { getErrorMessage } from '@/shared/lib/utils'
import { openProtectedFile } from '@/shared/lib/protected-file'
import type { BoardData } from '../api/course-boards.api'
import { BoardReportDialog } from './BoardReportDialog'

export function BoardTutorReports({ board }: { board: BoardData }) {
  const reports = board.evidence.filter((file) => file.kind === 'REPORT' && file.document)
  if (!board.canReport && !reports.length) return null
  const contents = <div className="space-y-3">
    {reports.map((file) => <div key={file.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div><p className="text-sm font-medium">{file.document!.title}{file.document!.subjectName ? ` · ${file.document!.subjectName}` : ''}</p><p className="text-xs text-muted-foreground">{file.authorName} · {new Intl.DateTimeFormat('es-EC', { timeZone: 'America/Guayaquil', dateStyle: 'short' }).format(new Date(file.createdAt))}</p></div>
      <Button variant="outline" onClick={() => openProtectedFile(`course-board-evidence/${file.id}`, file.fileName).catch((e) => toast.error(getErrorMessage(e)))}>Ver / imprimir</Button>
    </div>)}
    {board.canReport && <BoardReportDialog board={board} />}
  </div>
  return reports.length ? <section className="space-y-3 rounded-md border p-3"><h2 className="text-sm font-semibold">Informes del tutor</h2>{contents}</section> : <details className="rounded-md border p-3"><summary className="cursor-pointer text-sm">Informe del tutor (opcional)</summary><div className="mt-3">{contents}</div></details>
}
