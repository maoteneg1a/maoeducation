import { useEffect, useState } from 'react'
import { Eye, LogOut } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

/** Franja fija mientras un superadmin navega "como" otro usuario. */
export function ImpersonationBanner() {
  const user = useAuthStore((s) => s.user)
  const impersonation = useAuthStore((s) => s.impersonation)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!impersonation) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [impersonation])

  if (!impersonation || !user) return null

  const minutesLeft = Math.max(0, Math.ceil((new Date(impersonation.expiresAt).getTime() - now) / 60_000))
  const exit = () => {
    clearAuth()
    window.location.href = '/platform/stats'
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-amber-950"
    >
      <span className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" aria-hidden />
        Estás viendo la app como <strong>{user.fullName}</strong> ({user.email}). Todo lo que hagas queda auditado.
        <span className="opacity-80">· {minutesLeft} min restantes</span>
      </span>
      <button
        type="button"
        onClick={exit}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-950/10 px-3 py-1 hover:bg-amber-950/20"
      >
        <LogOut className="h-4 w-4" aria-hidden />
        Salir de la suplantación
      </button>
    </div>
  )
}
