import * as React from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ClipboardCheck, Download, HeartHandshake } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { getErrorMessage } from '@/shared/lib/utils'
import { listEnrollments } from '@/features/enrollment/api/enrollment.api'
import {
  listReinforcementPlans,
  updateReinforcementPlan,
  createReinforcementPlan,
  openReinforcementPlanPdf,
  type ReinforcementPlan,
} from '../api/pedagogic-recovery.api'

interface ReinforcementPlansListProps {
  courseAssignmentId: string
  academicPeriodId: string
  /** Necesario para detectar estudiantes con adaptación NEE marcada en su matrícula. */
  parallelId?: string
}

const STATUS_LABEL: Record<ReinforcementPlan['status'], { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  activo: { label: 'Activo', variant: 'warning' },
  cerrado: { label: 'Cerrado', variant: 'success' },
}

/** Lista los planes de refuerzo/adaptación ya creados para este curso+periodo, con edición rápida y PDF. */
export function ReinforcementPlansList({ courseAssignmentId, academicPeriodId, parallelId }: ReinforcementPlansListProps) {
  const qc = useQueryClient()

  const { data: plans = [] } = useQuery({
    queryKey: ['reinforcement-plans', courseAssignmentId, academicPeriodId],
    queryFn: () => listReinforcementPlans({ courseAssignmentId, academicPeriodId }),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })

  const { data: enrollments = [] } = useQuery({
    queryKey: ['enrollments-for-nee', parallelId],
    queryFn: () => listEnrollments({ parallelId: parallelId! }),
    enabled: !!parallelId,
  })
  const studentsWithPlan = new Set(plans.map((p) => p.studentId))
  const neeCandidates = enrollments.filter((e) => e.hasAdaptation && !studentsWithPlan.has(e.student.id))

  const createNeePlan = useMutation({
    mutationFn: createReinforcementPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reinforcement-plans', courseAssignmentId, academicPeriodId] })
      toast.success('Plan de adaptación NEE creado — complétalo abajo')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (plans.length === 0 && neeCandidates.length === 0) return null

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Planes de refuerzo / adaptación individualizados</h3>
      </div>

      {neeCandidates.length > 0 && (
        <div className="rounded border border-violet-200 bg-violet-50/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-violet-900">
            <HeartHandshake className="h-4 w-4" />
            Estudiantes con adaptación curricular (NEE) sin plan
          </div>
          <div className="flex flex-wrap gap-1.5">
            {neeCandidates.map((e) => (
              <Button
                key={e.id}
                type="button"
                size="sm"
                variant="outline"
                className="border-violet-300 text-violet-900 hover:bg-violet-100"
                loading={createNeePlan.isPending}
                onClick={() =>
                  createNeePlan.mutate({
                    studentId: e.student.id,
                    courseAssignmentId,
                    academicPeriodId,
                    planType: 'nee',
                  })
                }
              >
                + Plan NEE: {e.student.profile.firstName} {e.student.profile.lastName}
              </Button>
            ))}
          </div>
        </div>
      )}

      {plans.length > 0 && (
        <div className="space-y-2">
          {plans.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </div>
      )}
    </Card>
  )
}

function PlanRow({ plan }: { plan: ReinforcementPlan }) {
  const qc = useQueryClient()
  const [expanded, setExpanded] = React.useState(false)
  const [objetivo, setObjetivo] = React.useState(plan.objetivoGeneral ?? '')
  const [estrategias, setEstrategias] = React.useState(plan.estrategias ?? '')
  const [responsables, setResponsables] = React.useState(plan.responsables ?? '')

  const update = useMutation({
    mutationFn: (data: Parameters<typeof updateReinforcementPlan>[1]) => updateReinforcementPlan(plan.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reinforcement-plans'] })
      toast.success('Plan actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const studentName = `${plan.student.profile.firstName} ${plan.student.profile.lastName}`

  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
      >
        <span className="flex-1 font-medium">{studentName}</span>
        <span className="text-xs text-muted-foreground">
          {plan.planType === 'nee' ? 'NEE' : 'Académico'} · {plan.skills.length} destreza(s)
        </span>
        <Badge variant={STATUS_LABEL[plan.status].variant}>{STATUS_LABEL[plan.status].label}</Badge>
      </button>

      {expanded && (
        <div className="space-y-3 border-t p-3">
          {plan.skills.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {plan.skills.map((s) => (
                <span key={s.curriculumSkill.id} className="rounded-full bg-muted px-2 py-0.5 text-xs">
                  {s.curriculumSkill.code}
                  {s.averageAtDetection != null ? ` · ${s.averageAtDetection.toFixed(2)}` : ''}
                </span>
              ))}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Objetivo general</Label>
            <textarea
              rows={2}
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Estrategias</Label>
            <textarea
              rows={2}
              value={estrategias}
              onChange={(e) => setEstrategias(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Responsables</Label>
            <textarea
              rows={1}
              value={responsables}
              onChange={(e) => setResponsables(e.target.value)}
              className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => openReinforcementPlanPdf(plan.id)}>
              <Download className="h-4 w-4" />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => update.mutate({ objetivoGeneral: objetivo, estrategias, responsables, status: 'activo' })}
              loading={update.isPending}
            >
              Guardar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
