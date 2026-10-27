import { apiClient, apiGet, apiPost } from '@/shared/lib/api-client'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

export function supportsPushNotifications() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

/** Vincula la suscripción de esta instalación con el usuario autenticado actual. */
export async function syncPushSubscription() {
  if (!supportsPushNotifications() || Notification.permission !== 'granted') return

  const { publicKey } = await apiGet<{ publicKey: string | null }>('push/vapid-public-key')
  if (!publicKey) return

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    })
  }

  const json = subscription.toJSON()
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('La suscripción push no contiene claves válidas')

  await apiPost('push/subscribe', {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
}

/**
 * Desvincula la cuenta actual sin cancelar la suscripción del navegador.
 * Así el mismo iPhone puede vincularla a la próxima cuenta que inicie sesión.
 */
export async function detachPushSubscription() {
  if (!supportsPushNotifications()) return
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  await apiClient.delete('push/subscribe', { json: { endpoint: subscription.endpoint } })
}
