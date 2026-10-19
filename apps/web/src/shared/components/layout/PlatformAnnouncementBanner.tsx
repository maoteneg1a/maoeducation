import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertOctagon, AlertTriangle, Info, X } from 'lucide-react'
import { apiGet } from '@/shared/lib/api-client'
import { cn } from '@/shared/lib/utils'

type AnnouncementLevel = 'info' | 'warning' | 'critical'

interface ActiveAnnouncement {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
  startsAt: string
}

const STORAGE_KEY = 'mao-dismissed-announcements'

function readDismissed(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

const LEVELS: Record<AnnouncementLevel, { className: string; icon: React.ElementType }> = {
  info: { className: 'bg-blue-50 text-blue-900 border-blue-200', icon: Info },
  warning: { className: 'bg-amber-50 text-amber-900 border-amber-200', icon: AlertTriangle },
  critical: { className: 'bg-red-50 text-red-900 border-red-200', icon: AlertOctagon },
}

/** Avisos globales publicados desde la consola de plataforma. */
export function PlatformAnnouncementBanner() {
  const { data } = useQuery({
    queryKey: ['platform-announcements-active'],
    queryFn: () => apiGet<ActiveAnnouncement[]>('platform-announcements/active'),
    staleTime: 5 * 60_000,
    retry: false,
  })
  const [dismissed, setDismissed] = useState<string[]>(readDismissed)

  const visible = (data ?? []).filter((a) => !dismissed.includes(a.id))
  if (visible.length === 0) return null

  const dismiss = (id: string) => {
    // Solo se guardan los ids que siguen activos para que la lista no crezca sin fin.
    const activeIds = new Set((data ?? []).map((a) => a.id))
    const next = [...dismissed.filter((d) => activeIds.has(d)), id]
    setDismissed(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* almacenamiento no disponible: se oculta solo en esta sesión */
    }
  }

  return (
    <div>
      {visible.map((a) => {
        const level = LEVELS[a.level] ?? LEVELS.info
        const Icon = level.icon
        return (
          <div
            key={a.id}
            role={a.level === 'critical' ? 'alert' : 'status'}
            className={cn('flex items-start gap-3 border-b px-4 py-2.5 md:px-6', level.className)}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p className="flex-1 text-sm leading-snug">
              <strong className="font-semibold">{a.title}</strong>
              {a.body && <span className="whitespace-pre-wrap"> — {a.body}</span>}
            </p>
            <button
              type="button"
              onClick={() => dismiss(a.id)}
              className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
              aria-label={`Ocultar aviso: ${a.title}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
