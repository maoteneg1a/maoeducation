import * as React from 'react'
import { HeartHandshake } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { SkillReinforcementPanel } from '../components/SkillReinforcementPanel'
import { ReinforcementPlansList } from '../components/ReinforcementPlansList'

export function ReinforcementPlansPage() {
  const { assignments, periods, defaultAssignmentId, defaultPeriodId } = useTeacherDefaults()

  const [assignmentId, setAssignmentId] = React.useState('')
  const [periodId, setPeriodId] = React.useState('')

  React.useEffect(() => {
    if (!assignmentId && defaultAssignmentId) setAssignmentId(defaultAssignmentId)
  }, [defaultAssignmentId])
  React.useEffect(() => {
    if (!periodId && defaultPeriodId) setPeriodId(defaultPeriodId)
  }, [defaultPeriodId])

  const selectedAssignment = assignments.find((a) => a.id === assignmentId)

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Refuerzo y Adaptaciones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Estudiantes que necesitan refuerzo (detectado por notas) o tienen adaptación curricular (NEE), y sus
          planes individualizados.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-64 space-y-1.5">
          <label className="text-sm font-medium">Asignación</label>
          <Select value={assignmentId} onValueChange={setAssignmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona una asignación" />
            </SelectTrigger>
            <SelectContent>
              {assignments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.subject?.name ?? a.subjectName} — {a.parallel?.level.name} {a.parallel?.name ?? a.parallelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-48 space-y-1.5">
          <label className="text-sm font-medium">Periodo</label>
          <Select value={periodId} onValueChange={setPeriodId} disabled={!assignmentId}>
            <SelectTrigger>
              <SelectValue placeholder="Periodo" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!assignmentId || !periodId ? (
        <EmptyState
          icon={HeartHandshake}
          title="Selecciona la asignación y el periodo"
          description="Verás los candidatos a refuerzo detectados automáticamente y los planes ya creados."
        />
      ) : (
        <div className="space-y-4">
          <SkillReinforcementPanel courseAssignmentId={assignmentId} academicPeriodId={periodId} />
          <ReinforcementPlansList
            courseAssignmentId={assignmentId}
            academicPeriodId={periodId}
            parallelId={selectedAssignment?.parallel?.id}
          />
        </div>
      )}
    </div>
  )
}
