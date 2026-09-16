import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Check, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'
import { useAiEnabled, useDraftWeek, useDraftCompetencyWeek } from '@/features/ai-assistant/hooks/useAiAssistant'
import type { DraftCompetencyWeekResult, DraftWeekResult } from '@/features/ai-assistant/api/ai-assistant.api'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { useUpdateWeek, useDeleteWeek } from '../hooks/usePlanning'
import type { PlanningMomentos, PlanningWeek } from '../api/planning.api'
import { SkillAndSaberSelector } from './SkillAndSaberSelector'
import { CompetencyAndSaberSelector } from './CompetencyAndSaberSelector'
import { CurricularInsertionSuggestions } from '@/features/curricular-insertions/components/CurricularInsertionSuggestions'

type Stage = 'select' | 'review' | 'editing'

const REVIEW_TABS = [
  { key: 'summary' as const, label: 'Resumen' },
  { key: 'methodology' as const, label: 'Metodología' },
  { key: 'assessment' as const, label: 'Evaluación' },
]

const MOMENT_KEYS = [
  { key: 'anticipacion' as const, label: 'Anticipación' },
  { key: 'construccionConocimiento' as const, label: 'Construcción del Conocimiento' },
  { key: 'consolidacion' as const, label: 'Consolidación' },
]

const URL_PATTERN = /https?:\/\/\S+/

/** El campo "recursos" es texto libre — cuando la IA embebió un link real (búsqueda
 * web o ficha generada), se muestra como enlace clicable debajo del texto. */
function ResourceLinkPreview({ text }: { text: string | undefined }) {
  const match = text?.match(URL_PATTERN)
  if (!match) return null
  const url = match[0].replace(/[.,;:]+$/, '')
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block text-xs text-primary underline hover:text-primary/80"
    >
      Abrir recurso ↗
    </a>
  )
}

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

  // Flujo "mínimo esfuerzo" (estilo TIGA, 3 etapas): 'select' (solo elegir destreza/
  // competencia y disparar la IA) -> 'review' (propuesta en solo lectura, como las
  // pestañas Resumen/Metodología/Evaluación de TIGA — nada editable todavía) ->
  // 'editing' (tras aprobar, se aplican los valores generados a los campos editables
  // de siempre). Si la IA no está habilitada, se salta directo a 'editing' porque no
  // hay nada que generar ni revisar.
  const hadContentAlready = !!(
    week.indicadoresEvaluacion?.trim() ||
    Object.values(week.momentos ?? {}).some(
      (m) => m?.estrategiasDua?.trim() || m?.recursos?.trim() || m?.tecnica?.trim() || m?.instrumento?.trim(),
    )
  )
  const [stage, setStage] = React.useState<Stage>(!aiEnabled || hadContentAlready ? 'editing' : 'select')
  const [pendingResult, setPendingResult] = React.useState<DraftWeekResult | DraftCompetencyWeekResult | null>(null)
  const [reviewTab, setReviewTab] = React.useState<(typeof REVIEW_TABS)[number]['key']>('summary')
  const selectedCount = isCompetencyModel ? competencyIds.length : skillIds.length

  const handleGenerateWithAi = () => {
    if (isCompetencyModel) {
      draftCompetencyWeek.mutate(
        { situationId, competencyIds, weekName: name || undefined },
        {
          onSuccess: (result) => {
            setPendingResult(result)
            setLastGenerationMode(result.generationMode)
            setStage('review')
            setReviewTab('summary')
          },
        },
      )
      return
    }
    draftWeek.mutate(
      { situationId, skillIds, weekName: name || undefined },
      {
        onSuccess: (result) => {
          setPendingResult(result)
          setStage('review')
          setReviewTab('summary')
        },
      },
    )
  }

  const handleApproveAndEdit = () => {
    if (!pendingResult) return
    if (isCompetencyModel) {
      const result = pendingResult as DraftCompetencyWeekResult
      setIndicadores(result.indicadoresEvaluacion)
      setMomentos(result.momentos)
      setCompetencySaberIds((prev) => [
        ...new Set([...prev, ...result.reusedSaberIds, ...result.newSabers.map((s) => s.id)]),
      ])
      for (const competencyId of competencyIds) {
        qc.invalidateQueries({ queryKey: ['competency-saberes', competencyId] })
      }
    } else {
      const result = pendingResult as DraftWeekResult
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
    }
    setPendingResult(null)
    setStage('editing')
  }

  const handleDiscardAndRetry = () => {
    setPendingResult(null)
    setStage('select')
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

          {isEditable && aiEnabled && stage === 'select' && (
            <div className="flex flex-col items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-4 py-5 text-center">
              <p className="text-sm text-muted-foreground">
                {selectedCount === 0
                  ? `Selecciona al menos una ${isCompetencyModel ? 'competencia' : 'destreza'} arriba para generar el resto de la semana automáticamente.`
                  : `Con ${selectedCount} ${isCompetencyModel ? 'competencia(s)' : 'destreza(s)'} seleccionada(s), la IA genera ${isCompetencyModel ? 'indicadores, saberes' : 'competencias específicas, indicadores, saberes'} y los 3 momentos DUA — tú solo revisas y ajustas.`}
              </p>
              <Button type="button" size="lg" onClick={handleGenerateWithAi} disabled={selectedCount === 0} loading={isCompetencyModel ? draftCompetencyWeek.isPending : draftWeek.isPending}>
                <Sparkles className="h-4 w-4" />
                Generar semana con IA
              </Button>
              <button type="button" onClick={() => setStage('editing')} className="text-xs text-muted-foreground underline hover:text-foreground">
                Prefiero llenarlo manualmente
              </button>
            </div>
          )}

          {stage === 'review' && pendingResult && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-primary">Propuesta generada — revisa antes de editar</p>
                {lastGenerationMode === 'AI_FALLBACK' && (
                  <Badge variant="warning">Generado por reglas (la IA no validó)</Badge>
                )}
              </div>

              <div className="flex gap-1 border-b">
                {REVIEW_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setReviewTab(tab.key)}
                    className={cn(
                      'px-3 py-1.5 text-sm font-medium transition',
                      reviewTab === tab.key
                        ? 'border-b-2 border-primary text-primary'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-24 rounded bg-white p-3 text-sm">
                {reviewTab === 'summary' && (
                  <div className="space-y-2">
                    {!isCompetencyModel && (pendingResult as DraftWeekResult).competenciasEspecificas && (
                      <p><span className="font-medium">Competencias específicas: </span>{(pendingResult as DraftWeekResult).competenciasEspecificas}</p>
                    )}
                    <p><span className="font-medium">Indicadores de evaluación: </span>{pendingResult.indicadoresEvaluacion}</p>
                    <p className="text-xs text-muted-foreground">
                      {pendingResult.newSabers.length} saber(es) nuevo(s) propuesto(s), {pendingResult.reusedSaberIds.length} reusado(s) del banco.
                    </p>
                  </div>
                )}
                {reviewTab === 'methodology' && (
                  <div className="space-y-2">
                    {(['anticipacion', 'construccionConocimiento', 'consolidacion'] as const).map((key) => (
                      <div key={key}>
                        <p className="text-xs font-semibold uppercase text-muted-foreground">{MOMENT_KEYS.find((m) => m.key === key)?.label}</p>
                        <p>{pendingResult.momentos[key]?.estrategiasDua}</p>
                        <p className="text-xs text-muted-foreground">Recursos: {pendingResult.momentos[key]?.recursos}</p>
                        <ResourceLinkPreview text={pendingResult.momentos[key]?.recursos} />
                      </div>
                    ))}
                  </div>
                )}
                {reviewTab === 'assessment' && (
                  <div className="space-y-1">
                    <p><span className="font-medium">Técnica: </span>{pendingResult.momentos.consolidacion?.tecnica}</p>
                    <p><span className="font-medium">Instrumento: </span>{pendingResult.momentos.consolidacion?.instrumento}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={handleDiscardAndRetry}>
                  Descartar y volver a intentar
                </Button>
                <Button type="button" onClick={handleApproveAndEdit}>
                  <Check className="h-4 w-4" />
                  Aprobar y editar
                </Button>
              </div>
            </div>
          )}

          {isEditable && aiEnabled && stage === 'editing' && (
            <div className="flex items-center justify-between rounded-md border border-primary/20 bg-primary/5 px-3 py-2">
              <div>
                <p className="text-xs text-muted-foreground">
                  {isCompetencyModel
                    ? 'Genera indicadores, saberes y los 3 momentos DUA a partir de las competencias seleccionadas.'
                    : 'Genera competencias, indicadores, saberes y los 3 momentos DUA a partir de las destrezas seleccionadas.'}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={handleGenerateWithAi}
                disabled={selectedCount === 0}
                loading={isCompetencyModel ? draftCompetencyWeek.isPending : draftWeek.isPending}
              >
                <Sparkles className="h-4 w-4" />
                Regenerar con IA
              </Button>
            </div>
          )}

          {stage === 'editing' && (
            <>
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
                        <ResourceLinkPreview text={momentos[key]?.recursos} />
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
            </>
          )}

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

