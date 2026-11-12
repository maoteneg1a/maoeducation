import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { getErrorMessage } from '@/shared/lib/utils'
import { normalizeStudentSearch } from '@/shared/lib/student-options'
import { comparePersonNames } from '@/shared/lib/person-name'
import { transferEnrollments, type Enrollment, type Parallel } from '../api/enrollment.api'

interface Props {
  source: Parallel
  parallels: Parallel[]
  enrollments: Enrollment[]
}

export function TransferEnrollmentsDialog({ source, parallels, enrollments }: Props) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [targetId, setTargetId] = useState('')
  const [search, setSearch] = useState('')
  const [reason, setReason] = useState('')

  const students = enrollments
    .filter((e) => e.status === 'active' && e.parallel.id === source.id && e.academicYear.id === source.academicYear.id)
    .sort((a, b) => comparePersonNames(a.student.profile, b.student.profile))
  const validIds = new Set(students.map((e) => e.id))
  const selected = selectedIds.filter((id) => validIds.has(id))
  const terms = normalizeStudentSearch(search).split(/\s+/).filter(Boolean)
  const visibleStudents = students.filter((e) => {
    const p = e.student.profile
    const text = normalizeStudentSearch(`${p.lastName} ${p.firstName} ${p.dni ?? ''}`)
    return terms.every((term) => text.includes(term))
  })
  const targets = parallels.filter((p) => p.id !== source.id && p.isActive
    && p.academicYear.id === source.academicYear.id && p.level.id === source.level.id
    && (p.educationOffer ?? null) === (source.educationOffer ?? null))
  const target = targets.find((p) => p.id === targetId)
  const allVisibleSelected = visibleStudents.length > 0 && visibleStudents.every((e) => selected.includes(e.id))

  const mutation = useMutation({
    mutationFn: transferEnrollments,
    onSuccess: (result) => {
      // Invalida también las nóminas, reportes y expedientes que dependían del paralelo.
      qc.invalidateQueries()
      setOpen(false)
      toast.success(`${result.transferred} estudiante(s) cambiado(s) de paralelo/jornada`)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  function changeOpen(value: boolean) {
    if (mutation.isPending) return
    if (value) {
      setSelectedIds([])
      setTargetId('')
      setSearch('')
      setReason('')
      mutation.reset()
    }
    setOpen(value)
  }

  function toggleVisible() {
    const visibleIds = new Set(visibleStudents.map((e) => e.id))
    setSelectedIds(allVisibleSelected
      ? selected.filter((id) => !visibleIds.has(id))
      : [...new Set([...selected, ...visibleIds])])
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={!students.length}>
          <ArrowRightLeft className="h-4 w-4" /> Cambiar paralelo/jornada
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader><DialogTitle>Cambiar paralelo/jornada</DialogTitle></DialogHeader>
        <DialogDescription>
          Origen: {source.level.name} - {source.name} · {source.academicYear.name}.
          Selecciona los estudiantes y su paralelo de destino.
        </DialogDescription>
        <div className="rounded-md border bg-muted/40 p-3 text-sm">
          La matrícula seguirá activa y conservará los datos del estudiante y sus adaptaciones NEE.
          Las notas y asistencias anteriores se conservan en el curso de origen y no se copian al destino.
        </div>
        <fieldset disabled={mutation.isPending} className="space-y-4 disabled:opacity-70">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-target">Paralelo de destino *</Label>
            <Select value={targetId} onValueChange={setTargetId} disabled={mutation.isPending || !targets.length}>
              <SelectTrigger id="transfer-target"><SelectValue placeholder="Seleccionar destino..." /></SelectTrigger>
              <SelectContent>
                {targets.map((p) => <SelectItem key={p.id} value={p.id}>{p.level.name} - {p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {!targets.length && <p className="text-sm text-muted-foreground">No hay otro paralelo activo del mismo grado, año lectivo y oferta educativa. Crea o habilita el paralelo de destino primero.</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-search">Estudiantes activos ({selected.length} seleccionados)</Label>
            <Input id="transfer-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por apellidos, nombres o cédula" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allVisibleSelected} onChange={toggleVisible} disabled={!visibleStudents.length} />
              Seleccionar todos los resultados ({visibleStudents.length})
            </label>
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {visibleStudents.map((e) => (
                <label key={e.id} className="flex cursor-pointer items-start gap-3 p-3 text-sm">
                  <input type="checkbox" className="mt-1" checked={selected.includes(e.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selected, e.id] : selected.filter((id) => id !== e.id))} />
                  <span className="min-w-0 break-words">
                    <span className="block font-medium">{e.student.profile.lastName} {e.student.profile.firstName}</span>
                    <span className="text-xs text-muted-foreground">{e.student.profile.dni ?? 'Sin documento'}</span>
                  </span>
                </label>
              ))}
              {!visibleStudents.length && <p className="p-3 text-sm text-muted-foreground">No hay estudiantes que coincidan con la búsqueda.</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-reason">Motivo (opcional)</Label>
            <Input id="transfer-reason" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Por ejemplo: cambio de jornada solicitado por el representante" />
          </div>
        </fieldset>
        {target && selected.length > 0 && <p className="text-sm">Se cambiarán {selected.length} estudiante(s) de {source.name} a {target.name}.</p>}
        {selected.length > 500 && <p className="text-sm text-destructive">Puedes cambiar hasta 500 estudiantes a la vez.</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => changeOpen(false)} disabled={mutation.isPending}>Cancelar</Button>
          <Button disabled={mutation.isPending || !target || !selected.length || selected.length > 500} onClick={() => mutation.mutate({
            sourceParallelId: source.id, targetParallelId: targetId, enrollmentIds: selected, reason: reason.trim() || undefined,
          })}>{mutation.isPending ? 'Cambiando...' : 'Confirmar cambio'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
