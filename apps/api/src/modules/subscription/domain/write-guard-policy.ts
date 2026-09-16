/**
 * Qué alcanza el modo solo-lectura. Puro, sin dependencias: la política de qué
 * se bloquea es conocimiento de dominio y se testea sola; el hook de Fastify
 * que la aplica es otra cosa (infrastructure/middleware).
 */

/** Solo se interceptan métodos que escriben: consultar y exportar nunca se corta. */
export const MUTATING_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/**
 * Rutas que deben seguir funcionando con la suscripción vencida.
 *
 * `/api/v1/subscription` es la crítica: si se bloqueara la subida del
 * comprobante, el cliente no tendría forma de salir del bloqueo desde la app.
 */
export const EXEMPT_PREFIXES: readonly string[] = [
  '/api/v1/auth',         // login, refresh, logout, cambio de contraseña
  '/api/v1/platform',     // superadmin: tiene su propia autenticación
  '/api/v1/personal',     // registro y login de cuentas personales
  '/api/v1/subscription', // pagar y renovar
  '/api/v1/leads',        // formulario público de la landing
  '/api/v1/push',         // registro del dispositivo para notificaciones
]

/**
 * Compara por segmento completo, no por prefijo de texto: `/api/v1/authorizations`
 * empieza con `/api/v1/auth` pero no debe quedar exenta.
 */
export function isExempt(pathname: string): boolean {
  return EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** true si la petición debe evaluarse contra el estado de la suscripción. */
export function guardsRequest(method: string, pathname: string): boolean {
  return MUTATING_METHODS.has(method) && !isExempt(pathname)
}
