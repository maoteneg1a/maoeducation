/** Usuario que ejecuta una operación (derivado de req.user). */
export interface Actor {
  userId: string
  roles: string[]
  permissions: string[]
}

export function actorOf(user: { sub: string; roles: string[]; permissions: string[] }): Actor {
  return { userId: user.sub, roles: user.roles, permissions: user.permissions }
}

/** Admin y rectoría administran la institución (mismo criterio que requirePermission). */
export function isAuthority(actor: Actor): boolean {
  return actor.roles.includes('admin') || actor.roles.includes('rector')
}

/** `resource:action:scope` con las mismas reglas de requirePermission (manage ⊇ action, all ⊇ own). */
export function hasPermission(actor: Actor, resource: string, action: string, scope: 'own' | 'all'): boolean {
  if (isAuthority(actor)) return true
  return actor.permissions.some((p) => {
    const [r, a, s] = p.split(':')
    return (r === resource || r === '*') && (a === action || a === 'manage') && (s === scope || s === 'all')
  })
}
