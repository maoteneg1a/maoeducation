import { useSyncExternalStore } from 'react'
import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'

export interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmText?: string
  cancelText?: string
  /** Botón rojo para acciones destructivas (eliminar, descartar). */
  destructive?: boolean
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

// Store mínimo a nivel de módulo: permite llamar `confirmDialog()` desde
// cualquier handler (incluso fuera de componentes) sin prop-drilling.
let pending: PendingConfirm | null = null
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((l) => l())
}
function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

/**
 * Reemplazo accesible de `window.confirm()`. Devuelve una promesa con la
 * decisión del usuario. Requiere <ConfirmDialogHost /> montado una vez (app.tsx).
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  pending?.resolve(false)
  return new Promise((resolve) => {
    pending = { ...options, resolve }
    emit()
  })
}

function close(ok: boolean) {
  const current = pending
  pending = null
  emit()
  current?.resolve(ok)
}

export function ConfirmDialogHost() {
  const current = useSyncExternalStore(subscribe, () => pending)

  return (
    <Dialog open={!!current} onOpenChange={(open) => !open && close(false)}>
      <DialogContent className="max-w-md">
        {current && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {current.destructive && <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />}
                {current.title}
              </DialogTitle>
              {current.description && <DialogDescription>{current.description}</DialogDescription>}
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => close(false)}>
                {current.cancelText ?? 'Cancelar'}
              </Button>
              <Button
                variant={current.destructive ? 'destructive' : 'default'}
                onClick={() => close(true)}
                autoFocus
              >
                {current.confirmText ?? 'Confirmar'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
