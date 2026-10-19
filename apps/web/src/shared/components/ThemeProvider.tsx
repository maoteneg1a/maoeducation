import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth.store'
import { useUIStore } from '@/store/ui.store'

/**
 * Aplica el branding de la institución (color primario / sidebar) sobre las
 * variables CSS del theme. Los colores llegan como cadenas HSL "H S% L%".
 * Si no hay branding, restablece los valores por defecto de globals.css.
 *
 * También aplica el modo claro/oscuro (clase `dark` en <html>). El branding se
 * escribe como estilo inline en <html>, por lo que tiene prioridad sobre los
 * valores de `:root` y `.dark` y se respeta en ambos modos.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const branding = useAuthStore((s) => s.user?.institution?.branding ?? null)
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      root.classList.toggle('dark', dark)
    }
    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    const root = document.documentElement

    if (branding?.primaryColor) {
      root.style.setProperty('--primary', branding.primaryColor)
      root.style.setProperty('--ring', branding.primaryColor)
    } else {
      root.style.removeProperty('--primary')
      root.style.removeProperty('--ring')
    }

    if (branding?.sidebarColor) {
      root.style.setProperty('--sidebar', branding.sidebarColor)
    } else {
      root.style.removeProperty('--sidebar')
    }
  }, [branding?.primaryColor, branding?.sidebarColor])

  return <>{children}</>
}
