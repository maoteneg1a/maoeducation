import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, Smile } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import { Card } from '@/shared/components/ui/card'
import { useUnsavedChanges } from '@/shared/hooks/useUnsavedChanges'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { useParallels } from '@/features/academic/hooks/useAcademic'
import { useGradingConfig } from '@/features/settings/hooks/useSettings'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { behaviorApi, type BehaviorItem, type SaveBehaviorInput } from '../api/behavior.api'

const NONE = '__none__'

interface LocalRecord {
  code: string | null
  notes: string
}

export function BehaviorEntryPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { hasAnyRole } = usePermissions()
  const isAdminLike = hasAnyRole('admin', 'inspector')

  const { activeYear, periods, defaultPeriodId } = useTeacherDefaults()
  const { data: allParallels = [] } = useParallels(activeYear?.id)
  const { data: gradingConfig } = useGradingConfig()
  const behaviorScale = gradingConfig?.behaviorScale ?? []

  // Tutores solo ven los paralelos que tutoran; admin/inspector ven todos
  const parallels = React.useMemo(() => {
    if (isAdminLike) return allParallels
    const tutored = user?.tutorParallelIds ?? []
    return allParallels.filter((p) => tutored.includes(p.id))
  }, [allParallels, isAdminLike, user])

  const [selectedParallelId, setSelectedParallelId] = React.useState('')
  const [selectedPeriodId, setSelectedPeriodId] = React.useState('')
  const [localRecords, setLocalRecords] = React.useState<Map<string, LocalRecord>>(new Map())
  const [modified, setModified] = React.useState<Set<string>>(new Set())

  // Defaults: paralelo único → preseleccionar; periodo activo
  React.useEffect(() => {
    if (parallels.length === 1 && !selectedParallelId) setSelectedParallelId(parallels[0].id)
  }, [parallels])

  React.useEffect(() => {
    if (defaultPeriodId && !selectedPeriodId) setSelectedPeriodId(defaultPeriodId)
  }, [defaultPeriodId])

  const canLoad = !!selectedParallelId && !!selectedPeriodId

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['behavior', selectedParallelId, selectedPeriodId],
    queryFn: () => behaviorApi.getByParallelPeriod(selectedParallelId, selectedPeriodId),
    enabled: canLoad,
  })

  // Reiniciar estado local al cambiar de selección
  React.useEffect(() => {
    setLocalRecords(new Map())
    setModified(new Set())
  }, [selectedParallelId, selectedPeriodId])

  const bulkSave = useMutation({
    mutationFn: (data: SaveBehaviorInput) => behaviorApi.bulkSave(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['behavior', selectedParallelId, selectedPeriodId] })
      setModified(new Set())
      setLocalRecords(new Map())
      toast.success('Comportamiento guardado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  function getRecord(item: BehaviorItem): LocalRecord {
    return localRecords.get(item.studentId) ?? { code: item.code, notes: item.notes ?? '' }
  }

  function updateRecord(studentId: string, patch: Partial<LocalRecord>) {
    setLocalRecords((prev) => {
      const next = new Map(prev)
      const base = next.get(studentId) ?? {
        code: rows.find((r) => r.studentId === studentId)?.code ?? null,
        notes: rows.find((r) => r.studentId === studentId)?.notes ?? '',
      }
      next.set(studentId, { ...base, ...patch })
      return next
    })
    setModified((prev) => new Set(prev).add(studentId))
  }

  const { confirmDiscard } = useUnsavedChanges(modified.size > 0)
  const guarded = (setter: (v: string) => void, current: string) => async (value: string) => {
    if (value === current || !(await confirmDiscard())) return
    setter(value)
  }

  /** Asigna el mismo código a todos los estudiantes que aún no tienen nota. */
  function applyToBlanks(code: string) {
    let n = 0
    rows.forEach((item) => {
      if (getRecord(item).code == null) {
        updateRecord(item.studentId, { code })
        n++
      }
    })
    toast.success(n === 0 ? 'Todos ya tienen comportamiento' : `${code} aplicado a ${n} estudiantes sin nota`)
  }

  function handleSaveAll() {
    if (modified.size === 0) {
      toast.info('No hay cambios pendientes')
      return
    }
    const items = Array.from(modified).map((studentId) => {
      const rec = localRecords.get(studentId)
      return {
        studentId,
        code: rec?.code ?? null,
        notes: rec?.notes?.trim() ? rec.notes.trim() : null,
      }
    })
    bulkSave.mutate({ periodId: selectedPeriodId, items })
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comportamiento</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registra la calificación de comportamiento por estudiante y período
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-64">
          <Select value={selectedParallelId} onValueChange={guarded(setSelectedParallelId, selectedParallelId)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar paralelo" />
            </SelectTrigger>
            <SelectContent>
              {parallels.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.level?.name ? `${p.level.name} ${p.name}` : p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-44">
          <Select value={selectedPeriodId} onValueChange={guarded(setSelectedPeriodId, selectedPeriodId)}>
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {behaviorScale.length === 0 ? (
        <EmptyState
          icon={Smile}
          title="Sin escala de comportamiento"
          description="Configura la escala de comportamiento en Configuración → Escala de calificación."
        />
      ) : !canLoad ? (
        <EmptyState
          icon={Smile}
          title="Selecciona los filtros"
          description="Elige el paralelo y el período para registrar el comportamiento."
        />
      ) : isLoading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Smile}
          title="Sin estudiantes"
          description="No hay estudiantes matriculados en este paralelo."
        />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {rows.length} estudiantes
              {modified.size > 0 && (
                <span className="ml-2 text-amber-600">
                  · {modified.size} {modified.size === 1 ? 'cambio pendiente' : 'cambios pendientes'}
                </span>
              )}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value="" onValueChange={applyToBlanks}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Aplicar un código a los estudiantes sin nota">
                <SelectValue placeholder="Aplicar a los que no tienen nota…" />
              </SelectTrigger>
              <SelectContent>
                {behaviorScale.map((b) => (
                  <SelectItem key={b.code} value={b.code}>
                    {b.code} · {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={handleSaveAll}
              loading={bulkSave.isPending}
              disabled={modified.size === 0}
              className="w-full sm:w-auto"
            >
              <Save className="h-4 w-4" />
              Guardar todo
              {modified.size > 0 && (
                <Badge variant="warning" className="ml-1">
                  {modified.size}
                </Badge>
              )}
            </Button>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estudiante</TableHead>
                  <TableHead className="w-44">Comportamiento</TableHead>
                  <TableHead>Observación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => {
                  const rec = getRecord(item)
                  const isModified = modified.has(item.studentId)
                  return (
                    <TableRow key={item.studentId} className={cn(isModified && 'bg-amber-50/50')}>
                      <TableCell className="font-medium">{item.studentName}</TableCell>
                      <TableCell>
                        <Select
                          value={rec.code ?? NONE}
                          onValueChange={(v) => updateRecord(item.studentId, { code: v === NONE ? null : v })}
                        >
                          <SelectTrigger className={cn(isModified && 'border-amber-400')}>
                            <SelectValue placeholder="—" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>— (sin nota)</SelectItem>
                            {behaviorScale.map((b) => (
                              <SelectItem key={b.code} value={b.code}>
                                {b.code} · {b.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={rec.notes}
                          onChange={(e) => updateRecord(item.studentId, { notes: e.target.value })}
                          placeholder="Observación (opcional)"
                          className={cn(isModified && 'border-amber-400 focus-visible:ring-amber-400')}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
