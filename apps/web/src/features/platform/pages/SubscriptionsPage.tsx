import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, FileText, Inbox, Lock, Unlock } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { LoadingSpinner } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import {
  useApprovePayment,
  usePlatformSubscriptions,
  useRejectPayment,
  useSetSubscriptionSuspended,
  useSetSubscriptionValidity,
  useSubscriptionPayments,
} from '../hooks/usePlatform'
import {
  platformApi,
  type PendingPayment,
  type PlatformSubscription,
  type SubscriptionState,
} from '../api/platform.api'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** <input type="date"> necesita YYYY-MM-DD. */
function toDateInput(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

const STATE_LABELS: Record<SubscriptionState, string> = {
  trial: 'Prueba',
  active: 'Activa',
  grace: 'Tolerancia',
  readonly: 'Solo lectura',
  suspended: 'Suspendida',
}

const STATE_STYLES: Record<SubscriptionState, string> = {
  trial: 'bg-blue-50 text-blue-700 border-blue-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  grace: 'bg-amber-50 text-amber-700 border-amber-200',
  readonly: 'bg-red-50 text-red-700 border-red-200',
  suspended: 'bg-slate-200 text-slate-700 border-slate-300',
}

// ─── Revisión de un comprobante ─────────────────────────────────────────────

function ReviewDialog({ payment, onClose }: { payment: PendingPayment | null; onClose: () => void }) {
  const approve = useApprovePayment()
  const reject = useRejectPayment()

  const [expiresAt, setExpiresAt] = useState('')
  const [amount, setAmount] = useState('')
  const [reviewNotes, setReviewNotes] = useState('')
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)

  // Precarga la vigencia sugerida y el monto que declaró el cliente.
  useEffect(() => {
    if (!payment) return
    setExpiresAt(toDateInput(payment.suggestedExpiresAt))
    setAmount(payment.amount !== null ? String(payment.amount) : '')
    setReviewNotes('')
  }, [payment])

  // Trae la captura como blob (la ruta exige autorización) y la libera al cerrar.
  useEffect(() => {
    if (!payment) return
    let url: string | null = null
    let cancelled = false
    platformApi
      .getReceiptUrl(payment.id)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u)
          return
        }
        url = u
        setReceiptUrl(u)
      })
      .catch(() => setReceiptUrl(null))

    return () => {
      cancelled = true
      setReceiptUrl(null)
      if (url) URL.revokeObjectURL(url)
    }
  }, [payment])

  if (!payment) return null

  const isImage = payment.mimeType.startsWith('image/')

  const handleApprove = () => {
    const parsed = amount.trim() === '' ? undefined : Number(amount)
    approve.mutate(
      {
        id: payment.id,
        data: {
          // El input da fecha local; se fija al final del día para no cortar antes.
          expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
          amount: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
          reviewNotes: reviewNotes.trim() || undefined,
        },
      },
      { onSuccess: onClose },
    )
  }

  const handleReject = () => {
    if (!reviewNotes.trim()) return
    reject.mutate({ id: payment.id, reviewNotes: reviewNotes.trim() }, { onSuccess: onClose })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{payment.institutionName}</DialogTitle>
          <DialogDescription>
            Comprobante enviado el {formatDate(payment.createdAt)}
            {payment.uploaderName && ` por ${payment.uploaderName}`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          {/* Captura */}
          <div className="space-y-2">
            <Label>Comprobante</Label>
            <div className="flex min-h-48 items-center justify-center rounded-lg border bg-slate-50 p-2">
              {!receiptUrl ? (
                <LoadingSpinner size="sm" />
              ) : isImage ? (
                <a href={receiptUrl} target="_blank" rel="noopener noreferrer">
                  <img
                    src={receiptUrl}
                    alt="Comprobante"
                    className="max-h-64 rounded object-contain"
                  />
                </a>
              ) : (
                <a
                  href={receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-2 text-sm text-blue-600 hover:underline"
                >
                  <FileText className="h-8 w-8" />
                  Abrir {payment.fileName}
                </a>
              )}
            </div>
            <dl className="space-y-0.5 text-xs text-slate-500">
              <div className="flex gap-1.5">
                <dt>Declarado:</dt>
                <dd className="font-medium text-slate-700">
                  {payment.amount !== null ? `${payment.currency} ${payment.amount.toFixed(2)}` : '—'}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Transferencia:</dt>
                <dd className="font-medium text-slate-700">
                  {payment.transferredAt ? formatDate(payment.transferredAt) : '—'}
                </dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Referencia:</dt>
                <dd className="font-medium text-slate-700">{payment.reference ?? '—'}</dd>
              </div>
              {payment.notes && <p className="pt-1 italic">“{payment.notes}”</p>}
            </dl>
          </div>

          {/* Decisión */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="expiresAt">Vigente hasta</Label>
              <Input
                id="expiresAt"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
              />
              <p className="text-xs text-slate-400">
                {payment.currentExpiresAt
                  ? `Vencimiento actual: ${formatDate(payment.currentExpiresAt)}`
                  : 'Sin vigencia previa'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmedAmount">Monto confirmado (USD)</Label>
              <Input
                id="confirmedAmount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reviewNotes">Nota para el cliente</Label>
              <Input
                id="reviewNotes"
                placeholder="Obligatoria para rechazar"
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            className="text-red-600 hover:bg-red-50"
            onClick={handleReject}
            loading={reject.isPending}
            disabled={!reviewNotes.trim()}
            title={!reviewNotes.trim() ? 'Escribe el motivo del rechazo' : undefined}
          >
            Rechazar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={handleApprove} loading={approve.isPending} disabled={!expiresAt}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Aprobar y activar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Vigencia a mano ────────────────────────────────────────────────────────

function ValidityDialog({
  subscription,
  onClose,
}: {
  subscription: PlatformSubscription | null
  onClose: () => void
}) {
  const setValidity = useSetSubscriptionValidity()
  const [expiresAt, setExpiresAt] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!subscription) return
    const base = subscription.status?.expiresAt
    setExpiresAt(base ? toDateInput(base) : toDateInput(new Date().toISOString()))
    setNotes(subscription.notes ?? '')
  }, [subscription])

  if (!subscription) return null

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Vigencia — {subscription.institutionName}</DialogTitle>
          <DialogDescription>
            Para pagos que llegan por fuera (WhatsApp, efectivo) o para poner bajo gestión una
            institución que todavía no tenía suscripción.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="validUntil">Vigente hasta</Label>
            <Input
              id="validUntil"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="validityNotes">Notas internas</Label>
            <Input
              id="validityNotes"
              placeholder="Pagó por transferencia directa, sin comprobante"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={setValidity.isPending}
            disabled={!expiresAt}
            onClick={() =>
              setValidity.mutate(
                {
                  institutionId: subscription.institutionId,
                  data: {
                    expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString(),
                    plan: 'paid',
                    notes: notes.trim() || undefined,
                  },
                },
                { onSuccess: onClose },
              )
            }
          >
            Guardar vigencia
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Página ─────────────────────────────────────────────────────────────────

export function SubscriptionsPage() {
  const { data: subscriptions, isLoading } = usePlatformSubscriptions()
  const { data: pending } = useSubscriptionPayments('pending')
  const suspend = useSetSubscriptionSuspended()

  const [reviewing, setReviewing] = useState<PendingPayment | null>(null)
  const [editingValidity, setEditingValidity] = useState<PlatformSubscription | null>(null)

  if (isLoading) return <LoadingSpinner />

  return (
    <div className="space-y-8">
      {/* Bandeja de revisión */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-lg font-semibold">Comprobantes por revisar</h2>
          {!!pending?.length && (
            <Badge className="bg-amber-100 text-amber-800">{pending.length}</Badge>
          )}
        </div>

        {!pending?.length ? (
          <Card className="p-6">
            <EmptyState icon={Inbox} title="Nada por revisar" description="No hay comprobantes pendientes." />
          </Card>
        ) : (
          <div className="space-y-2">
            {pending.map((p) => (
              <Card key={p.id} className="flex flex-wrap items-center gap-4 p-4">
                <FileText className="h-5 w-5 shrink-0 text-amber-600" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{p.institutionName}</p>
                  <p className="text-xs text-slate-500">
                    {p.amount !== null ? `${p.currency} ${p.amount.toFixed(2)}` : 'Monto no declarado'}
                    {p.reference && ` · ${p.reference}`} · enviado {formatDate(p.createdAt)}
                  </p>
                </div>
                <Button size="sm" onClick={() => setReviewing(p)}>
                  Revisar
                </Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Estado por institución */}
      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Suscripciones</h2>

        <Card className="divide-y">
          {subscriptions?.map((s) => (
            <div key={s.institutionId} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{s.institutionName}</span>
                  {s.accountType === 'personal' && (
                    <Badge variant="outline" className="text-[10px] text-slate-500">
                      personal
                    </Badge>
                  )}
                  {s.status ? (
                    <Badge className={`border ${STATE_STYLES[s.status.state]}`}>
                      {STATE_LABELS[s.status.state]}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-slate-400">
                      sin gestionar
                    </Badge>
                  )}
                  {s.pendingPayments > 0 && (
                    <Badge className="bg-amber-100 text-amber-800">
                      {s.pendingPayments} por revisar
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  {s.status
                    ? `Vence ${formatDate(s.status.expiresAt)} · ${s.status.daysRemaining} días`
                    : 'Sin período de facturación — no se le aplica ninguna restricción'}
                  {` · ${s.userCount} usuarios`}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingValidity(s)}>
                  <CalendarClock className="mr-1.5 h-3.5 w-3.5" />
                  Vigencia
                </Button>
                {s.status && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={
                      s.status.state === 'suspended'
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-red-600 hover:bg-red-50'
                    }
                    loading={suspend.isPending}
                    onClick={() =>
                      suspend.mutate({
                        institutionId: s.institutionId,
                        suspended: s.status?.state !== 'suspended',
                      })
                    }
                  >
                    {s.status.state === 'suspended' ? (
                      <>
                        <Unlock className="mr-1.5 h-3.5 w-3.5" />
                        Reactivar
                      </>
                    ) : (
                      <>
                        <Lock className="mr-1.5 h-3.5 w-3.5" />
                        Suspender
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </Card>
      </section>

      <ReviewDialog payment={reviewing} onClose={() => setReviewing(null)} />
      <ValidityDialog subscription={editingValidity} onClose={() => setEditingValidity(null)} />
    </div>
  )
}
