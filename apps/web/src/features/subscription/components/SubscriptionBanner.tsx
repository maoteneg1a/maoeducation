import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Clock, Lock, Sparkles, X } from 'lucide-react'
import { cn } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useSubscriptionStatus } from '../hooks/useSubscription'
import type { SubscriptionStatus } from '../api/subscription.api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Días en texto natural: el banner se lee mil veces, "1 día" no "1 días". */
function days(n: number): string {
  return n === 1 ? '1 día' : `${n} días`
}

interface BannerContent {
  tone: 'info' | 'warning' | 'danger'
  icon: React.ElementType
  message: string
  cta: string | null
  /** Los estados que ya cortan o están por cortar no se pueden ocultar. */
  dismissible: boolean
}

/**
 * La suscripción real hoy es el acceso al asistente IA (decisión de producto:
 * "si tienen IA activada, tienen suscripción activa") — el resto del producto
 * (notas, asistencia, planificación manual) funciona siempre, sin importar
 * este estado. `status` (fechas trial/pago) ya no bloquea nada; se usa solo
 * para el mensaje informativo cuando aiEnabled es false, para no perder el
 * contexto de "por qué" (prueba vencida vs. suspendida vs. nunca activada).
 */
function contentFor(status: SubscriptionStatus | null, aiEnabled: boolean): BannerContent | null {
  if (aiEnabled) {
    // Con IA activa, solo avisar si la vigencia registrada está por vencer —
    // informativo, nunca bloqueante (el superadmin decide si la desactiva).
    if (status?.state === 'active' && status.expiringSoon) {
      return {
        tone: 'warning',
        icon: Clock,
        message:
          status.daysRemaining > 0
            ? `Tu suscripción vence en ${days(status.daysRemaining)} (${formatDate(status.expiresAt)}). Después de esa fecha el asistente IA podría desactivarse.`
            : `Tu suscripción vence hoy (${formatDate(status.expiresAt)}). Después de esa fecha el asistente IA podría desactivarse.`,
        cta: 'Renovar',
        dismissible: true,
      }
    }
    return null
  }

  if (status?.state === 'suspended') {
    return {
      tone: 'danger',
      icon: Lock,
      message: 'El asistente IA de esta cuenta está desactivado. Contacta a soporte para reactivarlo.',
      cta: null,
      dismissible: false,
    }
  }

  return {
    tone: 'info',
    icon: Sparkles,
    message: 'El asistente IA no está activado para tu institución. Activa tu suscripción para usarlo.',
    cta: 'Activar cuenta',
    dismissible: true,
  }
}

const TONES: Record<BannerContent['tone'], string> = {
  info: 'bg-blue-50 text-blue-900 border-blue-200',
  warning: 'bg-amber-50 text-amber-900 border-amber-200',
  danger: 'bg-red-50 text-red-900 border-red-200',
}

const CTA_TONES: Record<BannerContent['tone'], string> = {
  info: 'bg-blue-600 hover:bg-blue-700',
  warning: 'bg-amber-600 hover:bg-amber-700',
  danger: 'bg-red-600 hover:bg-red-700',
}

/**
 * Aviso de suscripción sobre toda la app.
 *
 * Lo ve cualquier usuario (un docente también necesita saber que la cuenta está
 * en solo lectura antes de perder media hora llenando notas), pero el botón de
 * renovar aparece solo para quien puede administrar la institución.
 */
export function SubscriptionBanner() {
  const { data } = useSubscriptionStatus()
  const { hasPermission } = usePermissions()
  const [dismissed, setDismissed] = useState(false)

  // Sin respuesta todavía (loading/error) no hay nada que avisar — aiEnabled
  // por defecto false hasta que llegue la respuesta real evitaría un flash
  // del banner "sin IA" en cada carga, así que se espera a tener datos.
  if (!data) return null

  const content = contentFor(data.status, data.aiEnabled)
  if (!content) return null
  if (content.dismissible && dismissed) return null

  const canManage = hasPermission('institution_config:manage')

  return (
    <div className={cn('flex items-center gap-3 border-b px-4 py-2.5 md:px-6', TONES[content.tone])}>
      <content.icon className="h-4 w-4 shrink-0" />
      <p className="flex-1 text-sm leading-snug">{content.message}</p>

      {content.cta && canManage && (
        <Link
          to="/subscription"
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors',
            CTA_TONES[content.tone],
          )}
        >
          {content.cta}
        </Link>
      )}

      {content.dismissible && (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="shrink-0 rounded p-1 opacity-60 transition-opacity hover:opacity-100"
          aria-label="Ocultar aviso"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}
