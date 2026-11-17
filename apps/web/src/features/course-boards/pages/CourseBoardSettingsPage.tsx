import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Label } from '@/shared/components/ui/label'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { getBoardOptions } from '../api/course-boards.api'
import { BoardConfigDialog } from '../components/BoardConfigDialog'

export function CourseBoardSettingsPage() {
  const [yearId, setYearId] = useState('')
  const { data, isLoading, error } = useQuery({
    queryKey: ['course-boards', 'options', yearId],
    queryFn: () => getBoardOptions(yearId || undefined),
  })

  if (isLoading) return <PageLoader />
  if (!data) return <p className="p-6 text-destructive">{getErrorMessage(error)}</p>

  return <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
    <div>
      <h1 className="text-2xl font-bold">Configuración de juntas de curso</h1>
      <p className="text-sm text-muted-foreground">Asigna quién será secretario de cada paralelo y define el formato institucional de las juntas.</p>
    </div>
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-56 space-y-1">
          <Label htmlFor="board-settings-year">Año lectivo</Label>
          <select id="board-settings-year" className="w-full rounded-md border bg-background p-2" value={yearId || data.yearId} onChange={(event) => setYearId(event.target.value)}>
            {data.years.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
          </select>
        </div>
        <BoardConfigDialog config={data.config} parallels={data.parallels} candidates={data.secretaryCandidates} />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">El secretario asignado será la única persona que podrá crear y publicar la convocatoria de ese paralelo. La autoridad podrá supervisar la junta.</p>
    </div>
  </div>
}
