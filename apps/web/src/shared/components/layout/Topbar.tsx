import { useState } from 'react'
import { Menu, LogOut, KeyRound } from 'lucide-react'
import { ChildSwitcher } from '@/features/guardian/components/ChildSwitcher'
import { useNavigate } from 'react-router-dom'
import { useUIStore } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { Button } from '@/shared/components/ui/button'
import { apiPost } from '@/shared/lib/api-client'
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog'
import { AiUsageBadge } from '@/features/ai-assistant/components/AiUsageBadge'

interface TopbarProps {
  onMobileMenuClick: () => void
}

export function Topbar({ onMobileMenuClick }: TopbarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [pwOpen, setPwOpen] = useState(false)

  async function handleLogout() {
    try { await apiPost('/auth/logout') } catch { /* ignore */ }
    clearAuth()
    navigate('/login')
  }

  const initials = user?.fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase() ?? '?'

  return (
    <header className="h-14 border-b bg-background flex items-center px-4 gap-3 shrink-0">
      {/* Toggle sidebar (desktop) / open drawer (mobile) */}
      <button
        onClick={toggleSidebar}
        className="hidden p-1.5 rounded-md hover:bg-muted transition-colors md:block"
        aria-label="Toggle menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile: also show button */}
      <button
        onClick={onMobileMenuClick}
        className="p-1.5 rounded-md hover:bg-muted transition-colors md:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex-1" />
      <ChildSwitcher />

      {/* User menu */}
      <div className="flex items-center gap-3">
        <AiUsageBadge />

        <div className="hidden sm:flex flex-col items-end">
          <span className="text-sm font-medium leading-none">{user?.fullName}</span>
          <span className="text-xs text-muted-foreground capitalize">
            {user?.roles?.[0] ?? ''}
          </span>
        </div>

        {/* Avatar */}
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.fullName}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
            {initials}
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPwOpen(true)}
          title="Cambiar mi contraseña"
          className="h-8 w-8"
        >
          <KeyRound className="h-4 w-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Cerrar sesión"
          className="h-8 w-8"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>

      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </header>
  )
}
