import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { Bell, Smartphone, X, Share, Plus, MoreVertical } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { usePushNotifications } from '@/shared/hooks/usePushNotifications'
import { usePwaInstall } from '@/shared/hooks/usePwaInstall'

const DISMISSED_KEY = 'pwa-banner-dismissed-until'

function isDismissed() {
  const until = localStorage.getItem(DISMISSED_KEY)
  return until ? Date.now() < Number(until) : false
}

function dismiss() {
  // No volver a mostrar por 30 días
  localStorage.setItem(DISMISSED_KEY, String(Date.now() + 30 * 24 * 60 * 60 * 1000))
}

/**
 * Banner de onboarding PWA — muestra las CTAs de notificaciones e instalación.
 * Solo aparece cuando hay algo accionable (permisos no pedidos o app no instalada).
 * Se oculta al presionar X y no vuelve por 30 días.
 */
export function PwaOnboardingBanner() {
  if (Capacitor.isNativePlatform()) return null
  return <BrowserOnboardingBanner />
}

function BrowserOnboardingBanner() {
  const push = usePushNotifications()
  const pwa = usePwaInstall()
  const [hidden, setHidden] = useState(isDismissed)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [showAndroidGuide, setShowAndroidGuide] = useState(false)

  const needsNotif = push.state === 'default'
  const needsInstall = !pwa.isInstalled && (pwa.canInstall || pwa.isIOS || pwa.isAndroid)

  // Push no soportado en Safari iOS fuera de PWA → ocultar solo la sección
  // de notificaciones, pero mostrar igual el botón de instalar
  const pushSupported = push.state !== 'unsupported'
  const showNotif   = pushSupported && needsNotif
  const showInstall = needsInstall

  if (hidden) return null
  if (!showNotif && !showInstall) return null

  function handleDismiss() {
    dismiss()
    setHidden(true)
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 relative">
      <button
        onClick={handleDismiss}
        className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Cerrar"
      >
        <X className="h-4 w-4" />
      </button>

      <p className="text-sm font-semibold text-foreground mb-3 pr-6">
        {(pwa.isIOS || pwa.isAndroid) && !pushSupported
          ? '📱 Instala Auleka para recibir notificaciones'
          : 'Mejora tu experiencia en Auleka'}
      </p>

      <div className="flex flex-col gap-2.5">
        {/* Notificaciones */}
        {showNotif && (
          <div className="flex items-start gap-3 bg-background rounded-lg border p-3">
            <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <Bell className="h-4 w-4 text-amber-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Activa las notificaciones</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Recibe alertas al instante cuando tu hijo falta, llega tarde o hay un mensaje nuevo
              </p>
            </div>
            <Button
              size="sm"
              onClick={push.subscribe}
              disabled={push.loading}
              className="shrink-0 mt-0.5"
            >
              {push.loading ? 'Activando…' : 'Activar'}
            </Button>
          </div>
        )}

        {/* Instalar PWA — Android: botón nativo (Chrome detectó el prompt) */}
        {showInstall && pwa.canInstall && (
          <div className="flex items-start gap-3 bg-background rounded-lg border p-3">
            <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
              <Smartphone className="h-4 w-4 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Instala Auleka en tu Android</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ábrela en un toque desde tu pantalla de inicio, sin el navegador
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={pwa.install} className="shrink-0 mt-0.5">
              Instalar
            </Button>
          </div>
        )}

        {/* Instalar PWA — Android: guía manual (sin prompt nativo disponible) */}
        {showInstall && pwa.isAndroid && !pwa.canInstall && (
          <div className="flex flex-col gap-2 bg-background rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Instala Auleka en tu Android</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ábrela en un toque desde tu pantalla de inicio
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowAndroidGuide((v) => !v)}
                className="shrink-0 mt-0.5"
              >
                Ver cómo
              </Button>
            </div>
            {showAndroidGuide && (
              <div className="mt-1 ml-12 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
                  <span className="flex items-center gap-1.5">
                    Toca <MoreVertical className="h-3.5 w-3.5 inline shrink-0" /> <strong>el menú</strong> (tres puntos arriba a la derecha)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
                  <span>Selecciona <strong>"Agregar a pantalla de inicio"</strong></span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">3</span>
                  <span>Toca <strong>"Agregar"</strong> en el diálogo que aparece</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instalar PWA — iOS */}
        {showInstall && pwa.isIOS && (
          <div className="flex flex-col gap-2 bg-background rounded-lg border p-3">
            <div className="flex items-start gap-3">
              <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                <Smartphone className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">Agrega a tu pantalla de inicio</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  En iPhone/iPad, instala Auleka en 2 pasos
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowIosGuide((v) => !v)}
                className="shrink-0 mt-0.5"
              >
                Ver cómo
              </Button>
            </div>

            {showIosGuide && (
              <div className="mt-1 ml-12 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">1</span>
                  <span className="flex items-center gap-1">
                    Toca el botón <Share className="h-3.5 w-3.5 inline text-blue-500" /> <strong>Compartir</strong> en Safari
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">2</span>
                  <span className="flex items-center gap-1">
                    Selecciona <Plus className="h-3.5 w-3.5 inline" /> <strong>Agregar a pantalla de inicio</strong>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {pushSupported && push.state === 'denied' && (
          <p className="text-xs text-muted-foreground text-center">
            Las notificaciones están bloqueadas. Para activarlas ve a la configuración de tu navegador y permite las notificaciones para este sitio.
          </p>
        )}
      </div>
    </div>
  )
}
