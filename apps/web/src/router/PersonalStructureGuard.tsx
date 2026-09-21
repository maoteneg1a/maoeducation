import { Outlet } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'

/**
 * Bloquea las pantallas de estructura académica (niveles, materias, años,
 * paralelos, asignaciones, insumos) para cuentas personales de profesor.
 *
 * El año lectivo/niveles ya nacen creados desde bootstrapInstitution al
 * registrarse (/personal/register) — la única edición que el docente
 * necesita es grado+materia, que vive en /settings/mis-grados-y-materias
 * (PersonalClassesPage), no en las pantallas de administración académica
 * pensadas para instituciones con admin. El bloqueo es tanto de sidebar
 * (ver Sidebar.tsx, hideForPersonal) como de ruta directa: entrar a
 * /academic/levels por URL con una cuenta personal cae aquí en vez de en la
 * página real.
 *
 * No toca el permiso de backend academic_config:manage — ese permiso
 * también gatea /settings/formato-planificacion (plantillas de PDF), que sí
 * debe seguir disponible para cuentas personales. Separar ambos casos es un
 * gate de solo-frontend a propósito, para no tener que partir el permiso en
 * dos en el RBAC del backend.
 */
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
          La estructura académica (niveles, materias, años, paralelos) se configuró una sola vez
          desde el asistente inicial. Si necesitas cambiar algo importante, contáctanos.
        </p>
      </div>
    )
  }

  return <Outlet />
}
