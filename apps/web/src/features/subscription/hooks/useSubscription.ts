import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getErrorMessage } from '@/shared/lib/utils'
import { subscriptionApi, type SubmitPaymentPayload } from '../api/subscription.api'

export const subscriptionKeys = {
  status: ['subscription-status'] as const,
  detail: ['subscription-detail'] as const,
}

/**
 * Estado para el banner global. Lo consulta cualquier usuario autenticado.
 *
 * Se refresca cada 15 min y al volver a la pestaña: si el superadmin aprueba el
 * pago mientras el cliente tiene la app abierta, el banner de bloqueo debe
 * desaparecer sin que tenga que recargar a mano.
 */
export function useSubscriptionStatus() {
  return useQuery({
    queryKey: subscriptionKeys.status,
    queryFn: subscriptionApi.getStatus,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    refetchOnWindowFocus: true,
    // El banner no debe romper la app si el endpoint falla.
    retry: 1,
  })
}

export function useSubscriptionDetail() {
  return useQuery({
    queryKey: subscriptionKeys.detail,
    queryFn: subscriptionApi.getDetail,
  })
}

export function useSubmitPayment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (payload: SubmitPaymentPayload) => subscriptionApi.submitPayment(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.detail })
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.status })
      toast.success('Comprobante enviado. Lo revisamos y activamos tu cuenta.')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}
