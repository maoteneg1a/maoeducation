import { useCallback, useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'

const DISCARD_OPTIONS = {
  title: '¿Descartar los cambios sin guardar?',
  description: 'Tienes cambios que todavía no se guardaron. Si continúas, se perderán.',
  confirmText: 'Descartar cambios',
  cancelText: 'Seguir editando',
  destructive: true,
} as const

/**
 * Protege un formulario con cambios pendientes:
 * - avisa al cerrar/recargar la pestaña (beforeunload);
 * - pide confirmación al navegar a otra ruta de la app;
 * - devuelve `confirmDiscard()` para usar antes de cambiar de curso/fecha/actividad.
 */
export function useUnsavedChanges(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (blocker.state !== 'blocked') return
    void confirmDialog(DISCARD_OPTIONS).then((ok) => (ok ? blocker.proceed() : blocker.reset()))
  }, [blocker])

  /** true si no hay cambios o el usuario acepta descartarlos. */
  const confirmDiscard = useCallback(async () => {
    if (!isDirty) return true
    return confirmDialog(DISCARD_OPTIONS)
  }, [isDirty])

  return { confirmDiscard }
}
