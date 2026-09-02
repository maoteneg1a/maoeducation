import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BookOpenCheck, Info } from 'lucide-react'
import { apiGet } from '@/shared/lib/api-client'
import { Label } from '@/shared/components/ui/label'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { cn } from '@/shared/lib/utils'
import { useGradingConfig } from '@/features/settings/hooks/useSettings'
import {
  getPedagogicRecovery,
  savePedagogicRecovery,
  type PedagogicRecoveryStudentRow,
} from '../api/pedagogic-recovery.api'

interface AcademicYear { id: string; name: string; isActive: boolean }
interface Parallel { id: string; name: string; level: { name: string }; academicYear: { id: string } }
interface Period { id: string; name: string; periodNumber: number; isClosed: boolean }

function fmt1(n: number | null) {
  return n == null ? '—' : n.toFixed(1)
}

const MODE_LABEL = {
  replace_if_higher: 'Reemplaza si es mayor',
  average: 'Promedio con nota original',
}

export function PedagogicRecoveryPage() {
  const qc = useQueryClient()
  const [yearId, setYearId] = useState('')
  const [parallelId, setParallelId] = useState('')
  const [periodId, setPeriodId] = useState('')
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10

  const { data: years = [] } = useQuery({
    queryKey: ['academic-years-active'],
    queryFn: () => apiGet<AcademicYear[]>('academic/years'),
  })

  const { data: parallels = [] } = useQuery({
    queryKey: ['parallels-for-recovery', yearId],
    queryFn: () => apiGet<Parallel[]>('academic/parallels', { yearId }),
    enabled: !!yearId,
  })

  const { data: periods = [] } = useQuery({
    queryKey: ['periods-for-recovery', yearId],
    queryFn: () => apiGet<Period[]>(`academic/years/${yearId}/periods`),
    enabled: !!yearId,
  })

  const { data, isLoading } = useQuery({
    queryKey: ['pedagogic-recovery', parallelId, periodId, yearId],
    queryFn: () => getPedagogicRecovery({ parallelId, periodId, yearId }),
    enabled: !!parallelId && !!periodId && !!yearId,
  })

  const saveMutation = useMutation({
    mutationFn: savePedagogicRecovery,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pedagogic-recovery', parallelId, periodId, yearId] })
    },
    onError: () => toast.error('Error al guardar la nota'),
  })

  const handleScore = useCallback(
    (studentId: string, assignmentId: string, value: string) => {
      if (!periodId) return
      const score = value === '' ? null : Number(value)
      if (score !== null && (score < 0 || score > gradingScaleMax)) return
      saveMutation.mutate({ studentId, courseAssignmentId: assignmentId, academicPeriodId: periodId, score })
    },
    [periodId, saveMutation, gradingScaleMax],
  )

  const passingGrade = data?.passingGrade ?? 7

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recuperación Pedagógica</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Registra las notas de la prueba de recuperación al cierre de cada período
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="w-full sm:w-48 space-y-1.5">
          <Label>Año lectivo</Label>
          <Select value={yearId} onValueChange={(v) => { setYearId(v); setParallelId(''); setPeriodId('') }}>
            <SelectTrigger><SelectValue placeholder="Selecciona año" /></SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-56 space-y-1.5">
          <Label>Paralelo</Label>
          <Select value={parallelId} onValueChange={(v) => { setParallelId(v); setPeriodId('') }} disabled={!yearId}>
            <SelectTrigger><SelectValue placeholder="Selecciona paralelo" /></SelectTrigger>
            <SelectContent>
              {parallels.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.level.name} "{p.name}"</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full sm:w-40 space-y-1.5">
          <Label>Período</Label>
          <Select value={periodId} onValueChange={setPeriodId} disabled={!parallelId}>
            <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {!p.isClosed && <span className="ml-1 text-xs text-amber-500">(abierto)</span>}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Info mode */}
      {data && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 rounded-md px-3 py-2 w-fit">
          <Info className="h-4 w-4 shrink-0" />
          <span>Modo: <strong>{MODE_LABEL[data.recoveryMode]}</strong> · Umbral de recuperación: <strong>{passingGrade}</strong></span>
        </div>
      )}

      {/* Content */}
      {!parallelId || !periodId ? (
        <EmptyState icon={BookOpenCheck} title="Selecciona paralelo y período" description="Verás los estudiantes con nota bajo el umbral y podrás registrar la nota de recuperación" />
      ) : isLoading ? (
        <PageLoader />
      ) : !data || data.subjects.every((s) => s.students.filter((r) => r.periodTotal != null && r.periodTotal < passingGrade).length === 0) ? (
        <EmptyState icon={BookOpenCheck} title="Sin estudiantes en recuperación" description={`Todos los estudiantes tienen nota ≥ ${passingGrade} en este período`} />
      ) : (
        <div className="space-y-8">
          {data.subjects.map((subject) => {
            const needRecovery = subject.students.filter((s) => s.periodTotal != null && s.periodTotal < passingGrade)
            if (needRecovery.length === 0) return null

            return (
              <div key={subject.assignmentId} className="border rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/50 border-b font-medium text-sm">
                  {subject.subjectName}
                  <span className="ml-2 text-muted-foreground font-normal">
                    ({needRecovery.length} estudiante{needRecovery.length !== 1 ? 's' : ''})
                  </span>
                </div>

                <div className="grid grid-cols-[1fr_9rem_9rem_9rem_6rem] text-xs font-medium text-muted-foreground uppercase tracking-wide px-4 py-2 bg-muted/20 border-b">
                  <div>Estudiante</div>
                  <div className="text-center">Nota período</div>
                  <div className="text-center">Nota recuperación</div>
                  <div className="text-center">Nota efectiva</div>
                  <div className="text-center">Estado</div>
                </div>

                <div className="divide-y">
                  {needRecovery.map((row) => (
                    <RecoveryRow
                      key={row.studentId}
                      row={row}
                      passingGrade={passingGrade}
                      assignmentId={subject.assignmentId}
                      onScore={handleScore}
                      saving={saveMutation.isPending}
                      gradingScaleMax={gradingScaleMax}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface RecoveryRowProps {
  row: PedagogicRecoveryStudentRow
  passingGrade: number
  assignmentId: string
  onScore: (studentId: string, assignmentId: string, value: string) => void
  saving: boolean
  gradingScaleMax: number
}

function RecoveryRow({ row, passingGrade, assignmentId, onScore, saving, gradingScaleMax }: RecoveryRowProps) {
  const [draft, setDraft] = useState(row.recoveryScore != null ? String(row.recoveryScore) : '')
  const effective = row.effectiveTotal
  const passed = effective != null && effective >= passingGrade

  return (
    <div className="grid grid-cols-[1fr_9rem_9rem_9rem_6rem] items-center px-4 py-2.5 text-sm hover:bg-muted/20">
      <div className="font-medium">{row.studentName}</div>

      <div className={cn('text-center tabular-nums', row.periodTotal != null && row.periodTotal < passingGrade && 'text-red-600 font-semibold')}>
        {fmt1(row.periodTotal)}
      </div>

      <div className="flex justify-center">
        <Input
          type="number"
          min={0}
          max={gradingScaleMax}
          step={0.1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => onScore(row.studentId, assignmentId, e.target.value)}
          disabled={saving}
          placeholder="—"
          className="w-20 text-center h-8 text-sm"
        />
      </div>

      <div className={cn('text-center tabular-nums font-semibold', passed ? 'text-green-600' : 'text-red-600')}>
        {fmt1(effective)}
        {row.recovered && <span className="ml-1 text-xs text-muted-foreground font-normal">(R)</span>}
      </div>

      <div className="flex justify-center">
        <Badge variant={passed ? 'default' : 'destructive'} className="text-xs">
          {passed ? 'Aprueba' : 'Reprueba'}
        </Badge>
      </div>
    </div>
  )
}
