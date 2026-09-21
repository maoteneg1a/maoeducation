import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/auth.store'

interface PrivateRouteProps {
  children: React.ReactNode
}

// El wizard de onboarding (/personal/setup, PersonalSetupPage) se eliminó —
// toda cuenta personal ya nace con setupComplete=true desde /personal/register
// (año lectivo/niveles ya existen por bootstrapInstitution, y "Mis grados y
// materias" cubre la única edición real que el docente necesita). Este
// componente ya no redirige a ningún wizard obligatorio.
export function PrivateRoute({ children }: PrivateRouteProps) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const location = useLocation()

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
