import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import type { CourseAssignment } from '@/features/academic/api/academic.api'
import { activitiesApi } from '../api/activities.api'

interface TeacherInsumoDialogProps {
  assignments: CourseAssignment[]
  periods: Array<{ id: string; name: string; isClosed?: boolean }>
  initialPeriodId: string
  initialNames: string[]
  onClose: () => void
}

export function TeacherInsumoDialog({ assignments, periods, initialPeriodId, initialNames, onClose }: TeacherInsumoDialogProps) {
  const qc = useQueryClient()
  const lock = React.useRef(false)
  const [periodId, setPeriodId] = React.useState(
    periods.find((period) => period.id === initialPeriodId && !period.isClosed)?.id
      || periods.find((period) => !period.isClosed)?.id || '',
  )
  const [selected, setSelected] = React.useState(assignments.map((assignment) => assignment.id))
  const [names, setNames] = React.useState([...new Set(initialNames)])
  const [custom, setCustom] = React.useState('')
  const suggestions = [...new Set([...initialNames, 'Deberes', 'Trabajos en clase', 'Lecciones', 'Pruebas', ...names])]
  const create = useMutation({
    mutationFn: () => activitiesApi.createOwnInsumos({ periodId, courseAssignmentIds: selected, names }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['insumos'] })
      toast.success(result.created
        ? `${result.created} insumos creados en ${result.assignments} materias. Se conservaron los existentes.`
        : 'Estas materias ya tienen los insumos seleccionados.')
      onClose()
    },
    onError: (error) => toast.error(getErrorMessage(error)),
    onSettled: () => { lock.current = false },
  })
  function addCustom() {
    const name = custom.trim()
    if (name && !names.some((item) => item.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) {
      setNames((previous) => [...previous, name])
    }
    setCustom('')
  }
  const canCreate = !!periodId && !periods.find((period) => period.id === periodId)?.isClosed
    && selected.length > 0 && names.length > 0 && names.length <= 30

  return (
    <Dialog open onOpenChange={(open) => !open && !create.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crear insumos en mis materias</DialogTitle>
          <DialogDescription>Elige los insumos una sola vez. Se agregarán los que falten, conservando las categorías y notas existentes.</DialogDescription>
        </DialogHeader>
        <fieldset disabled={create.isPending} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="bulk-insumo-period">Período</Label>
            <select id="bulk-insumo-period" className="w-full rounded border bg-background p-2 text-sm" value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
              <option value="" disabled>Seleccionar período</option>
              {periods.map((period) => <option key={period.id} value={period.id} disabled={period.isClosed}>{period.name}{period.isClosed ? ' · cerrado' : ''}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Insumos a crear</p>
            <div className="grid grid-cols-2 gap-2">
              {suggestions.map((name) => (
                <label key={name} className="flex items-center gap-2 rounded border p-2 text-sm">
                  <input type="checkbox" checked={names.includes(name)} onChange={(event) => setNames((previous) => event.target.checked ? [...previous, name] : previous.filter((item) => item !== name))} />
                  {name}
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <Input aria-label="Otro insumo" placeholder="Otro insumo" maxLength={100} value={custom} onChange={(event) => setCustom(event.target.value)} onKeyDown={(event) => {
                if (event.key === 'Enter') { event.preventDefault(); addCustom() }
              }} />
              <Button type="button" variant="outline" disabled={!custom.trim()} onClick={addCustom}>Agregar</Button>
            </div>
            {names.length > 30 && <p className="text-xs text-destructive">Selecciona hasta 30 insumos por envío.</p>}
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Materias seleccionadas ({selected.length} de {assignments.length})</summary>
            <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border p-3">
              <label className="flex gap-2 border-b pb-2 text-sm">
                <input type="checkbox" checked={selected.length === assignments.length} onChange={(event) => setSelected(event.target.checked ? assignments.map((assignment) => assignment.id) : [])} />
                Todas mis materias
              </label>
              {assignments.map((assignment) => (
                <label key={assignment.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={selected.includes(assignment.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, assignment.id] : previous.filter((id) => id !== assignment.id))} />
                  <span>{assignment.subject?.name ?? assignment.subjectName} · {assignment.parallel?.level.name} {assignment.parallel?.name ?? assignment.parallelName}</span>
                </label>
              ))}
            </div>
          </details>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" disabled={create.isPending} onClick={onClose}>Cancelar</Button>
          <Button loading={create.isPending} disabled={!canCreate} onClick={() => {
            if (lock.current) return
            lock.current = true
            create.mutate()
          }}>Crear en {selected.length} materias</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
