import { MySignatureDialog } from '@/features/user-signature/components/MySignatureDialog'
import { useState } from 'react'
import { Menu, LogOut, KeyRound, Search, Sun, Moon, Monitor, ChevronDown, PenLine } from 'lucide-react'
import { ChildSwitcher } from '@/features/guardian/components/ChildSwitcher'
import { useNavigate } from 'react-router-dom'
import { useUIStore, type ThemeMode } from '@/store/ui.store'
import { useAuthStore } from '@/store/auth.store'
import { apiPost } from '@/shared/lib/api-client'
import { roleLabel } from '@/shared/lib/roles'
import { ChangePasswordDialog } from '@/features/auth/components/ChangePasswordDialog'
import { AiUsageBadge } from '@/features/ai-assistant/components/AiUsageBadge'
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { openCommandPalette } from './CommandPalette'
import { detachPushSubscription } from '@/shared/lib/push-subscription'

interface TopbarProps {
  onMobileMenuClick: () => void
}

const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ElementType }> = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function Topbar({ onMobileMenuClick }: TopbarProps) {
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)

  async function handleLogout() {
    try { await detachPushSubscription() } catch (error) { console.warn('No se pudo desvincular el dispositivo al cerrar sesión', error) }
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

  const primaryRole = user?.roles?.[0]
  const currentTheme = THEME_OPTIONS.find((o) => o.value === theme) ?? THEME_OPTIONS[0]

  return (
    <header className="h-14 border-b bg-background flex items-center px-4 gap-3 shrink-0">
      {/* Toggle sidebar (desktop) / open drawer (mobile) */}
      <button
        onClick={toggleSidebar}
        className="hidden p-1.5 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:block"
        aria-label="Contraer o expandir menú lateral"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Mobile: also show button */}
      <button
        onClick={onMobileMenuClick}
        className="p-1.5 rounded-md hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {/* Búsqueda global (⌘K) */}
      <button
        type="button"
        onClick={openCommandPalette}
        aria-label="Buscar (atajo: Ctrl o Cmd + K)"
        className="flex h-8 items-center gap-2 rounded-md border border-input bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
        <kbd className="hidden rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium sm:inline">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <div className="flex-1" />
      <ChildSwitcher />

      {/* User menu */}
      <div className="flex items-center gap-3">
        <AiUsageBadge />
        <NotificationCenter />

        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Menú de usuario"
              className="flex items-center gap-2 rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-sm font-medium leading-none">{user?.fullName}</span>
                <span className="text-xs text-muted-foreground">
                  {primaryRole ? roleLabel(primaryRole) : ''}
                </span>
              </div>

              {/* Avatar */}
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                  {initials}
                </div>
              )}
              <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <span className="truncate text-sm font-medium">{user?.fullName}</span>
                {user?.email && (
                  <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                )}
                {user?.roles && user.roles.length > 0 && (
                  <span className="truncate text-xs text-muted-foreground">
                    {user.roles.map(roleLabel).join(' · ')}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem onSelect={() => setSignatureOpen(true)}><PenLine />Mi firma</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setPwOpen(true)}>
              <KeyRound />
              Cambiar contraseña
            </DropdownMenuItem>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <currentTheme.icon />
                Tema: {currentTheme.label.toLowerCase()}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => setTheme(v as ThemeMode)}
                >
                  {THEME_OPTIONS.map((opt) => (
                    <DropdownMenuRadioItem key={opt.value} value={opt.value} className="gap-2">
                      <opt.icon className="h-4 w-4" aria-hidden="true" />
                      {opt.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={handleLogout}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <MySignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} />
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
    </header>
  )
}
