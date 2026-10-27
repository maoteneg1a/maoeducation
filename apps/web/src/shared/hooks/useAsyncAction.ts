import * as React from 'react'

/**
 * Ejecuta acciones asíncronas una sola vez por clave.
 * El ref bloquea inmediatamente, antes de que React alcance a renderizar el loader.
 */
export function useAsyncAction() {
  const locks = React.useRef(new Set<string>())
  const [pending, setPending] = React.useState<ReadonlySet<string>>(() => new Set())

  const run = React.useCallback(async <T,>(key: string, action: () => Promise<T>): Promise<T | undefined> => {
    if (locks.current.has(key)) return undefined
    locks.current.add(key)
    setPending((current) => new Set(current).add(key))
    try {
      return await action()
    } finally {
      locks.current.delete(key)
      setPending((current) => {
        const next = new Set(current)
        next.delete(key)
        return next
      })
    }
  }, [])

  const isPending = React.useCallback((key: string) => pending.has(key), [pending])

  return { run, isPending, hasPending: pending.size > 0 }
}
