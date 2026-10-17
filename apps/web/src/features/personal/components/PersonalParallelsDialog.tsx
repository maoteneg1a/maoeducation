import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import type { Parallel } from '@/features/enrollment/api/enrollment.api'
import { personalApi } from '../api/personal.api'

interface Props {
  parallels: Parallel[]
  yearName?: string
  disabled?: boolean
  onDeleted: (parallelId: string) => void
}

export function PersonalParallelsDialog({ parallels, yearName, disabled, onDeleted }: Props) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Parallel | null>(null)
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: personalApi.deleteParallel,
    onSuccess: (_, id) => {
      setSelected(null)
      onDeleted(id)
      for (const key of ['parallels', 'personal-classes', 'course-assignments', 'my-course-assignments', 'enrollments']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
      toast.success('Paralelo eliminado')
    },
  })

  return (
    <Dialog open={open} onOpenChange={(value) => {
      if (remove.isPending) return
      setOpen(value)
      setSelected(null)
      remove.reset()
    }}>
      <Button variant="outline" disabled={disabled} onClick={() => { setOpen(true); remove.reset() }}>
        <Settings2 className="h-4 w-4" /> Gestionar paralelos
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{selected ? 'Eliminar paralelo' : 'Mis paralelos'}</DialogTitle>
          <DialogDescription>
            {selected
              ? 'Se eliminarán este paralelo y sus asignaciones de materias vacías.'
              : `Paralelos de ${yearName ?? 'este año'}. Puedes eliminar los que no tengan estudiantes ni registros académicos.`}
          </DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className="space-y-3">
            <p className="font-medium break-words">{selected.level.name} - {selected.name}</p>
            <p className="text-sm text-muted-foreground">
              Las materias del catálogo y el grado se conservarán. Esta acción no se puede deshacer.
            </p>
            {remove.isError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(remove.error)}</p>}
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2">
            {parallels.length === 0 && <p className="text-sm text-muted-foreground">No hay paralelos en este año.</p>}
            {parallels.map((parallel) => (
              <div key={parallel.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium break-words">{parallel.level.name} - {parallel.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {parallel._count.enrollments} matrícula(s)
                    {parallel._count.courseAssignments !== undefined && ` · ${parallel._count.courseAssignments} materia(s)`}
                  </p>
                  {parallel._count.enrollments > 0 && (
                    <p className="text-xs text-muted-foreground">Tiene matrículas registradas; se conserva su historial.</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 text-destructive" disabled={parallel._count.enrollments > 0}
                  aria-label={`Eliminar ${parallel.level.name} - ${parallel.name}`}
                  onClick={() => { setSelected(parallel); remove.reset() }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          {selected ? (
            <>
              <Button variant="outline" disabled={remove.isPending} onClick={() => { setSelected(null); remove.reset() }}>Cancelar</Button>
              <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate(selected.id)}>Eliminar paralelo</Button>
            </>
          ) : <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
