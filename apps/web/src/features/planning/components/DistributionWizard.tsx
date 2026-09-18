import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles, Pencil } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { useAiEnabled, useDraftSituationBlock } from '@/features/ai-assistant/hooks/useAiAssistant'
import {
  useCompetenciesForSubject,
  useSaberesForCompetency,
} from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import { useSuggestDistribution, useConfirmDistribution } from '../hooks/usePlanning'
import { CheckBox } from './SkillAndSaberSelector'
import type { DistributionSaber, SuggestedWeekDistribution } from '../api/planning.api'

const SABER_TYPE_LABEL: Record<'declarativo' | 'procedimental' | 'actitudinal', string> = {
  declarativo: 'Declarativo',
  procedimental: 'Procedimental',
  actitudinal: 'Actitudinal',
}

interface DistributionWizardProps {
  courseAssignmentId: string
  academicYearId: string
  subjectId: string | undefined
  subnivel: string | undefined
  /** Level.code real (ej. "6B") — filtra los saberes al reemplazar competencia por granularidad TIGA (ver CompetencySaber.gradeCodes). */
  gradeCode: string | undefined
}

/**
 * Reemplaza la creación manual de "situación de aprendizaje" — el docente ya
 * eligió materia+grado (CourseAssignment). Aquí solo elige el periodo y
 * cuántas semanas dura, ve la sugerencia automática de competencias/saberes
 * por semana, la ajusta si quiere (incluyendo reemplazar la competencia
 * sugerida de una semana por otra del banco), y confirma — solo entonces se
 * genera el resto de la planificación (actividades, recursos, evaluación).
 */
export function DistributionWizard({ courseAssignmentId, academicYearId, subjectId, subnivel, gradeCode }: DistributionWizardProps) {
  const navigate = useNavigate()
  const aiEnabled = useAiEnabled()
  const { data: periods = [] } = usePeriods(academicYearId)
  const suggestDistribution = useSuggestDistribution()
  const confirmDistribution = useConfirmDistribution()
  const draftBlock = useDraftSituationBlock()
  const { data: competencyBank = [] } = useCompetenciesForSubject(subjectId, subnivel)

  const [academicPeriodId, setAcademicPeriodId] = React.useState('')
  const [weeksCount, setWeeksCount] = React.useState('')
  const [suggestion, setSuggestion] = React.useState<SuggestedWeekDistribution[] | null>(null)
  const [coverageWarning, setCoverageWarning] = React.useState<string | undefined>()
  const [weeksCountWarning, setWeeksCountWarning] = React.useState<string | undefined>()
  const [changingWeekNumber, setChangingWeekNumber] = React.useState<number | null>(null)

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

  /** Reemplaza la competencia de una semana por otra del banco — preselecciona TODOS sus saberes (mismo criterio que la sugerencia automática original), el docente puede luego destildar los que no quiera. */
  const replaceWeekCompetency = (weekNumber: number, competencyId: string, competencyCode: string, competencyText: string, sabers: DistributionSaber[]) => {
    setSuggestion((prev) =>
      prev
        ? prev.map((w) =>
            w.weekNumber === weekNumber
              ? { ...w, competencyId, competencyCode, competencyText, sabers, saberIds: sabers.map((s) => s.id) }
              : w,
          )
        : prev,
    )
    setChangingWeekNumber(null)
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
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">
                    Semana {week.weekNumber} —{' '}
                    <span className="font-mono text-xs text-muted-foreground">{week.competencyCode}</span> {week.competencyText}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 shrink-0 px-2 text-xs"
                    onClick={() => setChangingWeekNumber(changingWeekNumber === week.weekNumber ? null : week.weekNumber)}
                  >
                    <Pencil className="h-3 w-3" />
                    Cambiar competencia
                  </Button>
                </div>

                {changingWeekNumber === week.weekNumber && (
                  <CompetencyReplacePicker
                    bank={competencyBank}
                    currentCompetencyId={week.competencyId}
                    gradeCode={gradeCode}
                    onPick={(competencyId, code, text, sabers) => replaceWeekCompetency(week.weekNumber, competencyId, code, text, sabers)}
                    onCancel={() => setChangingWeekNumber(null)}
                  />
                )}

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

/** Selector inline para reemplazar la competencia de una semana por otra del banco completo de la materia. */
function CompetencyReplacePicker({
  bank,
  currentCompetencyId,
  gradeCode,
  onPick,
  onCancel,
}: {
  bank: { id: string; code: string; text: string }[]
  currentCompetencyId: string
  gradeCode: string | undefined
  onPick: (competencyId: string, code: string, text: string, sabers: DistributionSaber[]) => void
  onCancel: () => void
}) {
  const [pendingId, setPendingId] = React.useState('')
  const { data: sabers = [], isFetching } = useSaberesForCompetency(pendingId || undefined, gradeCode)

  React.useEffect(() => {
    if (pendingId && !isFetching) {
      const competency = bank.find((c) => c.id === pendingId)
      if (competency) onPick(pendingId, competency.code, competency.text, sabers)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo disparar cuando termina de cargar el pending elegido
  }, [pendingId, isFetching])

  return (
    <div className="mt-2 flex items-center gap-2 rounded border bg-muted/30 p-2">
      <Select value={pendingId} onValueChange={setPendingId} disabled={isFetching}>
        <SelectTrigger className="h-8 flex-1 text-xs">
          <SelectValue placeholder="Elige otra competencia del banco..." />
        </SelectTrigger>
        <SelectContent>
          {bank.map((c) => (
            <SelectItem key={c.id} value={c.id} disabled={c.id === currentCompetencyId}>
              <span className="font-mono text-xs">{c.code}</span> {c.text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
  )
}
