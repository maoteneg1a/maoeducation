import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'

interface PrivateRouteProps {
  children: React.ReactNode
}

const SETUP_PATH = '/personal/setup'

export function PrivateRoute({ children }: PrivateRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const institution = useAuthStore((s) => s.user?.institution ?? null)
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Cuenta personal de profesor sin terminar el wizard de setup: no puede
  // navegar a ninguna otra ruta protegida (ni con URL directa) hasta
  // completar /personal/setup — ver PersonalSetupPage.
  const needsPersonalSetup =
    institution?.accountType === 'personal' && institution.setupComplete !== true
  if (needsPersonalSetup && location.pathname !== SETUP_PATH) {
    return <Navigate to={SETUP_PATH} replace />
  }

  return <>{children}</>
}
