import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { useEffect, useState } from 'react'
import { apiClient, apiGet } from '@/shared/lib/api-client'
import { queryClient } from '@/shared/lib/query-client'
import { useAuthStore } from '@/store/auth.store'

let registered: { userId: string; token: string } | undefined

export async function detachNativePush() {
  if (!Capacitor.isPluginAvailable('PushNotifications')) return
  const device = registered
  registered = undefined
  try {
    if (device && device.userId === useAuthStore.getState().user?.id) {
      await apiClient.post('mobile/push/unregister', { json: { token: device.token }, timeout: 5_000 })
    }
  } finally {
    await PushNotifications.unregister()
  }
}

export function NativePushSetup() {
  const userId = useAuthStore(state => state.user?.id)
  const [offer, setOffer] = useState(false)
  useEffect(() => {
    if (!userId || Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('PushNotifications')) return
    let active = true
    const handles = [
      PushNotifications.addListener('registration', async ({ value }) => {
        if (!active || useAuthStore.getState().user?.id !== userId) return
        try {
          await apiClient.post('mobile/push/register', { json: { token: value } })
          if (active) registered = { userId, token: value }
        } catch {
          // The notification history is available even when registration fails.
        }
      }),
      PushNotifications.addListener('pushNotificationReceived', () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }),
      PushNotifications.addListener('pushNotificationActionPerformed', () => {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      }),
    ]
    void Promise.all(handles).then(async () => {
      const policy = await apiGet<{ nativePush: boolean }>('mobile/features')
      if (!active || !policy.nativePush) return
      const { receive } = await PushNotifications.checkPermissions()
      if (!active) return
      if (receive === 'granted') await PushNotifications.register()
      else if (receive !== 'denied') setOffer(true)
    }).catch(() => {})
    return () => {
      active = false
      setOffer(false)
      for (const handle of handles) void handle.then(listener => listener.remove()).catch(() => {})
    }
  }, [userId])

  if (!offer) return null
  return <aside className="flex flex-wrap items-center justify-center gap-3 border-b bg-muted p-3 text-sm">
    <span>Recibe los avisos de Auleka en este dispositivo.</span>
    <button type="button" className="font-semibold underline" onClick={async () => {
      setOffer(false)
      try {
        const { receive } = await PushNotifications.requestPermissions()
        if (receive === 'granted') await PushNotifications.register()
      } catch { /* In-app notifications remain available. */ }
    }}>Activar notificaciones</button>
    <button type="button" onClick={() => setOffer(false)}>Más tarde</button>
  </aside>
}
