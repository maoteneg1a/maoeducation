import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Puzzle, Plus } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { useAcademicYears, useParallels, usePeriods } from '@/features/academic/hooks/useAcademic'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useProjects, useCreateProject } from '../hooks/useInterdisciplinaryProjects'
import type { InterdisciplinaryProjectStatus } from '../api/interdisciplinary-project.api'

const STATUS_LABEL: Record<InterdisciplinaryProjectStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'Enviado', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'success' },
}

export function InterdisciplinaryProjectsPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { hasAnyRole } = usePermissions()
  const isAdminLike = hasAnyRole('admin', 'inspector')

  const { data: years = [] } = useAcademicYears()
  const [yearId, setYearId] = React.useState('')
  const activeYear = years.find((y) => y.isActive)
  React.useEffect(() => {
    if (!yearId && activeYear) setYearId(activeYear.id)
  }, [activeYear])

  const { data: allParallels = [] } = useParallels(yearId || undefined)
  const parallels = React.useMemo(() => {
    if (isAdminLike) return allParallels
    const tutored = user?.tutorParallelIds ?? []
    // el docente ve los paralelos que tutela, más los suyos vía asignación (simplificado: si no tutela ninguno, ve todos del año)
    return tutored.length > 0 ? allParallels.filter((p) => tutored.includes(p.id)) : allParallels
  }, [allParallels, isAdminLike, user])

  const [parallelId, setParallelId] = React.useState('')
  React.useEffect(() => {
    if (parallels.length === 1 && !parallelId) setParallelId(parallels[0].id)
  }, [parallels])

  const { data: periods = [] } = usePeriods(yearId)
  const [periodId, setPeriodId] = React.useState('')
  React.useEffect(() => {
    const active = periods.find((p) => p.isActive)
    if (!periodId && active) setPeriodId(active.id)
  }, [periods])

  const { data: projects = [], isLoading } = useProjects(parallelId || undefined, periodId || undefined)
  const createProject = useCreateProject()

  const [newTitle, setNewTitle] = React.useState('')
  const [newWeeksCount, setNewWeeksCount] = React.useState('10')

  const handleCreate = () => {
    if (!newTitle.trim() || !parallelId || !periodId) return
    createProject.mutate(
      {
        parallelId,
        academicPeriodId: periodId,
        title: newTitle.trim(),
        weeksCount: Number(newWeeksCount) || 10,
      },
      {
        onSuccess: (project) => navigate(`/interdisciplinary-projects/${project.id}`),
      },
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Proyectos Interdisciplinarios</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Retos compartidos por un paralelo donde varias asignaturas contribuyen con sus propias destrezas.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-44 space-y-1.5">
          <Label>Año lectivo</Label>
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-56 space-y-1.5">
          <Label>Paralelo</Label>
          <Select value={parallelId} onValueChange={setParallelId} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="Selecciona paralelo" /></SelectTrigger>
            <SelectContent>
              {parallels.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.level?.name ? `${p.level.name} ${p.name}` : p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-44 space-y-1.5">
          <Label>Periodo</Label>
          <Select value={periodId} onValueChange={setPeriodId} disabled={!parallelId}>
            <SelectTrigger><SelectValue placeholder="Periodo" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!parallelId || !periodId ? (
        <EmptyState icon={Puzzle} title="Selecciona paralelo y periodo" description="Verás los proyectos interdisciplinarios de ese paralelo y podrás crear uno nuevo." />
      ) : (
        <>
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Título del proyecto</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={200} placeholder="Ej: Conexiones para transformar" />
            </div>
            <div className="w-full sm:w-40 space-y-1.5">
              <Label>N.º de semanas</Label>
              <Input type="number" min={1} value={newWeeksCount} onChange={(e) => setNewWeeksCount(e.target.value)} />
            </div>
            <Button onClick={handleCreate} disabled={!newTitle.trim()} loading={createProject.isPending}>
              <Plus className="h-4 w-4" />
              Crear proyecto
            </Button>
          </Card>

          {isLoading ? (
            <PageLoader />
          ) : projects.length === 0 ? (
            <EmptyState icon={Puzzle} title="Sin proyectos interdisciplinarios" description="Crea el primero para este paralelo y periodo." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <Card
                  key={project.id}
                  className="cursor-pointer p-4 transition hover:border-primary/50 hover:shadow-sm"
                  onClick={() => navigate(`/interdisciplinary-projects/${project.id}`)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{project.title}</p>
                    <Badge variant={STATUS_LABEL[project.status].variant}>{STATUS_LABEL[project.status].label}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {project._count?.contributions ?? 0} asignatura(s) · {project.weeksCount} semanas
                  </p>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
