import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'
import { isModuleEnabled } from '@/shared/lib/modules'

export function ModuleGuard({ module, children }: { module: string | readonly string[]; children?: React.ReactNode }) {
  const modules = useAuthStore((s) => s.user?.institution?.modules ?? null)
  if (!isModuleEnabled(modules, module)) return <Navigate to="/dashboard" replace />
  return <>{children ?? <Outlet />}</>
}
