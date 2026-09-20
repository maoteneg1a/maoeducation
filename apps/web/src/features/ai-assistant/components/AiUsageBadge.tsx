import { useAiBudgetUsage } from '../hooks/useAiAssistant'
import { cn } from '@/shared/lib/utils'

/**
 * Aviso preventivo de cupo de IA, grande y visible junto al avatar — antes
 * el docente solo se enteraba de que se acabó el cupo cuando la generación
 * ya fallaba (toast de error). Muestra el % de tokens diarios que quedan,
 * con color que escala de verde a rojo a medida que se acerca el tope.
 */
export function AiUsageBadge() {
  const { data } = useAiBudgetUsage()
  if (!data || data.dailyTokenCap <= 0) return null

  const usedPct = Math.min(100, Math.round((data.usedToday / data.dailyTokenCap) * 100))
  const remainingPct = 100 - usedPct

  const tone =
    usedPct >= 95
      ? { bar: 'bg-red-500', text: 'text-red-600', ring: 'ring-red-200' }
      : usedPct >= 75
        ? { bar: 'bg-amber-500', text: 'text-amber-600', ring: 'ring-amber-200' }
        : { bar: 'bg-green-500', text: 'text-green-600', ring: 'ring-green-200' }

  return (
    <div
      className={cn('hidden sm:flex flex-col items-center justify-center rounded-lg border px-3 py-1.5 ring-1', tone.ring)}
      title={`Cupo diario de IA de la institución: ${data.usedToday.toLocaleString('es')} / ${data.dailyTokenCap.toLocaleString('es')} tokens usados hoy`}
    >
      <span className={cn('text-lg font-bold leading-none', tone.text)}>{remainingPct}%</span>
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mt-0.5">cupo IA hoy</span>
      <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full transition-all', tone.bar)} style={{ width: `${usedPct}%` }} />
      </div>
    </div>
  )
}
