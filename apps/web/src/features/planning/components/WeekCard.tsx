import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useAiEnabled, useDraftWeek, useDraftCompetencyWeek } from '@/features/ai-assistant/hooks/useAiAssistant'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { useUpdateWeek, useDeleteWeek } from '../hooks/usePlanning'
import type { PlanningMomentos, PlanningWeek } from '../api/planning.api'
import { SkillAndSaberSelector } from './SkillAndSaberSelector'
import { CompetencyAndSaberSelector } from './CompetencyAndSaberSelector'
import { CurricularInsertionSuggestions } from '@/features/curricular-insertions/components/CurricularInsertionSuggestions'

const MOMENT_KEYS = [
  { key: 'anticipacion' as const, label: 'Anticipación' },
  { key: 'construccionConocimiento' as const, label: 'Construcción del Conocimiento' },
  { key: 'consolidacion' as const, label: 'Consolidación' },
]

interface WeekCardProps {
  week: PlanningWeek
  situationId: string
  subjectId: string | undefined
  subnivel: string | undefined
  isEditable: boolean
  expanded: boolean
  onToggle: () => void
}

export function WeekCard({ week, situationId, subjectId, subnivel, isEditable, expanded, onToggle }: WeekCardProps) {
  const qc = useQueryClient()
  const updateWeek = useUpdateWeek(week.id, situationId)
  const deleteWeek = useDeleteWeek(situationId)
  const draftWeek = useDraftWeek()
  const draftCompetencyWeek = useDraftCompetencyWeek()
  const aiEnabled = useAiEnabled()
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'

  const [name, setName] = React.useState(week.name ?? '')
  const [competencias, setCompetencias] = React.useState(week.competenciasEspecificas ?? '')
  const [indicadores, setIndicadores] = React.useState(week.indicadoresEvaluacion ?? '')
  const [skillIds, setSkillIds] = React.useState<string[]>(week.skillIds)
  const [saberIds, setSaberIds] = React.useState<string[]>(week.saberIds)
  const [competencyIds, setCompetencyIds] = React.useState<string[]>(week.competencyIds)
  const [competencySaberIds, setCompetencySaberIds] = React.useState<string[]>(week.competencySaberIds)
  const [momentos, setMomentos] = React.useState<PlanningMomentos>(week.momentos ?? {})
  const [lastGenerationMode, setLastGenerationMode] = React.useState<'AI_ENHANCED' | 'AI_FALLBACK' | null>(null)

  const handleGenerateWithAi = () => {
    if (isCompetencyModel) {
      draftCompetencyWeek.mutate(
        { situationId, competencyIds, weekName: name || undefined },
        {
          onSuccess: (result) => {
            setIndicadores(result.indicadoresEvaluacion)
            setMomentos(result.momentos)
            setLastGenerationMode(result.generationMode)
            setCompetencySaberIds((prev) => [
              ...new Set([...prev, ...result.reusedSaberIds, ...result.newSabers.map((s) => s.id)]),
            ])
            for (const competencyId of competencyIds) {
              qc.invalidateQueries({ queryKey: ['competency-saberes', competencyId] })
            }
          },
        },
      )
      return
    }
    draftWeek.mutate(
      { situationId, skillIds, weekName: name || undefined },
      {
        onSuccess: (result) => {
          setCompetencias(result.competenciasEspecificas)
          setIndicadores(result.indicadoresEvaluacion)
          setMomentos(result.momentos)
          setSaberIds((prev) => [
            ...new Set([...prev, ...result.reusedSaberIds, ...result.newSabers.map((s) => s.id)]),
          ])
          // los saberes nuevos que creó la IA aún no están en el cache de useSaberesForSkill
          for (const skillId of skillIds) {
            qc.invalidateQueries({ queryKey: ['curriculum-saberes', skillId] })
          }
        },
      },
    )
  }

  const setMoment = (momentKey: keyof PlanningMomentos, field: string, value: string) => {
    setMomentos((prev) => ({ ...prev, [momentKey]: { ...prev[momentKey], [field]: value } }))
  }

  const handleSave = () => {
    updateWeek.mutate({
      name: name || undefined,
      competenciasEspecificas: competencias,
      indicadoresEvaluacion: indicadores,
      skillIds,
      saberIds,
      competencyIds,
      competencySaberIds,
      momentos,
    })
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="flex-1 font-medium">
          Semana {week.weekNumber}
          {week.name ? ` — ${week.name}` : ''}
        </span>
        <span className="text-xs text-muted-foreground">
          {isCompetencyModel ? `${week.competencyIds.length} competencia(s)` : `${week.skillIds.length} destreza(s)`}
        </span>
      </button>

      {expanded && (
        <div className="space-y-5 border-t px-4 py-4">
          <div className="space-y-1.5">
            <Label>Nombre (opcional)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!isEditable} placeholder="Ej: Textos orales informativos" />
          </div>

          {!isCompetencyModel && (
            <div className="space-y-1.5">
              <Label>Competencias específicas</Label>
              <textarea
                rows={2}
                value={competencias}
                onChange={(e) => setCompetencias(e.target.value)}
                disabled={!isEditable}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Indicadores de evaluación</Label>
            <textarea
              rows={2}
              value={indicadores}
              onChange={(e) => setIndicadores(e.target.value)}
              disabled={!isEditable}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
            />
          </div>

          {isCompetencyModel ? (
            <CompetencyAndSaberSelector
              subjectId={subjectId}
              subnivel={subnivel}
              competencyIds={competencyIds}
              saberIds={competencySaberIds}
              onCompetencyIdsChange={setCompetencyIds}
              onSaberIdsChange={setCompetencySaberIds}
              isEditable={isEditable}
            />
          ) : (
            <SkillAndSaberSelector
              subjectId={subjectId}
              subnivel={subnivel}
              skillIds={skillIds}
              saberIds={saberIds}
              onSkillIdsChange={setSkillIds}
              onSaberIdsChange={setSaberIds}
              isEditable={isEditable}
            />
          )}

          <CurricularInsertionSuggestions
            subjectId={subjectId}
            subnivel={subnivel}
            itemIds={isCompetencyModel ? competencyIds : skillIds}
            kind={isCompetencyModel ? 'competency' : 'skill'}
          />

          {isEditable && aiEnabled && (
            <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {isCompetencyModel
                    ? 'Genera indicadores, saberes y los 3 momentos DUA a partir de las competencias seleccionadas.'
                    : 'Genera competencias, indicadores, saberes y los 3 momentos DUA a partir de las destrezas seleccionadas.'}
                </p>
                {lastGenerationMode === 'AI_FALLBACK' && (
                  <Badge variant="warning" className="mt-1">
                    Generado por reglas (la IA no validó) — revisa y ajusta
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleGenerateWithAi}
                disabled={isCompetencyModel ? competencyIds.length === 0 : skillIds.length === 0}
                loading={isCompetencyModel ? draftCompetencyWeek.isPending : draftWeek.isPending}
              >
                <Sparkles className="h-4 w-4" />
                Generar borrador con IA
              </Button>
            </div>
          )}

          <div className="space-y-3">
            <Label>Momentos metodológicos</Label>
            {MOMENT_KEYS.map(({ key, label }) => (
              <div key={key} className="rounded border p-3">
                <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Estrategias DUA</Label>
                    <textarea
                      rows={2}
                      value={momentos[key]?.estrategiasDua ?? ''}
                      onChange={(e) => setMoment(key, 'estrategiasDua', e.target.value)}
                      disabled={!isEditable}
                      className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Recursos</Label>
                    <textarea
                      rows={2}
                      value={momentos[key]?.recursos ?? ''}
                      onChange={(e) => setMoment(key, 'recursos', e.target.value)}
                      disabled={!isEditable}
                      className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Técnica</Label>
                    <Input
                      value={momentos[key]?.tecnica ?? ''}
                      onChange={(e) => setMoment(key, 'tecnica', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Instrumento</Label>
                    <Input
                      value={momentos[key]?.instrumento ?? ''}
                      onChange={(e) => setMoment(key, 'instrumento', e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {isEditable && (
            <div className="flex justify-between border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => confirm('¿Eliminar esta semana?') && deleteWeek.mutate(week.id)}
                loading={deleteWeek.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar
              </Button>
              <Button onClick={handleSave} loading={updateWeek.isPending}>
                <Save className="h-4 w-4" />
                Guardar semana
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

