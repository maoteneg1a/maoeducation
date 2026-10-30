import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'

export function ModuleGuard({ module, children }: { module: string; children?: React.ReactNode }) {
  const modules = useAuthStore((s) => s.user?.institution?.modules ?? null)
  if (modules && !modules.includes(module)) return <Navigate to="/dashboard" replace />
  return <>{children ?? <Outlet />}</>
}
