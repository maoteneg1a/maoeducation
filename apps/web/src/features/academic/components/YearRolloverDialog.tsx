import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowRight, CalendarPlus, GraduationCap, Loader2, Users } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { formatDate, getErrorMessage } from '@/shared/lib/utils'
import {
  academicApi,
  type AcademicYear,
  type RolloverInput,
  type RolloverPendingPolicy,
} from '../api/academic.api'

function addYear(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${y + 1}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function nextYearName(name: string): string {
  const m = /^(\d{4})\s*-\s*(\d{4})$/.exec(name.trim())
  return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : ''
}

/**
 * Asistente de cierre de año: crea el año siguiente copiando estructura y
 * matriculando a los estudiantes según la decisión de promoción.
 */
export function YearRolloverDialog({ source, open, onOpenChange }: { source: AcademicYear; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState<RolloverInput>(() => ({
    name: nextYearName(source.name),
    startDate: addYear(source.startDate),
    endDate: addYear(source.endDate),
    copyAssignments: true,
    copyTutors: true,
    enrollStudents: true,
    pendingPolicy: 'skip',
    activate: false,
  }))
  const set = <K extends keyof RolloverInput>(k: K, v: RolloverInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const { data: preview, isFetching } = useQuery({
    queryKey: ['rollover-preview', source.id, form.startDate, form.pendingPolicy],
    queryFn: () => academicApi.rolloverPreview(source.id, { startDate: form.startDate, pendingPolicy: form.pendingPolicy }),
    enabled: open && /^\d{4}-\d{2}-\d{2}$/.test(form.startDate),
  })

  const run = useMutation({
    mutationFn: () => academicApi.rollover(source.id, form),
    onSuccess: (r) => {
      // Cambian años, paralelos, asignaciones y matrículas: refrescar todo.
      qc.invalidateQueries()
      toast.success(
        `Año ${r.name} creado: ${r.parallels} paralelos, ${r.assignments} asignaciones y ${r.enrolled} estudiantes matriculados${r.activated ? ' (activo)' : ''}.`,
        { duration: 8000 },
      )
      onOpenChange(false)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  async function submit() {
    if (!form.name.trim()) return toast.error('Ponle un nombre al nuevo año')
    const ok = await confirmDialog({
      title: `¿Crear el año ${form.name}?`,
      description: form.activate
        ? `Se creará y quedará como año ACTIVO. ${source.name} pasará a inactivo (sus datos se conservan).`
        : 'Se creará como año inactivo; podrás revisarlo y activarlo cuando empiecen las clases.',
      confirmText: 'Crear año',
    })
    if (ok) run.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarPlus className="h-5 w-5" aria-hidden />
            Cerrar {source.name} y abrir el siguiente año
          </DialogTitle>
          <DialogDescription>
            Copia la estructura del año actual y matricula a los estudiantes según las decisiones de promoción.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ro-name">Nombre</Label>
              <Input id="ro-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="2027-2028" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ro-start">Inicio</Label>
              <Input id="ro-start" type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ro-end">Fin</Label>
              <Input id="ro-end" type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
            </div>
          </div>

          <fieldset className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-medium">Qué copiar</legend>
            <Check label="Paralelos y períodos (siempre)" checked disabled />
            <Check label="Tutores de cada paralelo" checked={form.copyTutors} onChange={(v) => set('copyTutors', v)} />
            <Check label="Asignaciones docente × materia × paralelo" checked={form.copyAssignments} onChange={(v) => set('copyAssignments', v)} />
            <Check label="Matricular estudiantes según su promoción" checked={form.enrollStudents} onChange={(v) => set('enrollStudents', v)} />
            {form.enrollStudents && (
              <div className="ml-6 flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <span className="text-sm text-muted-foreground">Estudiantes sin decisión de promoción:</span>
                <Select value={form.pendingPolicy} onValueChange={(v) => set('pendingPolicy', v as RolloverPendingPolicy)}>
                  <SelectTrigger className="h-8 w-full sm:w-56"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skip">No matricular (decidir después)</SelectItem>
                    <SelectItem value="promote">Promover al siguiente nivel</SelectItem>
                    <SelectItem value="repeat">Mantener en el mismo nivel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <Check label="Activar el nuevo año al terminar" checked={form.activate} onChange={(v) => set('activate', v)} />
          </fieldset>

          <div className="rounded-md bg-muted/40 p-3">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              Vista previa {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-label="Calculando" />}
            </p>
            {preview && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Paralelos" value={preview.parallels} />
                  <Stat label="Asignaciones" value={form.copyAssignments ? preview.assignments : 0} />
                  <Stat label="A matricular" value={form.enrollStudents ? preview.students.toEnroll : 0} icon={Users} />
                  <Stat label="Egresan" value={preview.students.graduating} icon={GraduationCap} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {preview.students.promoted} promovidos · {preview.students.repeats} repiten · {preview.students.pending} sin decisión
                  {preview.students.skippedPending > 0 && ` (${preview.students.skippedPending} quedan sin matricular)`}
                </p>
                {preview.periods.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Períodos: {preview.periods.map((p) => `${p.name} (${formatDate(p.startDate)} → ${formatDate(p.endDate)})`).join(' · ')}
                  </p>
                )}
                {form.enrollStudents && preview.byParallel.length > 0 && (
                  <div className="max-h-40 overflow-y-auto rounded border bg-background">
                    <table className="w-full text-xs">
                      <tbody>
                        {preview.byParallel.map((p) => (
                          <tr key={p.label} className="border-b last:border-0">
                            <td className="px-2 py-1">{p.label}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{p.students} estudiantes</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} loading={run.isPending}>
            Crear año <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange?: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="h-4 w-4" checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} />
      <span className={disabled ? 'text-muted-foreground' : undefined}>{label}</span>
    </label>
  )
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon?: React.ElementType }) {
  return (
    <div className="rounded border bg-background p-2">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {Icon && <Icon className="h-3 w-3" aria-hidden />}
        {label}
      </p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}
