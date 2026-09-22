import { apiClient, apiGet } from '@/shared/lib/api-client'

export type SubscriptionState = 'trial' | 'active' | 'grace' | 'readonly' | 'suspended'

export interface SubscriptionStatus {
  state: SubscriptionState
  plan: 'trial' | 'paid'
  startsAt: string
  expiresAt: string
  graceEndsAt: string
  daysRemaining: number
  expiringSoon: boolean
  readOnly: boolean
}

export type PaymentStatus = 'pending' | 'approved' | 'rejected'

export interface SubscriptionPayment {
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
  uploadedBy: string
  uploaderName: string | null
  reviewedAt: string | null
  reviewNotes: string | null
  createdAt: string
}

export interface SubscriptionDetail {
  /** null = institución sin suscripción gestionada (sin restricciones). */
  status: SubscriptionStatus | null
  notes: string | null
  payments: SubscriptionPayment[]
}

export interface SubmitPaymentPayload {
  file: File
  amount?: string
  currency?: string
  transferredAt?: string
  reference?: string
  notes?: string
}

export const subscriptionApi = {
  getStatus: () => apiGet<{ status: SubscriptionStatus | null; aiEnabled: boolean }>('subscription/status'),

  getDetail: () => apiGet<SubscriptionDetail>('subscription'),

  submitPayment: async (payload: SubmitPaymentPayload): Promise<SubscriptionPayment> => {
    const form = new FormData()
    // El archivo va al final: @fastify/multipart expone data.fields solo con las
    // partes de texto que llegaron ANTES del archivo en el stream.
    for (const key of ['amount', 'currency', 'transferredAt', 'reference', 'notes'] as const) {
      const value = payload[key]
      if (value) form.append(key, value)
    }
    form.append('file', payload.file)
    return apiClient.post('subscription/payments', { body: form }).json<SubscriptionPayment>()
  },

  /**
   * El comprobante se descarga como blob porque su ruta exige el header de
   * autorización — un <img src> no lo manda. Quien llame debe revocar la URL.
   */
  getReceiptUrl: async (paymentId: string): Promise<string> => {
    const blob = await apiClient.get(`subscription/payments/${paymentId}/receipt`).blob()
    return URL.createObjectURL(blob)
  },
}
