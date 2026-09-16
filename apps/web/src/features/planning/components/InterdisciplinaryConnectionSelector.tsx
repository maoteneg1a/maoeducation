import * as React from 'react'
import { Network } from 'lucide-react'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/lib/utils'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'

interface InterdisciplinaryConnectionSelectorProps {
  subjectIds: string[]
  onSubjectIdsChange: (ids: string[]) => void
  isEditable: boolean
}

/**
 * Selector de "Conexión interdisciplinar" — pedido explícito del usuario: el
 * docente elige entre SUS PROPIAS materias asignadas (CourseAssignment del año
 * activo), no el catálogo completo de asignaturas de la institución. Se
 * considera "interdisciplinar" solo con 2 o más materias seleccionadas — con 0
 * o 1 se avisa que no cuenta como tal, pero no se bloquea el guardado (el
 * docente puede estar a mitad de armar la selección).
 */
export function InterdisciplinaryConnectionSelector({
  subjectIds,
  onSubjectIdsChange,
  isEditable,
}: InterdisciplinaryConnectionSelectorProps) {
  const { assignments } = useTeacherDefaults()

  // Un docente puede tener varias asignaciones de la MISMA materia (distintos
  // paralelos) — se deduplica por subjectId para no mostrar la misma materia
  // repetida en el selector.
  const subjects = React.useMemo(() => {
    const seen = new Map<string, { id: string; name: string }>()
    for (const a of assignments) {
      const subject = a.subject
      if (subject && !seen.has(subject.id)) seen.set(subject.id, subject)
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [assignments])

  const toggle = (id: string) => {
    onSubjectIdsChange(subjectIds.includes(id) ? subjectIds.filter((s) => s !== id) : [...subjectIds, id])
  }

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Network className="h-3.5 w-3.5" />
        Conexión interdisciplinar
      </Label>
      {subjects.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tienes otras materias asignadas para conectar.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {subjects.map((subject) => {
              const selected = subjectIds.includes(subject.id)
              return (
                <button
                  key={subject.id}
                  type="button"
                  disabled={!isEditable}
                  onClick={() => toggle(subject.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    selected ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:text-foreground',
                    !isEditable && 'cursor-default opacity-70',
                  )}
                >
                  {subject.name}
                </button>
              )
            })}
          </div>
          {subjectIds.length === 1 && (
            <p className="text-xs text-amber-600">Selecciona al menos 2 materias para que cuente como conexión interdisciplinar.</p>
          )}
        </>
      )}
    </div>
  )
}
