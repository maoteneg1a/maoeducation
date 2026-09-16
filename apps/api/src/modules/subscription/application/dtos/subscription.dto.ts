import type { SubscriptionStatus } from '../../domain/subscription-state'

export type PaymentStatus = 'pending' | 'approved' | 'rejected'

export interface SubscriptionPaymentDto {
  id: string
  status: PaymentStatus
  amount: number | null
  currency: string
  transferredAt: string | null
  reference: string | null
  notes: string | null
  fileName: string
  mimeType: string
  fileSize: number
  /**
   * No se expone URL del comprobante: /uploads/* es público sin autenticación y
   * una captura de transferencia lleva datos bancarios. El cliente lo pide por
   * la ruta autenticada .../payments/:id/receipt y lo renderiza como blob.
   */
  uploadedBy: string
  uploaderName: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
}

/** Lo que ve el admin de la institución en su pantalla de suscripción. */
export interface SubscriptionDetailDto {
  /** null = institución sin suscripción gestionada (sin restricciones). */
  status: SubscriptionStatus | null
  notes: string | null
  payments: SubscriptionPaymentDto[]
}

export interface SubmitPaymentDto {
  amount?: number
  currency?: string
  transferredAt?: string
  reference?: string
  notes?: string
}

export interface ReceiptFileDto {
  fileName: string
  storedName: string
  mimeType: string
  fileSize: number
}

/** Fila de la lista de suscripciones del panel de superadmin. */
export interface PlatformSubscriptionDto {
  institutionId: string
  institutionName: string
  institutionCode: string
  accountType: 'personal' | 'institution'
  userCount: number
  status: SubscriptionStatus | null
  notes: string | null
  pendingPayments: number
  lastPaymentAt: string | null
}

/** Comprobante en la bandeja de revisión, con la institución que lo subió. */
export interface PendingPaymentDto extends SubscriptionPaymentDto {
  institutionId: string
  institutionName: string
  currentExpiresAt: string | null
}

export interface ApprovePaymentDto {
  /** Vigencia nueva. El superadmin la puede editar antes de aprobar. */
  expiresAt: string
  amount?: number
  reviewNotes?: string
}

export interface SetValidityDto {
  expiresAt: string
  plan?: 'trial' | 'paid'
  graceDays?: number
  notes?: string
}
