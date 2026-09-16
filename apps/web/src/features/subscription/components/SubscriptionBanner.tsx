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

function contentFor(status: SubscriptionStatus): BannerContent | null {
  switch (status.state) {
    case 'trial':
      return {
        tone: 'info',
        icon: Sparkles,
        message:
          status.daysRemaining > 0
            ? `Estás en prueba gratuita. Te ${status.daysRemaining === 1 ? 'queda' : 'quedan'} ${days(status.daysRemaining)}.`
            : 'Tu prueba gratuita termina hoy.',
        cta: 'Activar cuenta',
        dismissible: true,
      }

    case 'active':
      // Solo molesta cuando falta poco; el resto del año no se muestra nada.
      if (!status.expiringSoon) return null
      return {
        tone: 'warning',
        icon: Clock,
        message:
          status.daysRemaining > 0
            ? `Tu suscripción vence en ${days(status.daysRemaining)} (${formatDate(status.expiresAt)}).`
            : `Tu suscripción vence hoy (${formatDate(status.expiresAt)}).`,
        cta: 'Renovar',
        dismissible: true,
      }

    case 'grace':
      return {
        tone: 'danger',
        icon: AlertTriangle,
        message: `Tu suscripción venció el ${formatDate(status.expiresAt)}. Tienes hasta el ${formatDate(status.graceEndsAt)} para renovar; después la cuenta pasa a solo lectura.`,
        cta: 'Renovar ahora',
        dismissible: false,
      }

    case 'readonly':
      return {
        tone: 'danger',
        icon: Lock,
        message:
          'Cuenta en solo lectura: puedes consultar y exportar, pero no registrar cambios. Renueva para reactivarla.',
        cta: 'Renovar ahora',
        dismissible: false,
      }

    case 'suspended':
      return {
        tone: 'danger',
        icon: Lock,
        message: 'Esta cuenta está suspendida. Contacta a soporte para reactivarla.',
        cta: null,
        dismissible: false,
      }
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

  const status = data?.status
  // Sin suscripción gestionada no hay nada que avisar.
  if (!status) return null

  const content = contentFor(status)
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
