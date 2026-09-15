import { Outlet, useNavigate, NavLink } from 'react-router-dom'
import { BarChart3, Building2, CreditCard, LogOut, ShieldCheck, MessageSquare } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { usePlatformAuthStore } from '@/store/platformAuth.store'
import { platformApiClient } from '@/shared/lib/platform-api-client'

export function PlatformLayout() {
  const admin = usePlatformAuthStore((s) => s.admin)
  const clearAuth = usePlatformAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await platformApiClient.post('platform/logout')
    } catch {
      /* ignore */
    }
    clearAuth()
    navigate('/platform/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-slate-900 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <span className="font-semibold font-display">Auleka · Plataforma</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <Building2 className="h-4 w-4" />
              {admin?.name ?? admin?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-200 hover:text-white">
              <LogOut className="mr-2 h-4 w-4" />
              Salir
            </Button>
          </div>
        </div>
      </header>

      <nav className="border-b bg-slate-800">
        <div className="mx-auto flex max-w-6xl gap-1 px-6">
          <NavLink
            to="/platform/stats"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${isActive ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`
            }
          >
            <BarChart3 className="h-4 w-4" />
            Estadísticas
          </NavLink>
          <NavLink
            to="/platform"
            end
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${isActive ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`
            }
          >
            <Building2 className="h-4 w-4" />
            Instituciones
          </NavLink>
          <NavLink
            to="/platform/subscriptions"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${isActive ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`
            }
          >
            <CreditCard className="h-4 w-4" />
            Suscripciones
          </NavLink>
          <NavLink
            to="/platform/leads"
            className={({ isActive }) =>
              `flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 ${isActive ? 'border-primary text-white' : 'border-transparent text-slate-400 hover:text-slate-200'}`
            }
          >
            <MessageSquare className="h-4 w-4" />
            Leads
          </NavLink>
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
