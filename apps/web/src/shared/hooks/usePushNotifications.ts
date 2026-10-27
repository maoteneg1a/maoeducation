import { useState, useEffect } from 'react'
import { detachPushSubscription, supportsPushNotifications, syncPushSubscription } from '@/shared/lib/push-subscription'

type PushState = 'unsupported' | 'default' | 'granted' | 'denied'

export function usePushNotifications() {
  const [state, setState] = useState<PushState>('default')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!supportsPushNotifications()) {
      setState('unsupported')
      return
    }
    const perm = Notification.permission
    setState(perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'default')

    // Si el permiso ya está concedido en este dispositivo, sincronizar
    // silenciosamente al backend para que lleguen notificaciones aunque el
    // usuario no haya tocado "Activar" en esta sesión (p.ej. segundo teléfono).
    if (perm === 'granted') {
      syncPushSubscription().catch((error) => console.warn('No se pudo vincular este dispositivo a la cuenta actual', error))
    }
  }, [])

  async function subscribe() {
    if (state !== 'default') return
    setLoading(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setState('denied'); return }
      await syncPushSubscription()
      setState('granted')
    } catch (error) {
      console.warn('No se pudieron activar las notificaciones', error)
    } finally {
      setLoading(false)
    }
  }

  async function unsubscribe() {
    setLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const sub = await registration.pushManager.getSubscription()
      if (sub) {
        await detachPushSubscription()
        await sub.unsubscribe()
      }
      setState('default')
    } finally {
      setLoading(false)
    }
  }

  return { state, loading, subscribe, unsubscribe }
}
