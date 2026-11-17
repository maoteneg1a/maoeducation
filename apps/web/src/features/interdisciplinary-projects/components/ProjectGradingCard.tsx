import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Checkbox } from '@/shared/components/ui/checkbox'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { getErrorMessage } from '@/shared/lib/utils'
import { interdisciplinaryProjectApi } from '../api/interdisciplinary-project.api'

export function ProjectGradingCard({ projectId }: { projectId: string }) {
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: ['interdisciplinary-project-grading', projectId],
    queryFn: () => interdisciplinaryProjectApi.getGrading(projectId),
    retry: false,
  })
  const [sourceId, setSourceId] = React.useState('')
  const [sharedIds, setSharedIds] = React.useState<string[]>([])
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const data = query.data
  const source = data?.contributions.find((row) => row.id === sourceId)

  React.useEffect(() => {
    if (!data?.contributions.length) return
    const nextSource = data.contributions.some((row) => row.id === sourceId) ? sourceId : data.contributions[0].id
    const selected = data.contributions.find((row) => row.id === nextSource)!
    setSourceId(nextSource)
    setSharedIds(selected.shareGroupId
      ? data.contributions.filter((row) => row.shareGroupId === selected.shareGroupId && row.id !== nextSource).map((row) => row.id)
      : [])
    setDrafts(Object.fromEntries(data.students.map((student) => [student.id, selected.grades[student.id] == null ? '' : String(selected.grades[student.id])])))
  }, [data, sourceId])

  const refresh = (next: Awaited<ReturnType<typeof interdisciplinaryProjectApi.getGrading>>) => {
    qc.setQueryData(['interdisciplinary-project-grading', projectId], next)
  }
  const sharing = useMutation({
    mutationFn: () => interdisciplinaryProjectApi.configureGradeSharing(projectId, sourceId, sharedIds),
    onSuccess: (next) => { refresh(next); toast.success(sharedIds.length ? 'Notas vinculadas entre las materias seleccionadas' : 'La materia ahora se califica por separado') },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const save = useMutation({
    mutationFn: () => interdisciplinaryProjectApi.saveProjectGrades(projectId, sourceId, data!.students.map((student) => ({
      studentId: student.id,
      score: drafts[student.id]?.trim() ? Number(drafts[student.id]) : null,
    }))),
    onSuccess: (next) => { refresh(next); qc.invalidateQueries({ queryKey: ['grades-report'] }); toast.success('Notas del proyecto guardadas') },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  if (query.isLoading) return <Card className="p-4 text-sm text-muted-foreground">Cargando calificación del proyecto…</Card>
  if (query.isError || !data?.contributions.length) return null

  const changeSource = (id: string) => {
    const next = data.contributions.find((row) => row.id === id)!
    setSourceId(id)
    setSharedIds(next.shareGroupId ? data.contributions.filter((row) => row.shareGroupId === next.shareGroupId && row.id !== id).map((row) => row.id) : [])
    setDrafts(Object.fromEntries(data.students.map((student) => [student.id, next.grades[student.id] == null ? '' : String(next.grades[student.id])])))
  }
  const originalShared = source?.shareGroupId
    ? data.contributions.filter((row) => row.shareGroupId === source.shareGroupId && row.id !== sourceId).map((row) => row.id).sort()
    : []
  const sharingChanged = originalShared.join('|') !== [...sharedIds].sort().join('|')

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">Calificación del proyecto</h2>
        <p className="text-sm text-muted-foreground">Una nota individual por materia. Puedes usar la misma nota solamente en otras materias tuyas de este proyecto.</p>
      </div>
      <div className="max-w-md space-y-1.5">
        <Label>Calificar en</Label>
        <Select value={sourceId} onValueChange={changeSource}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{data.contributions.map((row) => <SelectItem key={row.id} value={row.id}>{row.subjectName}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {data.contributions.length > 1 && <div className="space-y-2 rounded-md border p-3">
        <div className="flex items-center gap-2 text-sm font-medium"><Link2 className="h-4 w-4" />Usar esta misma nota en</div>
        {data.contributions.filter((row) => row.id !== sourceId).map((row) => <label key={row.id} className="flex items-center gap-2 text-sm">
          <Checkbox checked={sharedIds.includes(row.id)} disabled={data.isClosed} onCheckedChange={(checked) => setSharedIds((current) => checked ? [...current, row.id] : current.filter((id) => id !== row.id))} />
          {row.subjectName}
        </label>)}
        <p className="text-xs text-muted-foreground">Al vincular, prevalecen las notas de {source?.subjectName}. Al quitar el check, cada materia conserva su última nota y vuelve a ser independiente.</p>
        {sharingChanged && <Button size="sm" variant="outline" disabled={data.isClosed} loading={sharing.isPending} onClick={() => {
          if (sharedIds.length > originalShared.length && !window.confirm(`Las notas actuales de ${source?.subjectName} reemplazarán las de las materias marcadas. ¿Continuar?`)) return
          sharing.mutate()
        }}>Aplicar selección</Button>}
      </div>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40"><tr><th className="p-2 text-left">Estudiante</th><th className="w-36 p-2 text-center">Nota / {data.gradingScaleMax}</th></tr></thead>
          <tbody>{data.students.map((student) => <tr key={student.id} className="border-t">
            <td className="p-2">{student.name}</td>
            <td className="p-2"><Input className="h-8 text-center" type="number" min={0} max={data.gradingScaleMax} step="0.01" disabled={data.isClosed} value={drafts[student.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [student.id]: event.target.value }))} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{data.isClosed ? 'El período está cerrado.' : sharedIds.length ? `Se guardará también en ${sharedIds.length} materia(s) vinculada(s).` : 'Esta nota se guardará solo en la materia seleccionada.'}</p>
        <Button disabled={data.isClosed || sharingChanged} loading={save.isPending} onClick={() => save.mutate()}><Save className="h-4 w-4" />Guardar notas</Button>
      </div>
    </Card>
  )
}
