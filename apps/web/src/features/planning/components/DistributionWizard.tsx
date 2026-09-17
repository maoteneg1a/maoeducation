import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { useAiEnabled, useDraftSituationBlock } from '@/features/ai-assistant/hooks/useAiAssistant'
import { useSuggestDistribution, useConfirmDistribution } from '../hooks/usePlanning'
import { CheckBox } from './SkillAndSaberSelector'
import type { SuggestedWeekDistribution } from '../api/planning.api'

const SABER_TYPE_LABEL: Record<'declarativo' | 'procedimental' | 'actitudinal', string> = {
  declarativo: 'Declarativo',
  procedimental: 'Procedimental',
  actitudinal: 'Actitudinal',
}

interface DistributionWizardProps {
  courseAssignmentId: string
  academicYearId: string
}

/**
 * Reemplaza la creación manual de "situación de aprendizaje" — el docente ya
 * eligió materia+grado (CourseAssignment). Aquí solo elige el periodo y
 * cuántas semanas dura, ve la sugerencia automática de competencias/saberes
 * por semana, la ajusta si quiere, y confirma — solo entonces se genera el
 * resto de la planificación (actividades, recursos, evaluación).
 */
export function DistributionWizard({ courseAssignmentId, academicYearId }: DistributionWizardProps) {
  const navigate = useNavigate()
  const aiEnabled = useAiEnabled()
  const { data: periods = [] } = usePeriods(academicYearId)
  const suggestDistribution = useSuggestDistribution()
  const confirmDistribution = useConfirmDistribution()
  const draftBlock = useDraftSituationBlock()

  const [academicPeriodId, setAcademicPeriodId] = React.useState('')
  const [weeksCount, setWeeksCount] = React.useState('')
  const [suggestion, setSuggestion] = React.useState<SuggestedWeekDistribution[] | null>(null)
  const [coverageWarning, setCoverageWarning] = React.useState<string | undefined>()
  const [weeksCountWarning, setWeeksCountWarning] = React.useState<string | undefined>()

  const selectedPeriod = periods.find((p) => p.id === academicPeriodId)

  const handlePeriodChange = (id: string) => {
    setAcademicPeriodId(id)
    setSuggestion(null)
    if (!weeksCount) {
      suggestDistribution.mutate(
        { courseAssignmentId, academicPeriodId: id, weeksCount: 6 },
        { onSuccess: (result) => setWeeksCount(String(result.calendarWeeks)) },
      )
    }
  }

  const handleSuggest = () => {
    const count = Number(weeksCount)
    if (!academicPeriodId || !count || count < 2) return
    suggestDistribution.mutate(
      { courseAssignmentId, academicPeriodId, weeksCount: count },
      {
        onSuccess: (result) => {
          setSuggestion(result.weeks)
          setCoverageWarning(result.coverageWarning)
          setWeeksCountWarning(result.weeksCountWarning)
        },
      },
    )
  }

  const toggleSaber = (weekNumber: number, saberId: string) => {
    setSuggestion((prev) =>
      prev
        ? prev.map((w) =>
            w.weekNumber === weekNumber
              ? {
                  ...w,
                  saberIds: w.saberIds.includes(saberId) ? w.saberIds.filter((id) => id !== saberId) : [...w.saberIds, saberId],
                }
              : w,
          )
        : prev,
    )
  }

  const handleConfirm = () => {
    if (!suggestion || !academicPeriodId) return
    confirmDistribution.mutate(
      {
        courseAssignmentId,
        academicPeriodId,
        weeksCount: Number(weeksCount),
        weeks: suggestion.map((w) => ({ weekNumber: w.weekNumber, competencyId: w.competencyId, saberIds: w.saberIds })),
      },
      {
        onSuccess: (result) => {
          draftBlock.mutate(
            {
              situationId: result.situation.id,
              weeksCount: Number(weeksCount),
              competencyIds: [...new Set(suggestion.map((w) => w.competencyId))],
            },
            { onSuccess: () => navigate(`/planning/situations/${result.situation.id}`) },
          )
        },
      },
    )
  }

  if (!aiEnabled) return null

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium">Nueva planificación del periodo</p>
        <p className="text-xs text-muted-foreground">
          Elige el periodo y cuántas semanas dura — el sistema sugiere qué competencias y saberes corresponden a cada
          semana, y puedes ajustarlo antes de generar el resto.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Periodo académico</Label>
          <Select value={academicPeriodId} onValueChange={handlePeriodChange}>
            <SelectTrigger>
              <SelectValue placeholder="Trimestre / periodo" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Número de semanas</Label>
          <Input type="number" min={2} max={40} value={weeksCount} onChange={(e) => setWeeksCount(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={handleSuggest}
          disabled={!academicPeriodId || !weeksCount || Number(weeksCount) < 2}
          loading={suggestDistribution.isPending}
        >
          <Sparkles className="h-4 w-4" />
          Ver sugerencia
        </Button>
      </div>

      {weeksCountWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{weeksCountWarning}</span>
        </div>
      )}

      {suggestion && (
        <div className="space-y-3 border-t pt-4">
          {coverageWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{coverageWarning}</span>
            </div>
          )}
          <p className="text-sm font-medium">
            Sugerencia para {selectedPeriod?.name} ({suggestion.length} semana{suggestion.length === 1 ? '' : 's'})
          </p>
          <div className="space-y-2">
            {suggestion.map((week) => (
              <div key={week.weekNumber} className="rounded-md border p-3">
                <p className="text-sm font-medium">
                  Semana {week.weekNumber} —{' '}
                  <span className="font-mono text-xs text-muted-foreground">{week.competencyCode}</span> {week.competencyText}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {week.sabers.map((saber) => {
                    const selected = week.saberIds.includes(saber.id)
                    return (
                      <button
                        key={saber.id}
                        type="button"
                        onClick={() => toggleSaber(week.weekNumber, saber.id)}
                        className="flex items-center gap-1.5 rounded border px-2 py-1 text-left text-xs transition hover:bg-muted/50"
                        title={saber.description}
                      >
                        <CheckBox selected={selected} />
                        <span className="text-muted-foreground">[{SABER_TYPE_LABEL[saber.type]}]</span>
                        <span className="font-mono">{saber.code}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end border-t pt-3">
            <Button type="button" onClick={handleConfirm} loading={confirmDistribution.isPending || draftBlock.isPending}>
              <Sparkles className="h-4 w-4" />
              Confirmar y generar planificación
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
