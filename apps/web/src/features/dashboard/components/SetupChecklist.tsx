import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronUp, Circle, Rocket } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { apiGet } from '@/shared/lib/api-client'
import { cn } from '@/shared/lib/utils'

interface ChecklistData {
  items: Array<{ key: string; label: string; done: boolean; detail: string; link: string }>
  completed: number
  total: number
}

/** Checklist de puesta en marcha (admin/rector), calculado con datos reales del año activo. */
export function SetupChecklist() {
  const { data } = useQuery({
    queryKey: ['dashboard-setup-checklist'],
    queryFn: () => apiGet<ChecklistData>('dashboard/setup-checklist'),
    staleTime: 60_000,
  })
  const [expanded, setExpanded] = useState(true)

  if (!data || data.completed === data.total) return null
  const pct = Math.round((data.completed / data.total) * 100)
  const pending = data.items.filter((i) => !i.done)
  const visible = expanded ? data.items : pending.slice(0, 3)

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket className="h-4 w-4 text-primary" aria-hidden />
          Puesta en marcha del año lectivo
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            {data.completed}/{data.total} listos
          </span>
        </CardTitle>
        <div
          className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de configuración"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        <ul className="grid gap-1 sm:grid-cols-2">
          {visible.map((item) => (
            <li key={item.key}>
              <Link
                to={item.link}
                className={cn(
                  'flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60',
                  item.done && 'text-muted-foreground',
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-label="Listo" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-label="Pendiente" />
                )}
                <span className="min-w-0">
                  <span className={cn('block font-medium', item.done && 'font-normal')}>{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {expanded ? 'Mostrar solo pendientes' : `Ver todo (${data.total})`}
        </button>
      </CardContent>
    </Card>
  )
}
