import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Check, Save, Sparkles, Trash2, Plus, X } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'
import { useAiEnabled, useDraftWeek, useDraftCompetencyWeek } from '@/features/ai-assistant/hooks/useAiAssistant'
import type { DraftCompetencyWeekResult, DraftWeekResult, CompetencyWeekMomentos as AiCompetencyWeekMomentos } from '@/features/ai-assistant/api/ai-assistant.api'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { useUpdateWeek, useDeleteWeek } from '../hooks/usePlanning'
import type { PlanningMomentos, CompetencyPlanningMomentos, PlanningWeek } from '../api/planning.api'
import { SkillAndSaberSelector } from './SkillAndSaberSelector'
import { CompetencyAndSaberSelector } from './CompetencyAndSaberSelector'
import { CurricularInsertionSuggestions } from '@/features/curricular-insertions/components/CurricularInsertionSuggestions'

type Stage = 'select' | 'review' | 'editing'

const REVIEW_TABS = [
  { key: 'summary' as const, label: 'Resumen' },
  { key: 'methodology' as const, label: 'Metodología' },
  { key: 'assessment' as const, label: 'Evaluación' },
]

// Terminología del docente: "Inicio / Desarrollo / Cierre" — nunca "Anticipación
// / Construcción (del Conocimiento) / Consolidación". Las claves internas del
// modelo por DESTREZAS (anticipacion/construccionConocimiento/consolidacion)
// siguen igual en la BD/JSON — solo cambia la etiqueta que ve el docente.
const MOMENT_KEYS = [
  { key: 'anticipacion' as const, label: 'Inicio' },
  { key: 'construccionConocimiento' as const, label: 'Desarrollo' },
  { key: 'consolidacion' as const, label: 'Cierre' },
]

// El modelo por COMPETENCIAS ya usa estas claves directamente (fases.inicio/desarrollo/cierre).
const COMPETENCY_PHASES = [
  { key: 'inicio' as const, label: 'Inicio' },
  { key: 'desarrollo' as const, label: 'Desarrollo' },
  { key: 'cierre' as const, label: 'Cierre' },
]

const URL_PATTERN = /https?:\/\/\S+/

/** El campo "recursos" (modelo destrezas, texto libre) — cuando la IA embebió un link real, se muestra como enlace clicable debajo del texto. */
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

/** Link ya resuelto (modelo competencias) — objeto {title, url}, no texto embebido. */
function NamedLink({ link, label }: { link: { title: string; url: string } | undefined; label: string }) {
  if (!link) return null
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block text-xs font-medium text-primary underline hover:text-primary/80"
    >
      {label} ↗
    </a>
  )
}

/**
 * Igual que NamedLink pero editable — el docente puede no estar conforme con
 * el recurso/instrumento que generó la IA y necesita poner su propio link en
 * su lugar (o quitarlo del todo), sin depender de volver a generar la semana.
 */
function EditableNamedLink({
  link,
  label,
  isEditable,
  onChange,
}: {
  link: { title: string; url: string } | undefined
  label: string
  isEditable: boolean
  onChange: (link: { title: string; url: string } | undefined) => void
}) {
  const [editing, setEditing] = React.useState(false)
  const [title, setTitle] = React.useState(link?.title ?? '')
  const [url, setUrl] = React.useState(link?.url ?? '')

  if (!isEditable) return <NamedLink link={link} label={label} />

  if (editing) {
    return (
      <div className="mt-1 space-y-1.5 rounded border border-input p-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del recurso" className="h-7 text-xs" />
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs" />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={() => {
              onChange(url.trim() ? { title: title.trim() || label, url: url.trim() } : undefined)
              setEditing(false)
            }}
          >
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditing(false)}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-1 flex items-center gap-2">
      <NamedLink link={link} label={label} />
      <button
        type="button"
        onClick={() => {
          setTitle(link?.title ?? '')
          setUrl(link?.url ?? '')
          setEditing(true)
        }}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        {link ? 'Cambiar link' : `Agregar ${label.toLowerCase()}`}
      </button>
    </div>
  )
}

function emptyCompetencyMomentos(): CompetencyPlanningMomentos {
  return {
    fases: { inicio: { activities: [] }, desarrollo: { activities: [] }, cierre: { activities: [] } },
    recursos: [],
    evaluacion: { evidencia: '', criterio: '', instrumento: '' },
  }
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
  const [momentos, setMomentos] = React.useState<PlanningMomentos>(!isCompetencyModel ? (week.momentos as PlanningMomentos) ?? {} : {})
  const [competencyMomentos, setCompetencyMomentos] = React.useState<CompetencyPlanningMomentos>(
    isCompetencyModel ? ((week.momentos as CompetencyPlanningMomentos) ?? emptyCompetencyMomentos()) : emptyCompetencyMomentos(),
  )
  const [lastGenerationMode, setLastGenerationMode] = React.useState<'AI_ENHANCED' | 'AI_FALLBACK' | null>(null)

  // Flujo "mínimo esfuerzo" (estilo TIGA, 3 etapas): 'select' (solo elegir destreza/
  // competencia y disparar la IA) -> 'review' (propuesta en solo lectura, como las
  // pestañas Resumen/Metodología/Evaluación de TIGA — nada editable todavía) ->
  // 'editing' (tras aprobar, se aplican los valores generados a los campos editables
  // de siempre). Si la IA no está habilitada, se salta directo a 'editing' porque no
  // hay nada que generar ni revisar.
  const hadContentAlready = isCompetencyModel
    ? !!(
        week.indicadoresEvaluacion?.trim() ||
        COMPETENCY_PHASES.some((p) => ((week.momentos as CompetencyPlanningMomentos)?.fases?.[p.key]?.activities ?? []).length > 0)
      )
    : !!(
        week.indicadoresEvaluacion?.trim() ||
        Object.values((week.momentos as PlanningMomentos) ?? {}).some(
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
        { situationId, competencyIds, weekName: name || undefined, weekNumber: week.weekNumber },
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

  // "Regenerar solo actividades" — el docente ya tiene competencias/saberes/
  // indicadores elegidos y solo quiere que la IA vuelva a redactar Inicio/
  // Desarrollo/Cierre + recursos + evaluación con esos datos, sin proponer
  // saberes nuevos ni tocar lo que ya tiene. Usa el mismo endpoint (que
  // siempre devuelve todo junto), pero solo aplica el campo `momentos`.
  const handleRegenerateActivitiesOnly = () => {
    draftCompetencyWeek.mutate(
      { situationId, competencyIds, weekName: name || undefined, weekNumber: week.weekNumber },
      { onSuccess: (result) => setCompetencyMomentos(result.momentos as unknown as CompetencyPlanningMomentos) },
    )
  }

  const handleApproveAndEdit = () => {
    if (!pendingResult) return
    if (isCompetencyModel) {
      const result = pendingResult as DraftCompetencyWeekResult
      setIndicadores(result.indicadoresEvaluacion)
      setCompetencyMomentos(result.momentos as unknown as CompetencyPlanningMomentos)
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

  const setPhaseActivities = (phaseKey: 'inicio' | 'desarrollo' | 'cierre', activities: { text: string; duaCode: string }[]) => {
    setCompetencyMomentos((prev) => ({ ...prev, fases: { ...prev.fases, [phaseKey]: { activities } } }))
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
      momentos: isCompetencyModel ? competencyMomentos : momentos,
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
                  : `Con ${selectedCount} ${isCompetencyModel ? 'competencia(s)' : 'destreza(s)'} seleccionada(s), la IA genera ${isCompetencyModel ? 'indicadores, saberes' : 'competencias específicas, indicadores, saberes'} y las 3 fases (Inicio/Desarrollo/Cierre) — tú solo revisas y ajustas.`}
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
                {isCompetencyModel ? (
                  <CompetencyReviewTabContent
                    reviewTab={reviewTab}
                    result={pendingResult as DraftCompetencyWeekResult}
                  />
                ) : (
                  <>
                    {reviewTab === 'summary' && (
                      <div className="space-y-2">
                        {(pendingResult as DraftWeekResult).competenciasEspecificas && (
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
                            <p>{(pendingResult as DraftWeekResult).momentos[key]?.estrategiasDua}</p>
                            <p className="text-xs text-muted-foreground">Recursos: {(pendingResult as DraftWeekResult).momentos[key]?.recursos}</p>
                            <ResourceLinkPreview text={(pendingResult as DraftWeekResult).momentos[key]?.recursos} />
                          </div>
                        ))}
                      </div>
                    )}
                    {reviewTab === 'assessment' && (
                      <div className="space-y-1">
                        <p><span className="font-medium">Técnica: </span>{(pendingResult as DraftWeekResult).momentos.consolidacion?.tecnica}</p>
                        <p><span className="font-medium">Instrumento: </span>{(pendingResult as DraftWeekResult).momentos.consolidacion?.instrumento}</p>
                      </div>
                    )}
                  </>
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
                    ? 'Genera indicadores, saberes y las 3 fases (Inicio/Desarrollo/Cierre) a partir de las competencias seleccionadas.'
                    : 'Genera competencias, indicadores, saberes y las 3 fases (Inicio/Desarrollo/Cierre) a partir de las destrezas seleccionadas.'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isCompetencyModel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerateActivitiesOnly}
                    disabled={selectedCount === 0}
                    loading={draftCompetencyWeek.isPending}
                    title="Vuelve a redactar Inicio/Desarrollo/Cierre, recursos y evaluación sin tocar competencias/saberes/indicadores ya elegidos"
                  >
                    <Sparkles className="h-4 w-4" />
                    Regenerar solo actividades
                  </Button>
                )}
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

              {isCompetencyModel ? (
                <CompetencyMethodologyEditor
                  momentos={competencyMomentos}
                  isEditable={isEditable}
                  onPhaseChange={setPhaseActivities}
                  onResourcesChange={(recursos) => setCompetencyMomentos((prev) => ({ ...prev, recursos }))}
                  onEvaluacionChange={(field, value) =>
                    setCompetencyMomentos((prev) => ({ ...prev, evaluacion: { ...prev.evaluacion, [field]: value } }))
                  }
                  onRecursoLinkChange={(recursoLink) => setCompetencyMomentos((prev) => ({ ...prev, recursoLink }))}
                  onInstrumentoLinkChange={(instrumentoLink) =>
                    setCompetencyMomentos((prev) => ({ ...prev, evaluacion: { ...prev.evaluacion, instrumentoLink } }))
                  }
                />
              ) : (
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
              )}
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

/** Contenido de las 3 pestañas de revisión (Resumen/Metodología/Evaluación) para el modelo por competencias — solo lectura, calcado del formato final Inicio/Desarrollo/Cierre. */
function CompetencyReviewTabContent({
  reviewTab,
  result,
}: {
  reviewTab: (typeof REVIEW_TABS)[number]['key']
  result: DraftCompetencyWeekResult
}) {
  const m = result.momentos as unknown as AiCompetencyWeekMomentos
  if (reviewTab === 'summary') {
    return (
      <div className="space-y-2">
        <p><span className="font-medium">Indicadores de evaluación: </span>{result.indicadoresEvaluacion}</p>
        <p className="text-xs text-muted-foreground">
          {result.newSabers.length} saber(es) nuevo(s) propuesto(s), {result.reusedSaberIds.length} reusado(s) del banco.
        </p>
      </div>
    )
  }
  if (reviewTab === 'methodology') {
    return (
      <div className="space-y-3">
        {COMPETENCY_PHASES.map(({ key, label }) => (
          <div key={key}>
            <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <ol className="ml-4 list-decimal space-y-1">
              {(m.fases[key]?.activities ?? []).map((a, i) => (
                <li key={i}>
                  {a.text} <span className="text-xs font-mono text-muted-foreground">DUA: [{a.duaCode}]</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">Recursos</p>
          <ul className="ml-4 list-disc">
            {m.recursos.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
          <NamedLink link={m.recursoLink} label="Abrir recurso" />
        </div>
      </div>
    )
  }
  return (
    <div className="space-y-1">
      <p><span className="font-medium">Evidencia: </span>{m.evaluacion.evidencia}</p>
      <p><span className="font-medium">Criterio: </span>{m.evaluacion.criterio}</p>
      <p><span className="font-medium">Instrumento: </span>{m.evaluacion.instrumento}</p>
      <NamedLink link={m.evaluacion.instrumentoLink} label="Abrir instrumento" />
    </div>
  )
}

/** Editor manual del modelo por competencias — N actividades numeradas por fase (cada una con su código DUA), recursos en lista, y evaluación consolidada una vez por semana. */
function CompetencyMethodologyEditor({
  momentos,
  isEditable,
  onPhaseChange,
  onResourcesChange,
  onEvaluacionChange,
  onRecursoLinkChange,
  onInstrumentoLinkChange,
}: {
  momentos: CompetencyPlanningMomentos
  isEditable: boolean
  onPhaseChange: (phaseKey: 'inicio' | 'desarrollo' | 'cierre', activities: { text: string; duaCode: string }[]) => void
  onResourcesChange: (recursos: string[]) => void
  onEvaluacionChange: (field: 'evidencia' | 'criterio' | 'instrumento', value: string) => void
  onRecursoLinkChange: (link: { title: string; url: string } | undefined) => void
  onInstrumentoLinkChange: (link: { title: string; url: string } | undefined) => void
}) {
  const recursosText = (momentos.recursos ?? []).join('\n')

  return (
    <div className="space-y-3">
      <Label>Metodología (Inicio / Desarrollo / Cierre)</Label>
      {COMPETENCY_PHASES.map(({ key, label }) => {
        const activities = momentos.fases[key]?.activities ?? []
        return (
          <div key={key} className="rounded border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{label}</p>
            <div className="space-y-2">
              {activities.map((activity, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="mt-2 text-xs text-muted-foreground">{i + 1}.</span>
                  <div className="flex-1 space-y-1">
                    <textarea
                      rows={2}
                      value={activity.text}
                      onChange={(e) => {
                        const next = [...activities]
                        next[i] = { ...next[i], text: e.target.value }
                        onPhaseChange(key, next)
                      }}
                      disabled={!isEditable}
                      placeholder="Actividad..."
                      className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
                    />
                    <Input
                      value={activity.duaCode}
                      onChange={(e) => {
                        const next = [...activities]
                        next[i] = { ...next[i], duaCode: e.target.value }
                        onPhaseChange(key, next)
                      }}
                      disabled={!isEditable}
                      placeholder="Código DUA (ej: I.3.1)"
                      className="h-7 text-xs"
                    />
                  </div>
                  {isEditable && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-1 h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => onPhaseChange(key, activities.filter((_, idx) => idx !== i))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {isEditable && (
                <button
                  type="button"
                  onClick={() => onPhaseChange(key, [...activities, { text: '', duaCode: '' }])}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-3 w-3" />
                  Agregar actividad
                </button>
              )}
            </div>
          </div>
        )
      })}

      <div className="rounded border p-3">
        <Label className="text-xs">Recursos de la semana (uno por línea)</Label>
        <textarea
          rows={3}
          value={recursosText}
          onChange={(e) => onResourcesChange(e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
          disabled={!isEditable}
          className="mt-1 flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
        />
        <EditableNamedLink link={momentos.recursoLink} label="Abrir recurso" isEditable={isEditable} onChange={onRecursoLinkChange} />
      </div>

      <div className="rounded border p-3">
        <Label className="text-xs">Evaluación de la semana</Label>
        <div className="mt-1 space-y-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Evidencia</Label>
            <textarea
              rows={2}
              value={momentos.evaluacion?.evidencia ?? ''}
              onChange={(e) => onEvaluacionChange('evidencia', e.target.value)}
              disabled={!isEditable}
              className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Criterio (código de indicador)</Label>
            <Input
              value={momentos.evaluacion?.criterio ?? ''}
              onChange={(e) => onEvaluacionChange('criterio', e.target.value)}
              disabled={!isEditable}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Instrumento</Label>
            <Input
              value={momentos.evaluacion?.instrumento ?? ''}
              onChange={(e) => onEvaluacionChange('instrumento', e.target.value)}
              disabled={!isEditable}
            />
            <EditableNamedLink
              link={momentos.evaluacion?.instrumentoLink}
              label="Abrir instrumento"
              isEditable={isEditable}
              onChange={onInstrumentoLinkChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
