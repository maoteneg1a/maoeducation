import { useState } from 'react'
import { CheckCircle2, Clock, FileText, Lock, Upload, XCircle } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { LoadingSpinner } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn } from '@/shared/lib/utils'
import { useSubscriptionDetail } from '../hooks/useSubscription'
import { UploadReceiptDialog } from '../components/UploadReceiptDialog'
import { subscriptionApi, type PaymentStatus, type SubscriptionStatus } from '../api/subscription.api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })
}

const STATE_LABELS: Record<SubscriptionStatus['state'], string> = {
  trial: 'Prueba gratuita',
  active: 'Activa',
  grace: 'Vencida · en tolerancia',
  readonly: 'Solo lectura',
  suspended: 'Suspendida',
}

const STATE_STYLES: Record<SubscriptionStatus['state'], string> = {
  trial: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  grace: 'bg-amber-50 text-amber-700 border-amber-200',
  readonly: 'bg-red-50 text-red-700 border-red-200',
  suspended: 'bg-red-50 text-red-700 border-red-200',
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
}

const PAYMENT_ICONS: Record<PaymentStatus, React.ElementType> = {
  pending: Clock,
  approved: CheckCircle2,
  rejected: XCircle,
}

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  pending: 'text-amber-600',
  approved: 'text-emerald-600',
  rejected: 'text-red-600',
}

export function SubscriptionPage() {
  const { data, isLoading } = useSubscriptionDetail()
  const [uploadOpen, setUploadOpen] = useState(false)

  const openReceipt = async (paymentId: string) => {
    const url = await subscriptionApi.getReceiptUrl(paymentId)
    window.open(url, '_blank', 'noopener')
    // El blob se libera cuando el navegador ya lo abrió.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  if (isLoading) return <LoadingSpinner />

  const status = data?.status ?? null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Suscripción</h1>
        <p className="text-sm text-muted-foreground">
          Estado de tu cuenta y comprobantes de pago enviados.
        </p>
      </div>

      {!status ? (
        <Card className="p-6">
          <EmptyState
            icon={Lock}
            title="Sin suscripción registrada"
            description="Esta cuenta no tiene un período de facturación configurado. Contacta a soporte si necesitas activarla."
          />
        </Card>
      ) : (
        <Card className={cn('border p-6', STATE_STYLES[status.state])}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide opacity-70">
                  Estado
                </span>
                <Badge className="border bg-white/70">{STATE_LABELS[status.state]}</Badge>
              </div>

              <p className="text-2xl font-semibold leading-tight">
                {status.readOnly
                  ? 'Renueva para reactivar tu cuenta'
                  : status.daysRemaining > 0
                    ? `${status.daysRemaining} ${status.daysRemaining === 1 ? 'día' : 'días'} restantes`
                    : 'Vence hoy'}
              </p>

              <dl className="space-y-0.5 text-sm opacity-80">
                <div className="flex gap-2">
                  <dt>Vigente hasta:</dt>
                  <dd className="font-medium">{formatDate(status.expiresAt)}</dd>
                </div>
                {status.state === 'grace' && (
                  <div className="flex gap-2">
                    <dt>Pasa a solo lectura el:</dt>
                    <dd className="font-medium">{formatDate(status.graceEndsAt)}</dd>
                  </div>
                )}
              </dl>
            </div>

            {status.state !== 'suspended' && (
              <Button onClick={() => setUploadOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Enviar comprobante
              </Button>
            )}
          </div>

          {status.state === 'readonly' && (
            <p className="mt-4 rounded-md bg-white/60 px-3 py-2 text-sm">
              Puedes consultar y exportar toda tu información. Para volver a registrar
              calificaciones, asistencia o planificaciones, envía el comprobante de tu pago.
            </p>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Comprobantes enviados
        </h2>

        {!data?.payments.length ? (
          <Card className="p-6">
            <EmptyState
              icon={FileText}
              title="Todavía no enviaste comprobantes"
              description="Cuando hagas la transferencia, sube la captura aquí para que activemos tu cuenta."
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {data.payments.map((p) => {
              const Icon = PAYMENT_ICONS[p.status]
              return (
                <Card key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                  <Icon className={cn('h-5 w-5 shrink-0', PAYMENT_STYLES[p.status])} />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {p.amount !== null
                          ? `${p.currency} ${p.amount.toFixed(2)}`
                          : 'Monto no especificado'}
                      </span>
                      <Badge variant="outline" className={PAYMENT_STYLES[p.status]}>
                        {PAYMENT_LABELS[p.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enviado el {formatDate(p.createdAt)}
                      {p.reference && ` · ${p.reference}`}
                      {p.uploaderName && ` · ${p.uploaderName}`}
                    </p>
                    {p.reviewNotes && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Respuesta:</span> {p.reviewNotes}
                      </p>
                    )}
                  </div>

                  <Button variant="outline" size="sm" onClick={() => openReceipt(p.id)}>
                    Ver comprobante
                  </Button>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <UploadReceiptDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  )
}
