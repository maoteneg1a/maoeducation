import { useCallback } from 'react'
import { useAuthStore } from '@/store/auth.store'

export function usePermissions() {
  const user = useAuthStore((s) => s.user)
  const permissions = user?.permissions ?? []
  const roles = user?.roles ?? []

  const hasPermission = useCallback(
    (required: string) => {
      const parts = required.split(':')
      const [reqResource, reqAction, reqScope] = parts
      if (roles.includes('admin')) return true
      if (roles.includes('rector') && !['platform', 'subscription', 'leads'].includes(reqResource)) return true

      return permissions.some((p) => {
        const [pResource, pAction, pScope] = p.split(':')
        const resourceMatch = pResource === reqResource || pResource === '*'
        const actionMatch   = pAction === reqAction || pAction === 'manage'

        if (!reqScope) return resourceMatch && actionMatch

        const scopeMatch = pScope === reqScope || pScope === 'all'
        return resourceMatch && actionMatch && scopeMatch
      })
    },
    [permissions, roles],
  )

  const hasRole = useCallback((role: string) => roles.includes(role), [roles])

  const hasAnyRole = useCallback(
    (...rolesToCheck: string[]) => rolesToCheck.some((r) => roles.includes(r)),
    [roles],
  )

  return { hasPermission, hasRole, hasAnyRole, permissions, roles }
}
