import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Sparkles, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { useAiEnabled, useDraftSituationBlock } from '@/features/ai-assistant/hooks/useAiAssistant'
import { useSuggestDistribution, useConfirmDistribution } from '../hooks/usePlanning'
import { CompetencyAndSaberSelector } from './CompetencyAndSaberSelector'
import { useCompetenciesForSubject } from '@/features/competency-curriculum/hooks/useCompetencyCurriculum'
import type { SuggestedWeekDistribution } from '../api/planning.api'

interface DistributionWizardProps {
  courseAssignmentId: string
  academicYearId: string
  subjectId: string | undefined
  subnivel: string | undefined
  /** Level.code real (ej. "6B") — filtra los saberes al reemplazar competencia por granularidad TIGA (ver CompetencySaber.gradeCodes). */
  gradeCode: string | undefined
}

interface EditableWeek {
  weekNumber: number
  competencyIds: string[]
  saberIds: string[]
  /** Vacío (por defecto) = se derivan automáticamente todos los indicadores de las competencias al confirmar. */
  indicatorIds: string[]
}

let weekKeySeq = 0
function nextWeekKey() {
  return `w-${++weekKeySeq}`
}

/**
 * Reemplaza la creación manual de "situación de aprendizaje" — el docente ya
 * eligió materia+grado (CourseAssignment). Aquí elige el periodo y cuántas
 * semanas dura, ve la sugerencia automática ya PRE-CARGADA en una tabla
 * editable (nunca un preview de solo lectura aparte), y desde ahí puede
 * libremente agregar/quitar competencias por semana, tildar/destildar
 * saberes, y agregar o quitar semanas sueltas — solo al confirmar se genera
 * el resto de la planificación (actividades, recursos, evaluación).
 */
export function DistributionWizard({ courseAssignmentId, academicYearId, subjectId, subnivel, gradeCode }: DistributionWizardProps) {
  const navigate = useNavigate()
  const aiEnabled = useAiEnabled()
  const { data: periods = [] } = usePeriods(academicYearId)
  const suggestDistribution = useSuggestDistribution()
  const confirmDistribution = useConfirmDistribution()
  const draftBlock = useDraftSituationBlock()

  const [academicPeriodId, setAcademicPeriodId] = React.useState('')
  const [weeksCount, setWeeksCount] = React.useState('')
  const [coverageWarning, setCoverageWarning] = React.useState<string | undefined>()
  const [weeksCountWarning, setWeeksCountWarning] = React.useState<string | undefined>()
  const [weeks, setWeeks] = React.useState<(EditableWeek & { key: string })[] | null>(null)
  const [expandedKey, setExpandedKey] = React.useState<string | null>(null)
  // Mapa id->code de competencias — se completa con el banco (para las que el
  // docente agregue a mano) y con lo que ya trae la sugerencia (disponible
  // antes de que el banco cargue, para el resumen colapsado de cada semana).
  const [competencyCodes, setCompetencyCodes] = React.useState<Record<string, string>>({})
  const { data: competencyBank = [] } = useCompetenciesForSubject(subjectId, subnivel)
  React.useEffect(() => {
    if (competencyBank.length === 0) return
    setCompetencyCodes((prev) => {
      const next = { ...prev }
      for (const c of competencyBank) next[c.id] = c.code
      return next
    })
  }, [competencyBank])

  const selectedPeriod = periods.find((p) => p.id === academicPeriodId)

  const handlePeriodChange = (id: string) => {
    setAcademicPeriodId(id)
    setWeeks(null)
    if (!weeksCount) {
      suggestDistribution.mutate(
        { courseAssignmentId, academicPeriodId: id, weeksCount: 6 },
        { onSuccess: (result) => setWeeksCount(String(result.calendarWeeks)) },
      )
    }
  }

  const applySuggestion = (suggested: SuggestedWeekDistribution[]) => {
    const next = suggested.map((w) => ({
      key: nextWeekKey(),
      weekNumber: w.weekNumber,
      competencyIds: w.competencies.map((c) => c.competencyId),
      saberIds: w.competencies.flatMap((c) => c.saberIds),
      indicatorIds: [],
    }))
    setWeeks(next)
    setExpandedKey(next[0]?.key ?? null)
    setCompetencyCodes((prev) => {
      const codes = { ...prev }
      for (const w of suggested) for (const c of w.competencies) codes[c.competencyId] = c.competencyCode
      return codes
    })
  }

  const handleSuggest = () => {
    const count = Number(weeksCount)
    if (!academicPeriodId || !count || count < 2) return
    suggestDistribution.mutate(
      { courseAssignmentId, academicPeriodId, weeksCount: count },
      {
        onSuccess: (result) => {
          applySuggestion(result.weeks)
          setCoverageWarning(result.coverageWarning)
          setWeeksCountWarning(result.weeksCountWarning)
        },
      },
    )
  }

  const updateWeek = (key: string, patch: Partial<EditableWeek>) => {
    setWeeks((prev) => (prev ? prev.map((w) => (w.key === key ? { ...w, ...patch } : w)) : prev))
  }

  const addWeek = () => {
    const nextNumber = weeks && weeks.length > 0 ? Math.max(...weeks.map((w) => w.weekNumber)) + 1 : 1
    const key = nextWeekKey()
    setWeeks((prev) => [...(prev ?? []), { key, weekNumber: nextNumber, competencyIds: [], saberIds: [], indicatorIds: [] }])
    setExpandedKey(key)
  }

  const removeWeek = (key: string) => {
    setWeeks((prev) => (prev ? prev.filter((w) => w.key !== key) : prev))
  }

  const handleConfirm = () => {
    if (!weeks || weeks.length === 0 || !academicPeriodId) return
    confirmDistribution.mutate(
      {
        courseAssignmentId,
        academicPeriodId,
        weeksCount: weeks.length,
        weeks: weeks.map((w) => ({
          weekNumber: w.weekNumber,
          competencyIds: w.competencyIds,
          saberIds: w.saberIds,
          indicatorIds: w.indicatorIds.length ? w.indicatorIds : undefined,
        })),
      },
      {
        onSuccess: (result) => {
          draftBlock.mutate(
            {
              situationId: result.situation.id,
              weeksCount: weeks.length,
              competencyIds: [...new Set(weeks.flatMap((w) => w.competencyIds))],
            },
            { onSuccess: () => navigate(`/planning/situations/${result.situation.id}`) },
          )
        },
      },
    )
  }

  if (!aiEnabled) return null

  const canConfirm = !!weeks && weeks.length > 0 && weeks.every((w) => w.competencyIds.length > 0)

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium">Nueva planificación del periodo</p>
        <p className="text-xs text-muted-foreground">
          Elige el periodo y cuántas semanas dura — el sistema sugiere qué competencias y saberes corresponden a cada
          semana, ya pre-cargados abajo. Puedes agregar o quitar competencias/saberes/semanas libremente antes de confirmar.
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
          Generar sugerencia automática
        </Button>
      </div>

      {weeksCountWarning && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{weeksCountWarning}</span>
        </div>
      )}

      {weeks && (
        <div className="space-y-3 border-t pt-4">
          {coverageWarning && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{coverageWarning}</span>
            </div>
          )}
          <p className="text-sm font-medium">
            {selectedPeriod?.name} — {weeks.length} semana{weeks.length === 1 ? '' : 's'}
          </p>

          <div className="space-y-2">
            {weeks.map((week) => (
              <WeekRow
                key={week.key}
                week={week}
                competencyCodes={competencyCodes}
                expanded={expandedKey === week.key}
                onToggle={() => setExpandedKey(expandedKey === week.key ? null : week.key)}
                onChange={(patch) => updateWeek(week.key, patch)}
                onRemove={() => removeWeek(week.key)}
                subjectId={subjectId}
                subnivel={subnivel}
                gradeCode={gradeCode}
                canRemove={weeks.length > 1}
              />
            ))}
          </div>

          <Button type="button" variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 px-0" onClick={addWeek}>
            <Plus className="h-4 w-4 mr-1" /> Agregar semana
          </Button>

          <div className="flex justify-end border-t pt-3">
            <Button type="button" onClick={handleConfirm} disabled={!canConfirm} loading={confirmDistribution.isPending || draftBlock.isPending}>
              <Sparkles className="h-4 w-4" />
              Confirmar y generar planificación
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function WeekRow({
  week,
  competencyCodes,
  expanded,
  onToggle,
  onChange,
  onRemove,
  subjectId,
  subnivel,
  gradeCode,
  canRemove,
}: {
  week: EditableWeek & { key: string }
  competencyCodes: Record<string, string>
  expanded: boolean
  onToggle: () => void
  onChange: (patch: Partial<EditableWeek>) => void
  onRemove: () => void
  subjectId: string | undefined
  subnivel: string | undefined
  gradeCode: string | undefined
  canRemove: boolean
}) {
  return (
    <div className="rounded-md border">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-background px-3 py-2.5 rounded-t-md border-b data-[expanded=false]:border-b-0" data-expanded={expanded}>
        <button type="button" onClick={onToggle} className="flex flex-1 flex-wrap items-center gap-2 text-left">
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="text-base font-semibold">Semana {week.weekNumber}</span>
          {week.competencyIds.length === 0 ? (
            <span className="text-sm text-amber-700">sin competencia — elige al menos una</span>
          ) : (
            <>
              {week.competencyIds.map((id) => (
                <Badge key={id} variant="secondary" className="font-mono text-xs">
                  {competencyCodes[id] ?? '…'}
                </Badge>
              ))}
              <span className="text-xs text-muted-foreground">{week.saberIds.length} saber(es)</span>
            </>
          )}
        </button>
        {canRemove && (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground" onClick={onRemove}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {expanded && (
        <div className="space-y-3 p-3">
          <CompetencyAndSaberSelector
            subjectId={subjectId}
            subnivel={subnivel}
            gradeCode={gradeCode}
            competencyIds={week.competencyIds}
            saberIds={week.saberIds}
            indicatorIds={week.indicatorIds}
            onCompetencyIdsChange={(ids) => onChange({ competencyIds: ids })}
            onSaberIdsChange={(ids) => onChange({ saberIds: ids })}
            onIndicatorIdsChange={(ids) => onChange({ indicatorIds: ids })}
            isEditable
          />
        </div>
      )}
    </div>
  )
}
