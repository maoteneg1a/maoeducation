import { ConflictError } from '../../../../shared/domain/errors/app.errors'

/**
 * Candado de idempotencia EN MEMORIA DEL PROCESO — evita que un doble clic o
 * un retry accidental del frontend dispare dos generaciones simultáneas
 * (facturadas por separado) para exactamente la misma semana/proyecto. NO es
 * un lock distribuido: si la API corre con más de una réplica, dos requests
 * que caigan en réplicas distintas no se ven entre sí. Cubre el caso real más
 * común (mismo usuario, misma pestaña, doble clic) sin agregar Redis — el
 * proyecto no tiene infraestructura de lock distribuido todavía; si se agrega
 * (ej. al escalar a >1 réplica), migrar esta clave a un `SET NX` de Redis.
 */
const inFlight = new Set<string>()

export function withGenerationLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (inFlight.has(key)) {
    throw new ConflictError('Ya hay una generación de IA en curso para esta semana — espera a que termine.')
  }
  inFlight.add(key)
  return fn().finally(() => inFlight.delete(key))
}
