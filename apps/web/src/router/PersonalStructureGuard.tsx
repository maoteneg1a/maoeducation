import { Outlet } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

/** Las cuentas personales editan grados y materias en /settings/mis-grados.
 * Años y períodos se administran fuera de este guard en /academic/years. */
export function PersonalStructureGuard() {
  const institution = useAuthStore((s) => s.user?.institution ?? null)

  if (institution?.accountType === 'personal') {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center gap-3">
        <div className="rounded-full bg-muted p-4">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h2 className="text-lg font-semibold">No disponible en tu cuenta personal</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Puedes configurar tus clases en «Mis grados y materias» y tu calendario en «Años lectivos».
        </p>
      </div>
    )
  }

  return <Outlet />
}
