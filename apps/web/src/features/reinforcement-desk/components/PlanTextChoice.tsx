import { useEffect, useState } from 'react'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Textarea } from '@/shared/components/ui/textarea'

/** Sugerencias para elegir; conserva siempre el texto personalizado del docente. */
export function PlanTextChoice({ label, value, onChange, options, optional = false, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; options: readonly string[]; optional?: boolean; disabled?: boolean
}) {
  const [custom, setCustom] = useState(!!value && !options.includes(value))
  useEffect(() => { if (value && !options.includes(value)) setCustom(true) }, [value, options])
  const selected = custom ? 'custom' : value ? `option-${options.indexOf(value)}` : optional ? 'empty' : ''
  return <div className="min-w-0 space-y-1.5">
    <Label>{label}{optional && <span className="font-normal text-muted-foreground"> · opcional</span>}</Label>
    <Select disabled={disabled} value={selected} onValueChange={(key) => {
      setCustom(key === 'custom')
      onChange(key === 'custom' ? value : key === 'empty' ? '' : options[Number(key.slice(7))])
    }}>
      <SelectTrigger aria-label={label}><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
        {optional && <SelectItem value="empty">Sin especificar</SelectItem>}
        {options.map((option, index) => <SelectItem key={option} value={`option-${index}`}>{option}</SelectItem>)}
        <SelectItem value="custom">Escribir otra opción…</SelectItem>
      </SelectContent>
    </Select>
    {custom && <Textarea aria-label={`${label}: texto personalizado`} disabled={disabled} rows={2} value={value} maxLength={3000} onChange={(event) => onChange(event.target.value)} />}
  </div>
}

// Son propuestas de planificación, no constancias de actividades ya realizadas.
export const PLAN_STRATEGIES = ['Práctica guiada con retroalimentación', 'Explicación y ejercicios paso a paso', 'Resolución de problemas con acompañamiento', 'Trabajo colaborativo y tutoría entre pares', 'Actividades con material concreto'] as const
export const PLAN_RESOURCES = ['Material de clase y cuaderno del estudiante', 'Guía de ejercicios', 'Material concreto y recursos visuales', 'Recursos digitales'] as const
export const PLAN_EVALUATIONS = ['Actividad práctica con retroalimentación', 'Resolución de ejercicios', 'Explicación oral del aprendizaje', 'Lista de cotejo', 'Rúbrica de desempeño'] as const
export const PLAN_FREQUENCIES = ['Una sesión por semana', 'Dos sesiones por semana', 'Tres sesiones por semana', 'Durante las clases de la asignatura'] as const
export const SESSION_TITLES = ['Práctica guiada', 'Taller de aplicación', 'Resolución de problemas', 'Retroalimentación y corrección', 'Comprobación del aprendizaje'] as const

export const suggestedObjective = (target: string) => `Fortalecer el aprendizaje priorizado: ${target}.`
