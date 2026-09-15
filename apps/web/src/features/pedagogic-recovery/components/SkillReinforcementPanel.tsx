import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, ClipboardPlus } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  getSkillReinforcementCandidates,
  createReinforcementPlan,
  listReinforcementPlans,
} from '../api/pedagogic-recovery.api'

interface SkillReinforcementPanelProps {
  courseAssignmentId: string
  academicPeriodId: string
}

/**
 * Muestra los candidatos a refuerzo detectados automáticamente a partir de las
 * notas de actividades vinculadas a una destreza del banco curricular, con un
 * botón para crear el Plan de Refuerzo Individualizado de cada estudiante con
 * un solo clic (pre-llenado con la destreza y la nota que disparó la detección).
 */
export function SkillReinforcementPanel({ courseAssignmentId, academicPeriodId }: SkillReinforcementPanelProps) {
  const qc = useQueryClient()

  const { data: candidates = [], isLoading } = useQuery({
    queryKey: ['skill-reinforcement', courseAssignmentId, academicPeriodId],
    queryFn: () => getSkillReinforcementCandidates({ courseAssignmentId, academicPeriodId }),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })

  const { data: existingPlans = [] } = useQuery({
    queryKey: ['reinforcement-plans', courseAssignmentId, academicPeriodId],
    queryFn: () => listReinforcementPlans({ courseAssignmentId, academicPeriodId }),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })
  const studentsWithPlan = new Set(existingPlans.map((p) => p.studentId))

  const createPlan = useMutation({
    mutationFn: createReinforcementPlan,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reinforcement-plans', courseAssignmentId, academicPeriodId] })
      toast.success('Plan de refuerzo creado — complétalo desde la sección Recuperación')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (isLoading || candidates.length === 0) return null

  return (
    <Card className="space-y-3 border-amber-200 bg-amber-50/50 p-4">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-900">
          Refuerzo sugerido — detectado automáticamente por destreza
        </h3>
      </div>
      <div className="space-y-2">
        {candidates.map((c) => (
          <div key={c.curriculumSkillId ?? c.competencyId} className="rounded border border-amber-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm">
                <span className="font-mono text-xs text-muted-foreground">{c.skillCode}</span>{' '}
                {c.skillDescription}
              </p>
              <Badge variant="warning">{c.students.length} estudiante(s)</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.students.map((s) => {
                const hasPlan = studentsWithPlan.has(s.studentId)
                return (
                  <span
                    key={s.studentId}
                    className="flex items-center gap-1.5 rounded-full bg-amber-100 pl-2 pr-1 py-0.5 text-xs text-amber-900"
                  >
                    {s.studentName} · {s.average.toFixed(2)}
                    {hasPlan ? (
                      <Badge variant="success" className="ml-1">
                        Plan creado
                      </Badge>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-amber-900 hover:bg-amber-200"
                        title="Crear plan de refuerzo para este estudiante"
                        loading={createPlan.isPending}
                        onClick={() =>
                          createPlan.mutate({
                            studentId: s.studentId,
                            courseAssignmentId,
                            academicPeriodId,
                            planType: 'academico',
                            skills: [
                              {
                                curriculumSkillId: c.curriculumSkillId,
                                competencyId: c.competencyId,
                                averageAtDetection: s.average,
                              },
                            ],
                          })
                        }
                      >
                        <ClipboardPlus className="h-3 w-3" />
                      </Button>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-amber-800">
        Promedio bajo el umbral de aprobación en actividades vinculadas a esa destreza. Crea el plan de
        refuerzo individualizado con un clic, o registra una recuperación puntual desde "Recuperación".
      </p>
    </Card>
  )
}
