import { useEffect } from 'react'
import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { AlertTriangle, Home, RotateCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

const CHUNK_RELOAD_FLAG = 'auleka.chunk-reload'

/**
 * Detecta errores de carga de chunks (típicos tras un despliegue nuevo: el
 * navegador pide un archivo JS con hash viejo que ya no existe).
 */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message}`
      : typeof error === 'string'
        ? error
        : ''
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk [\w-]+ failed/i.test(
    message,
  )
}

/**
 * Recarga la página una sola vez ante un error de chunk. La marca en
 * sessionStorage guarda la hora de la recarga: si el error se repite enseguida
 * (el chunk realmente no existe) no se vuelve a recargar y se muestra el
 * fallback; si ocurre mucho después (otro despliegue) se permite de nuevo.
 * Devuelve true si disparó la recarga.
 */
export function reloadOnceForChunkError(error: unknown): boolean {
  if (!isChunkLoadError(error)) return false
  try {
    const last = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) ?? 0)
    if (last && Date.now() - last < 60_000) return false
    sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}

export function ErrorFallback({ error }: { error?: unknown }) {
  const chunkError = isChunkLoadError(error)
  const notFound = isRouteErrorResponse(error) && error.status === 404

  const title = notFound
    ? 'Página no encontrada'
    : chunkError
      ? 'Hay una nueva versión disponible'
      : 'Algo salió mal'
  const description = notFound
    ? 'La página que buscas no existe o fue movida.'
    : chunkError
      ? 'La aplicación se actualizó mientras la usabas. Recarga la página para continuar.'
      : 'Ocurrió un error inesperado al mostrar esta página. Puedes intentar de nuevo o volver al inicio.'

  const reload = () => {
    try { sessionStorage.removeItem(CHUNK_RELOAD_FLAG) } catch { /* ignore */ }
    window.location.reload()
  }

  return (
    <div role="alert" className="flex min-h-[60vh] w-full items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {import.meta.env.DEV && error instanceof Error && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reload}>
            <RotateCw className="h-4 w-4" />
            Reintentar
          </Button>
          <Button variant="outline" onClick={() => window.location.assign('/')}>
            <Home className="h-4 w-4" />
            Ir al inicio
          </Button>
        </div>
      </div>
    </div>
  )
}

/** `errorElement` para las rutas de react-router. */
export function RouteErrorBoundary() {
  const error = useRouteError()

  useEffect(() => {
    if (!reloadOnceForChunkError(error)) {
      console.error(error)
    }
  }, [error])

  return <ErrorFallback error={error} />
}
