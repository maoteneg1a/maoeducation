import { useEffect, useState } from 'react'
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
  useUpdateAiConfig,
  useUpdateGradingConfig,
  useUpdatePlanningModel,
} from '../hooks/useSettings'
import type { AiConfig, BehaviorLevel, GradingConfig, PlanningModel, QualitativeLevel } from '../api/settings.api'

export function GradingConfigPage() {
  const { data, isLoading } = useGradingConfig()
  const update = useUpdateGradingConfig()
  const [cfg, setCfg] = useState<GradingConfig | null>(null)

  useEffect(() => {
    if (data) setCfg(structuredClone(data))
  }, [data])

  if (isLoading || !cfg) return <PageLoader />

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
        <Button onClick={() => update.mutate(cfg)} loading={update.isPending}>Guardar</Button>
      </div>

      <PlanningModelConfigCard />

      <AiAssistantConfigCard />

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

      {/* Promoción */}
      <Card>
        <CardHeader>
          <CardTitle>Reglas de promoción</CardTitle>
          <CardDescription>Umbrales para aprobar, supletorio y recuperación</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Nota mínima para aprobar" value={cfg.promotion.minToPass}
            onChange={(v) => setCfg({ ...cfg, promotion: { ...cfg.promotion, minToPass: v } })} />
          <Field label="Examen por defecto (%)" value={cfg.defaultExamWeight}
            onChange={(v) => setCfg({ ...cfg, defaultExamWeight: v })} />
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

function AiAssistantConfigCard() {
  const { data } = useAiConfig()
  const update = useUpdateAiConfig()
  const [ai, setAi] = useState<AiConfig | null>(null)

  useEffect(() => {
    if (data) setAi(data)
  }, [data])

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
      <CardContent className="max-w-md space-y-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={ai.enabled}
            onChange={(e) => setAi({ ...ai, enabled: e.target.checked })}
          />
          Habilitar asistente IA para los docentes
        </label>
        {ai.enabled && (
          <div className="space-y-1.5">
            <Label>Tope mensual de tokens (0 = sin tope)</Label>
            <Input
              type="number"
              min={0}
              value={ai.monthlyTokenCap}
              onChange={(e) => setAi({ ...ai, monthlyTokenCap: Number(e.target.value) })}
            />
          </div>
        )}
        <Button onClick={() => update.mutate(ai)} loading={update.isPending}>Guardar</Button>
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
