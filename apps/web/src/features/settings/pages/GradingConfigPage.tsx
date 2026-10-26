import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Sparkles, Trash2, BookOpen } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import {
  useAiConfig,
  useGradingConfig,
  usePlanningModel,
  useUpdateGradingConfig,
  useUpdatePlanningModel,
} from '../hooks/useSettings'
import type { BehaviorLevel, GradingConfig, PlanningModel, QualitativeLevel } from '../api/settings.api'
import { activitiesApi } from '@/features/activities/api/activities.api'

export function GradingConfigPage() {
  const { data, isLoading } = useGradingConfig()
  const update = useUpdateGradingConfig()
  const { data: activityTypes = [] } = useQuery({
    queryKey: ['activity-types'],
    queryFn: activitiesApi.getTypes,
  })
  const [cfg, setCfg] = useState<GradingConfig | null>(null)

  useEffect(() => {
    if (data) setCfg(structuredClone(data))
  }, [data])

  if (isLoading || !cfg) return <PageLoader />

  const weightsValid = Number.isInteger(cfg.defaultExamWeight) && cfg.defaultExamWeight >= 0 && cfg.defaultExamWeight <= 100 &&
    Number.isFinite(cfg.defaultProjectWeight) && cfg.defaultProjectWeight >= 0 && cfg.defaultProjectWeight <= cfg.defaultExamWeight
  const refuerzo = cfg.formativeReinforcement
  const refuerzoValid = refuerzo.reinforcementWeight > 0 && refuerzo.reinforcementWeight < 100 && refuerzo.cap > 0 && refuerzo.cap <= cfg.gradingScaleMax
  const examPercent = cfg.defaultExamWeight - cfg.defaultProjectWeight

  const setScale = (i: number, patch: Partial<QualitativeLevel>) =>
    setCfg({ ...cfg, qualitativeScale: cfg.qualitativeScale.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) })
  const setBehavior = (i: number, patch: Partial<BehaviorLevel>) =>
    setCfg({ ...cfg, behaviorScale: cfg.behaviorScale.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) })
  const setGradingScaleMax = (nextMax: number) => {
    if (!Number.isFinite(nextMax) || nextMax <= 0 || cfg.gradingScaleMax <= 0) return
    const ratio = nextMax / cfg.gradingScaleMax
    const scaled = (value: number) => Math.round(value * ratio * 100) / 100
    setCfg({
      ...cfg,
      gradingScaleMax: nextMax,
      qualitativeScale: cfg.qualitativeScale.map((level) => ({
        ...level,
        min: scaled(level.min),
        max: scaled(level.max),
      })),
      formativeReinforcement: { ...cfg.formativeReinforcement, cap: scaled(cfg.formativeReinforcement.cap) },
      promotion: {
        ...cfg.promotion,
        minToPass: scaled(cfg.promotion.minToPass),
        supletorioMin: scaled(cfg.promotion.supletorioMin),
        supletorioMax: scaled(cfg.promotion.supletorioMax),
        passWithExam: scaled(cfg.promotion.passWithExam),
      },
    })
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Configuración de calificación</h1>
          <p className="text-sm text-muted-foreground">Escala cualitativa, comportamiento y reglas de promoción</p>
        </div>
        <Button onClick={() => update.mutate(cfg)} loading={update.isPending} disabled={!weightsValid || !refuerzoValid}>Guardar</Button>
      </div>

      <PlanningModelConfigCard />

      <AiAssistantConfigCard />

      <Card>
        <CardHeader>
          <CardTitle>Integración con Educar Ecuador</CardTitle>
          <CardDescription>
            Controla si los docentes pueden preparar el promedio final del trimestre para cargarlo en el portal oficial.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border p-4 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4"
              checked={cfg.educarEcuadorExportEnabled ?? true}
              onChange={(event) => setCfg({ ...cfg, educarEcuadorExportEnabled: event.target.checked })}
            />
            <span>
              <strong>Mostrar “Enviar a Educar Ecuador”</strong>
              <span className="mt-1 block text-xs text-muted-foreground">
                Si se desactiva, el botón desaparece de la vista de resumen de calificaciones para toda la institución.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Escala cualitativa */}
      <Card>
        <CardHeader>
          <CardTitle>Escala cualitativa</CardTitle>
          <CardDescription>Equivalencia que se muestra en el boletín según el promedio</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          <div className="grid grid-cols-[70px_70px_90px_1fr_40px] gap-2 text-xs font-medium text-muted-foreground min-w-[440px]">
            <span>Desde</span><span>Hasta</span><span>Código</span><span>Etiqueta</span><span />
          </div>
          {cfg.qualitativeScale.map((l, i) => (
            <div key={i} className="grid grid-cols-[70px_70px_90px_1fr_40px] gap-2 min-w-[440px]">
              <Input type="number" step="0.01" value={l.min} onChange={(e) => setScale(i, { min: Number(e.target.value) })} />
              <Input type="number" step="0.01" value={l.max} onChange={(e) => setScale(i, { max: Number(e.target.value) })} />
              <Input value={l.code} onChange={(e) => setScale(i, { code: e.target.value })} />
              <Input value={l.label} onChange={(e) => setScale(i, { label: e.target.value })} />
              <Button variant="ghost" size="sm" onClick={() => setCfg({ ...cfg, qualitativeScale: cfg.qualitativeScale.filter((_, idx) => idx !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCfg({ ...cfg, qualitativeScale: [...cfg.qualitativeScale, { min: 0, max: 0, code: '', label: '' }] })}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar nivel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Escala numérica general</CardTitle>
          <CardDescription>
            Escala en la que se muestran y calculan los promedios de toda la institución.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <Field label="Nota máxima" value={cfg.gradingScaleMax}
            onChange={setGradingScaleMax} />
          <p className="mt-2 text-xs text-muted-foreground">
            Por ejemplo, usa 5 para conservar promedios sobre 5. Al cambiarla también se ajustan
            proporcionalmente los rangos cualitativos y las notas de promoción.
          </p>
        </CardContent>
      </Card>

      {/* Comportamiento */}
      <Card>
        <CardHeader>
          <CardTitle>Escala de comportamiento</CardTitle>
          <CardDescription>Códigos y etiquetas para la calificación cualitativa de conducta</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 overflow-x-auto">
          <div className="grid grid-cols-[90px_1fr_40px] gap-2 text-xs font-medium text-muted-foreground min-w-[300px]">
            <span>Código</span><span>Etiqueta</span><span />
          </div>
          {cfg.behaviorScale.map((l, i) => (
            <div key={i} className="grid grid-cols-[90px_1fr_40px] gap-2 min-w-[300px]">
              <Input value={l.code} onChange={(e) => setBehavior(i, { code: e.target.value })} />
              <Input value={l.label} onChange={(e) => setBehavior(i, { label: e.target.value })} />
              <Button variant="ghost" size="sm" onClick={() => setCfg({ ...cfg, behaviorScale: cfg.behaviorScale.filter((_, idx) => idx !== i) })}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setCfg({ ...cfg, behaviorScale: [...cfg.behaviorScale, { code: '', label: '' }] })}>
            <Plus className="mr-1.5 h-4 w-4" /> Agregar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Porcentajes de la nota del período</CardTitle>
          <CardDescription>
            Define cuánto aportan las actividades, el examen y el proyecto a la nota final.
            Al guardar cambios en estos porcentajes se recalculan los períodos de todas las materias.
            Puedes ajustar una materia desde Calificaciones.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="formative-percent">Actividades / formativa (%)</Label>
              <Input id="formative-percent" type="number" min={0} max={100} step={1} value={100 - cfg.defaultExamWeight}
                onChange={(e) => setCfg({ ...cfg, defaultExamWeight: 100 - Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exam-percent">Examen (%)</Label>
              <Input id="exam-percent" type="number" min={0} max={100} step={1} value={examPercent}
                onChange={(e) => setCfg({ ...cfg, defaultExamWeight: Number(e.target.value) + cfg.defaultProjectWeight })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="project-percent">Proyecto (%)</Label>
              <Input id="project-percent" type="number" min={0} max={100} step={1} value={cfg.defaultProjectWeight}
                onChange={(e) => setCfg({ ...cfg, defaultProjectWeight: Number(e.target.value), defaultExamWeight: examPercent + Number(e.target.value) })} />
            </div>
          </div>
          <p className={weightsValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'} role={weightsValid ? undefined : 'alert'}>
            {weightsValid ? 'Los tres porcentajes suman 100%. Usa Proyecto 0% para no incluirlo. Al cambiar actividades, se ajusta el examen para completar 100%.' : 'Examen y proyecto deben sumar como máximo 100% y sus porcentajes no pueden ser negativos.'}
          </p>
        </CardContent>
      </Card>

      {/* Promoción */}
      <Card>
        <CardHeader>
          <CardTitle>Reglas de promoción</CardTitle>
          <CardDescription>Umbrales para aprobar, supletorio y recuperación</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nota mínima para aprobar" value={cfg.promotion.minToPass}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, minToPass: v } })} />
          <Field label="Supletorio: desde" value={cfg.promotion.supletorioMin}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, supletorioMin: v } })} />
          <Field label="Supletorio: hasta" value={cfg.promotion.supletorioMax}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, supletorioMax: v } })} />
          <Field label="Nota al aprobar supletorio" value={cfg.promotion.passWithExam}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, passWithExam: v } })} />
          <Field label="Máx. materias reprobadas" value={cfg.promotion.maxFailedSubjects}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, maxFailedSubjects: v } })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Refuerzo del aprendizaje formativo</CardTitle>
          <CardDescription>Procedimiento institucional según el MIEE. Ajusta la base formativa y conserva el componente sumativo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-lg space-y-1.5">
            <Label>Modalidad institucional</Label>
            <Select value={refuerzo.mode ?? 'unconfigured'} onValueChange={(v) => setCfg({ ...cfg, formativeReinforcement: { ...refuerzo, mode: v === 'unconfigured' ? null : v as 'activity_set' | 'period_formative' } })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unconfigured">Sin configurar</SelectItem>
                <SelectItem value="activity_set">Por aprendizajes: conjunto de actividades</SelectItem>
                <SelectItem value="period_formative">Integral del período: promedio formativo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            {refuerzo.mode === 'activity_set'
              ? 'El docente selecciona las actividades formativas atendidas por el plan. El conjunto conserva el peso que tenía dentro de los insumos; las demás actividades mantienen su aporte.'
              : refuerzo.mode === 'period_formative'
                ? 'El resultado del plan se combina con el promedio formativo completo del período. Exámenes y proyectos sumativos conservan sus notas.'
                : 'Selecciona el procedimiento previsto por la institución para habilitar la aplicación del resultado desde el caso de refuerzo.'}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Peso del resultado del refuerzo (%)" value={refuerzo.reinforcementWeight} onChange={(v) => setCfg({ ...cfg, formativeReinforcement: { ...refuerzo, reinforcementWeight: v } })} />
            <Field label="Tope del resultado recuperado" value={refuerzo.cap} onChange={(v) => setCfg({ ...cfg, formativeReinforcement: { ...refuerzo, cap: v } })} />
          </div>
          <p className="text-xs text-muted-foreground">Las calificaciones iniciales pesan {100 - refuerzo.reinforcementWeight} %. Con 5 inicial y 8 de refuerzo: {Math.min(refuerzo.cap, 5 * (1 - refuerzo.reinforcementWeight / 100) + 8 * refuerzo.reinforcementWeight / 100).toFixed(2)} (ejemplo sobre 10). El tope afecta al conjunto o a la base recuperada; una mejora no reduce la nota inicial. Cada aplicación conserva la configuración utilizada.</p>
          {!refuerzoValid && <p role="alert" className="text-sm text-destructive">El peso debe estar entre 0 y 100, sin incluirlos; el tope debe estar dentro de la escala.</p>}
        </CardContent>
      </Card>

      {/* Recuperación pedagógica */}
      <Card>
        <CardHeader>
          <CardTitle>Recuperación pedagógica</CardTitle>
          <CardDescription>Cómo se aplica la nota de la prueba de recuperación al total del período</CardDescription>
        </CardHeader>
        <CardContent className="max-w-sm">
          <div className="space-y-1.5">
            <Label>Modo de cálculo</Label>
            <Select
              value={cfg.pedagogicRecovery?.mode ?? 'replace_if_higher'}
              onValueChange={(v: 'replace_if_higher' | 'average') =>
                setCfg({ ...cfg, pedagogicRecovery: { ...cfg.pedagogicRecovery, mode: v } })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replace_if_higher">
                  Reemplaza si es mayor (MINEDUC estándar)
                </SelectItem>
                <SelectItem value="average">
                  Promedia nota original + recuperación
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Afecta el total del período, el promedio anual y el boletín.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Refuerzo de calificación por actividad — independiente de planificaciones */}
      <Card>
        <CardHeader>
          <CardTitle>Nota de refuerzo por actividad</CardTitle>
          <CardDescription>
            Define en qué tipos de actividad se puede registrar una segunda nota y cómo se obtiene la nota final.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="max-w-sm space-y-1.5">
            <Label>Forma de cálculo</Label>
            <Select
              value={cfg.activityGradeReinforcement?.mode ?? 'replace'}
              onValueChange={(mode: 'replace' | 'average') =>
                setCfg({
                  ...cfg,
                  activityGradeReinforcement: {
                    mode,
                    eligibleActivityTypeIds: cfg.activityGradeReinforcement?.eligibleActivityTypeIds ?? [],
                  },
                })
              }
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="replace">Reemplaza la nota original</SelectItem>
                <SelectItem value="average">Promedia nota original + refuerzo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tipos de actividad habilitados</Label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {activityTypes.filter((type) => type.isActive).map((type) => {
                const selected = cfg.activityGradeReinforcement?.eligibleActivityTypeIds?.includes(type.id) ?? false
                return (
                  <label key={type.id} className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        const current = cfg.activityGradeReinforcement?.eligibleActivityTypeIds ?? []
                        const eligibleActivityTypeIds = event.target.checked
                          ? [...new Set([...current, type.id])]
                          : current.filter((id) => id !== type.id)
                        setCfg({
                          ...cfg,
                          activityGradeReinforcement: {
                            mode: cfg.activityGradeReinforcement?.mode ?? 'replace',
                            eligibleActivityTypeIds,
                          },
                        })
                      }}
                    />
                    {type.name}
                  </label>
                )
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              La opción de refuerzo solo aparecerá al calificar actividades de los tipos seleccionados.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PlanningModelConfigCard() {
  const { data: planningModel } = usePlanningModel()
  const update = useUpdatePlanningModel()

  if (!planningModel) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          Modelo de planificación curricular
        </CardTitle>
        <CardDescription>
          Decide cómo planifican los docentes: por destrezas (Currículo Priorizado MINEDUC) o por
          competencias (Currículo Nacional por Competencias, CNC). Afecta el selector en la
          planificación semanal, proyectos interdisciplinarios y refuerzo.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-sm space-y-1.5">
        <Label>Modelo activo</Label>
        <Select
          value={planningModel}
          onValueChange={(v: PlanningModel) => update.mutate(v)}
          disabled={update.isPending}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="destrezas">Destrezas (Currículo Priorizado)</SelectItem>
            <SelectItem value="competencias">Competencias (CNC)</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}

// Solo lectura: el admin de institución ya no puede cambiar esto — lo
// gestiona el superadministrador de plataforma (ver PUT
// /platform/institutions/:id/ai-config). PUT /institution/ai-config ahora
// rechaza escritura (403), así que aquí no se ofrece ningún control editable.
function AiAssistantConfigCard() {
  const { data: ai } = useAiConfig()

  if (!ai) return null

  return (
    <Card className="border-violet-300 bg-violet-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-violet-900">
          <Sparkles className="h-5 w-5" />
          Asistente IA de planificaciones
        </CardTitle>
        <CardDescription>
          Genera competencias, indicadores, saberes y estrategias DUA por semana, para que el docente escriba lo mínimo.
        </CardDescription>
      </CardHeader>
      <CardContent className="max-w-md space-y-3">
        <p className="text-sm">
          Estado: <span className="font-medium">{ai.enabled ? 'Habilitado' : 'Deshabilitado'}</span>
        </p>
        {ai.enabled && (
          <p className="text-sm text-muted-foreground">
            Tope mensual de tokens: {ai.monthlyTokenCap === 0 ? 'sin tope' : ai.monthlyTokenCap}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Esta configuración la gestiona el superadministrador de la plataforma — contacta soporte para cambios.
        </p>
      </CardContent>
    </Card>
  )
}

function Field({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="number" step="0.01" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}
