import { App as NativeApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useEffect, useState, type ReactNode } from 'react'
import { queryClient } from '@/shared/lib/query-client'

type Notice = { status: 'maintenance' } | {
  status: 'update_required' | 'update_available'
  release: { build: number; url: string }
}

function parseNotice(payload: unknown, platform: string, build: number): Notice | null {
  if (!payload || typeof payload !== 'object') return null
  const { status, release } = payload as { status?: string; release?: { build?: number; url?: string } }
  if (status === 'maintenance') return { status }
  if (status !== 'update_required' && status !== 'update_available') return null
  if (typeof release?.build !== 'number' || !Number.isSafeInteger(release.build) || release.build <= build || !release.url) return null
  const url = new URL(release.url)
  const store = platform === 'android' ? 'play.google.com' : 'apps.apple.com'
  if (url.protocol !== 'https:' || url.host !== store || url.username || url.password) return null
  return { status, release: { build: release.build, url: url.href } }
}

export function MobilePolicyGate({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null)
  const [dismissedBuild, setDismissedBuild] = useState<number | null>(null)
  const [attempt, setAttempt] = useState(0)
  const native = Capacitor.isNativePlatform()
  useEffect(() => {
    if (!native) return
    let active = true
    let request: AbortController | undefined
    async function refresh() {
      request?.abort()
      const controller = new AbortController()
      request = controller
      const timeout = window.setTimeout(() => controller.abort(), 5_000)
      try {
        const platform = Capacitor.getPlatform()
        const { build } = await NativeApp.getInfo()
        if (!/^[1-9]\d*$/.test(build)) return
        const base = import.meta.env.VITE_API_URL?.replace(/\/$/, '')
        if (!base) return
        const query = new URLSearchParams({ platform, build })
        const result = await fetch(`${base}/api/v1/mobile/policy?${query}`, { signal: controller.signal, cache: 'no-store' })
        if (!result.ok) return
        const next = parseNotice(await result.json(), platform, Number(build))
        if (active && !controller.signal.aborted) setNotice(next)
      } catch {
        // An unavailable policy endpoint must not block a working app.
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void refresh()
    const listener = NativeApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return
      void refresh()
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    })
    return () => {
      active = false
      request?.abort()
      void listener.then(handle => handle.remove()).catch(() => {})
    }
  }, [native, attempt])

  if (notice?.status === 'maintenance' || notice?.status === 'update_required') {
    return <main className="grid min-h-screen place-content-center gap-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{notice.status === 'maintenance' ? 'Auleka está en mantenimiento' : 'Actualización requerida'}</h1>
      {notice.status === 'update_required' && <a className="underline" href={notice.release.url} target="_blank" rel="noreferrer">Abrir la tienda</a>}
      <button type="button" className="rounded-lg border p-2" onClick={() => setAttempt(value => value + 1)}>Reintentar</button>
    </main>
  }
  return <>
    {notice?.status === 'update_available' && notice.release.build !== dismissedBuild &&
      <aside className="flex flex-wrap items-center justify-center gap-3 border-b bg-muted p-3 text-sm" aria-label="Actualización disponible">
        <span>Hay una actualización de Auleka.</span>
        <a className="font-semibold underline" href={notice.release.url} target="_blank" rel="noreferrer">Actualizar</a>
        <button type="button" onClick={() => setDismissedBuild(notice.release.build)}>Más tarde</button>
      </aside>}
    {children}
  </>
}
