import * as React from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Save, GraduationCap, BarChart3, Settings2 } from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
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
import { getErrorMessage, cn } from '@/shared/lib/utils'
import { activitiesApi, type StudentGrade, type GradeInput, type GradeStatus } from '@/features/activities/api/activities.api'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import { getGradesReport, getMyGrades, type GradesReportData, type MyGradesSubject } from '@/features/reports/api/reports.api'
import { useGuardianStudentId } from '@/features/guardian/components/ChildSwitcher'
import { academicApi, type AcademicPeriod } from '@/features/academic/api/academic.api'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useGradingConfig } from '@/features/settings/hooks/useSettings'

// ---- Query keys ----
const gradeKeys = {
  byActivity: (activityId: string) => ['grades', 'activity', activityId] as const,
  summary: (cid: string, pid: string) => ['grades', 'summary', cid, pid] as const,
}

function useGradesByActivity(activityId: string) {
  return useQuery({
    queryKey: gradeKeys.byActivity(activityId),
    queryFn: () => activitiesApi.getGradesByActivity(activityId),
    enabled: !!activityId,
  })
}

function useGradesSummary(courseAssignmentId: string, periodId: string) {
  return useQuery({
    queryKey: gradeKeys.summary(courseAssignmentId, periodId),
    queryFn: () => activitiesApi.getGradesSummary(courseAssignmentId, periodId),
    enabled: !!courseAssignmentId && !!periodId,
  })
}

function useBulkSaveGrades() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (grades: GradeInput[]) => activitiesApi.bulkSaveGrades(grades),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grades'] })
      toast.success('Notas guardadas correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- Tabs ----
type Tab = 'entry' | 'summary'

// ---- Grade Row Component ----
const STATUS_OPTIONS: Array<{ value: GradeStatus; label: string }> = [
  { value: 'entregado', label: 'Entregado' },
  { value: 'no_realizado', label: 'No realizado' },
  { value: 'atrasado', label: 'Atrasado' },
  { value: 'excusado', label: 'Excusado' },
]

interface GradeRowProps {
  grade: StudentGrade
  maxScore: number
  localScore: number | null | undefined
  localStatus: GradeStatus | undefined
  isModified: boolean
  onChange: (studentId: string, value: number | null) => void
  onStatusChange: (studentId: string, status: GradeStatus) => void
}

function GradeRow({ grade, maxScore, localScore, localStatus, isModified, onChange, onStatusChange }: GradeRowProps) {
  const displayScore = localScore !== undefined ? localScore : grade.score
  const status = localStatus ?? grade.status
  // El puntaje solo se edita cuando hubo entrega (a tiempo o tarde).
  const scoreEditable = status === 'entregado' || status === 'atrasado'

  return (
    <TableRow className={cn(isModified && 'bg-amber-50/50')}>
      <TableCell className="font-medium">{grade.studentName}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={maxScore}
            step={0.01}
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            disabled={!scoreEditable}
            value={status === 'excusado' ? '' : displayScore ?? ''}
            onChange={(e) => {
              const val = e.target.value === '' ? null : parseFloat(e.target.value)
              onChange(grade.studentId, val)
            }}
            className={cn(
              'w-20 text-center text-base md:w-24 md:text-sm',
              isModified && 'border-amber-400 focus-visible:ring-amber-400',
              !scoreEditable && 'bg-muted text-muted-foreground',
            )}
            placeholder={status === 'excusado' ? 'Exc.' : '—'}
          />
          <span className="text-xs text-muted-foreground">/ {maxScore}</span>
        </div>
      </TableCell>
      <TableCell>
        <Select value={status} onValueChange={(v) => onStatusChange(grade.studentId, v as GradeStatus)}>
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {isModified && (
          <Badge variant="warning" className="text-xs">
            Modificado
          </Badge>
        )}
      </TableCell>
    </TableRow>
  )
}

// ---- Grades Grid (Excel-like) ----

function scoreColor(score: number | null | undefined, max: number) {
  if (score == null) return 'text-muted-foreground'
  const pct = score / max
  if (pct >= 0.9) return 'text-emerald-700 font-semibold'
  if (pct >= 0.7) return 'text-blue-700'
  if (pct >= 0.5) return 'text-amber-600'
  return 'text-red-600 font-semibold'
}

function GradesGrid({ data }: { data: GradesReportData }) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  const { insumos, students } = data
  const allActivities = insumos.flatMap((ins) => ins.activities.map((a) => ({ ...a, insumoName: ins.name })))

  if (allActivities.length === 0) {
    return (
      <EmptyState icon={BarChart3} title="Sin actividades" description="No hay actividades publicadas en este período" />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="text-sm border-collapse w-full">
        <thead>
          {/* Row 1: Insumo headers */}
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 bg-muted/60 border border-border px-3 py-2 text-left font-semibold min-w-[180px]">
              Estudiante
            </th>
            {insumos.map((ins) => (
              <th
                key={ins.id}
                colSpan={ins.activities.length + 1}
                className="border border-border px-2 py-1.5 text-center font-semibold text-primary whitespace-nowrap"
              >
                {ins.name}
                {ins.weight != null && Number(ins.weight) > 0 && (
                  <span className="ml-1 text-xs text-muted-foreground font-normal">({ins.weight}%)</span>
                )}
              </th>
            ))}
            <th className="border border-border px-3 py-2 text-center font-semibold bg-muted">
              Total
            </th>
          </tr>
          {/* Row 2: Activity headers */}
          <tr className="bg-muted/40">
            <th className="sticky left-0 z-20 bg-muted/40 border border-border px-3 py-1.5" />
            {insumos.map((ins) =>
              ins.activities.map((act) => (
                <th
                  key={act.id}
                  className="border border-border px-2 py-1.5 text-center font-medium whitespace-nowrap max-w-[90px]"
                  title={act.name}
                >
                  <div className="truncate max-w-[80px] mx-auto text-xs">{act.name}</div>
                  <div className="text-[10px] text-muted-foreground">/{act.maxScore}</div>
                </th>
              )).concat(
                <th key={`avg-${ins.id}`} className="border border-border px-2 py-1.5 text-center text-xs text-muted-foreground bg-muted/30">
                  Prom.
                </th>
              )
            )}
            <th className="border border-border px-3 py-1.5 text-center text-xs text-muted-foreground bg-muted/20" />
          </tr>
        </thead>
        <tbody>
          {students.map((row, i) => {
            const { student, grades } = row
            const fullName = `${student.profile.lastName}, ${student.profile.firstName}`

            // Promedios por insumo y total: vienen del backend (única fuente).
            const avgById = avgByInsumoId(row.summary)
            const insumoAvgs = insumos.map((ins) => avgById.get(ins.id) ?? null)
            const overall = row.summary.total

            return (
              <tr key={student.id} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
                <td className="sticky left-0 z-10 bg-inherit border border-border px-3 py-2 font-medium whitespace-nowrap">
                  {fullName}
                </td>
                {insumos.map((ins, idx) =>
                  ins.activities.map((act) => {
                    const score = grades[act.id] ?? null
                    return (
                      <td key={act.id} className="border border-border px-2 py-2 text-center tabular-nums">
                        <span className={scoreColor(score, act.maxScore)}>
                          {score ?? '—'}
                        </span>
                      </td>
                    )
                  }).concat(
                    <td key={`avg-${ins.id}-${student.id}`} className="border border-border px-2 py-2 text-center bg-muted/20 tabular-nums">
                      <span className={scoreColor(insumoAvgs[idx], gradingScaleMax)}>
                        {insumoAvgs[idx] != null ? insumoAvgs[idx]!.toFixed(1) : '—'}
                      </span>
                    </td>
                  )
                )}
                <td className="border border-border px-3 py-2 text-center font-semibold tabular-nums bg-muted/20">
                  <span className={scoreColor(overall, gradingScaleMax)}>
                    {overall != null ? overall.toFixed(2) : '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Compact Grid ----

/** Mapa insumoId -> promedio, a partir del summary calculado en el backend. */
function avgByInsumoId(summary: GradesReportData['students'][0]['summary']): Map<string, number | null> {
  return new Map(summary.insumoAvgs.map((i) => [i.id, i.avg]))
}

interface CompactGridProps {
  data: GradesReportData
  examWeight: number
  canEditWeight: boolean
  onEditWeight: () => void
}

function CompactGrid({ data, examWeight, canEditWeight, onEditWeight }: CompactGridProps) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  const { insumos, students } = data
  const regularWeight = 100 - examWeight
  const halfWeight = Math.round(examWeight / 2)

  const kindOf = (code: string) => (code === 'exam' ? 'exam' : code === 'project' ? 'project' : 'regular')

  const allActs = insumos.flatMap((i) => i.activities)
  const hasExam = allActs.some((a) => kindOf(a.activityType.code) === 'exam')
  const hasProject = allActs.some((a) => kindOf(a.activityType.code) === 'project')
  const hasSummative = hasExam || hasProject

  // Insumos con nombre y al menos una actividad formativa (para columnas individuales)
  const regularInsumos = insumos
    .filter((i) => i.id !== 'no-insumo')
    .map((i) => ({ ...i, activities: i.activities.filter((a) => kindOf(a.activityType.code) === 'regular') }))
    .filter((i) => i.activities.length > 0)
  const hasRegular = insumos.some((i) => i.activities.some((a) => kindOf(a.activityType.code) === 'regular'))

  if (!hasRegular && !hasSummative) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin actividades publicadas"
        description="Publica actividades para ver el resumen compacto."
      />
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 bg-muted/60 border border-border px-3 py-2 text-left font-semibold min-w-[180px]">
              Estudiante
            </th>
            {regularInsumos.map((ins) => (
              <th key={ins.id} className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                {ins.name}
                <div className="text-[10px] font-normal text-muted-foreground">promedio</div>
              </th>
            ))}
            {hasRegular && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap bg-blue-50/50">
                Formativa
                <div className="text-[10px] font-normal text-muted-foreground">
                  {hasSummative ? `${regularWeight}%` : 'promedio'}
                </div>
              </th>
            )}
            {hasExam && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">
                  Examen
                  {canEditWeight && (
                    <button
                      type="button"
                      onClick={onEditWeight}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                      title="Cambiar peso de la sumativa (examen + proyecto)"
                    >
                      <Settings2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] font-normal text-muted-foreground">{halfWeight}%</div>
              </th>
            )}
            {hasProject && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                Proyecto
                <div className="text-[10px] font-normal text-muted-foreground">{halfWeight}%</div>
              </th>
            )}
            <th className="border border-border px-3 py-2 text-center font-semibold bg-muted whitespace-nowrap">
              Total
              {hasSummative && <div className="text-[10px] font-normal text-muted-foreground">ponderado</div>}
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((row, i) => {
            const { student } = row
            const fullName = `${student.profile.lastName}, ${student.profile.firstName}`
            const avgById = avgByInsumoId(row.summary)
            const insumoAvgs = regularInsumos.map((ins) => avgById.get(ins.id) ?? null)
            const regularAvg = row.summary.insumosBase
            const examenAvg = row.summary.examenAvg
            const proyectoAvg = row.summary.proyectoAvg
            const total = row.summary.total

            return (
              <tr key={student.id} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
                <td className="sticky left-0 z-10 bg-inherit border border-border px-3 py-2 font-medium whitespace-nowrap">
                  {fullName}
                </td>
                {insumoAvgs.map((avg, idx) => (
                  <td key={regularInsumos[idx].id} className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(avg, gradingScaleMax)}>
                      {avg != null ? avg.toFixed(2) : '—'}
                    </span>
                  </td>
                ))}
                {hasRegular && (
                  <td className="border border-border px-3 py-2 text-center tabular-nums bg-blue-50/50 font-semibold">
                    <span className={scoreColor(regularAvg, gradingScaleMax)}>
                      {regularAvg != null ? regularAvg.toFixed(2) : '—'}
                    </span>
                  </td>
                )}
                {hasExam && (
                  <td className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(examenAvg, gradingScaleMax)}>
                      {examenAvg != null ? examenAvg.toFixed(2) : '—'}
                    </span>
                  </td>
                )}
                {hasProject && (
                  <td className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(proyectoAvg, gradingScaleMax)}>
                      {proyectoAvg != null ? proyectoAvg.toFixed(2) : '—'}
                    </span>
                  </td>
                )}
                <td className="border border-border px-3 py-2 text-center font-bold tabular-nums bg-muted/20">
                  <span className={scoreColor(total, gradingScaleMax)}>
                    {total != null ? total.toFixed(2) : '—'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ---- Summary Tab ----
type SummaryView = 'compact' | 'full'

interface SummaryTabProps {
  courseAssignmentId: string
  periodId: string
}

function SummaryTab({ courseAssignmentId, periodId }: SummaryTabProps) {
  const [view, setView] = React.useState<SummaryView>('compact')
  const [editingWeight, setEditingWeight] = React.useState(false)
  const [weightInput, setWeightInput] = React.useState('')
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('academic_config:manage')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['grades-grid', courseAssignmentId, periodId],
    queryFn: () => getGradesReport({ courseAssignmentId, periodId }),
    enabled: !!courseAssignmentId && !!periodId,
  })

  const updateWeight = useMutation({
    mutationFn: (w: number) => academicApi.updateExamWeight(courseAssignmentId, w),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['grades-grid', courseAssignmentId, periodId] })
      setEditingWeight(false)
      toast.success('Peso del examen actualizado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (isLoading) return <PageLoader />

  if (!data) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin datos de notas"
        description="No hay actividades o notas registradas para este período"
      />
    )
  }

  const examWeight = data.assignment.examWeight ?? 30
  const totalActivities = data.insumos.reduce((s, i) => s + i.activities.length, 0)

  function handleOpenWeightEdit() {
    setWeightInput(String(examWeight))
    setEditingWeight(true)
  }

  function handleSaveWeight() {
    const val = parseInt(weightInput, 10)
    if (isNaN(val) || val < 0 || val > 100) {
      toast.error('El peso debe ser un número entre 0 y 100')
      return
    }
    updateWeight.mutate(val)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-3">
          <span>{data.students.length} estudiantes · {totalActivities} actividades</span>
          {editingWeight && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="font-medium text-foreground">Peso examen:</span>
              <Input
                type="number"
                min={0}
                max={100}
                inputMode="numeric"
                pattern="[0-9]*"
                value={weightInput}
                onChange={(e) => setWeightInput(e.target.value)}
                className="h-7 w-16 px-1 text-center text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveWeight()
                  if (e.key === 'Escape') setEditingWeight(false)
                }}
              />
              <span>%</span>
              <Button size="sm" className="h-6 px-2 text-xs" onClick={handleSaveWeight} disabled={updateWeight.isPending}>
                OK
              </Button>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingWeight(false)}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
        <div className="flex rounded-md border overflow-hidden text-xs self-start">
          <button
            type="button"
            onClick={() => setView('compact')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              view === 'compact' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Compacto
          </button>
          <button
            type="button"
            onClick={() => setView('full')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors border-l',
              view === 'full' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Sábana total
          </button>
        </div>
      </div>
      {view === 'compact'
        ? <CompactGrid data={data} examWeight={examWeight} canEditWeight={canManage} onEditWeight={handleOpenWeightEdit} />
        : <GradesGrid data={data} />
      }
    </div>
  )
}

// ---- Annual (all-trimesters) Summary ----
const ALL_PERIODS = '__all__'
type AnnualView = 'byPeriod' | 'detail'

/** Total ponderado por estudiante para un período (calculado en el backend). */
function periodTotalsByStudent(data: GradesReportData): Map<string, number | null> {
  return new Map(data.students.map((row) => [row.student.id, row.summary.total]))
}

function mean(values: Array<number | null>): number | null {
  const valid = values.filter((v): v is number => v != null)
  return valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : null
}

function AnnualSummaryTab({
  courseAssignmentId,
  periods,
}: {
  courseAssignmentId: string
  periods: AcademicPeriod[]
}) {
  const [view, setView] = React.useState<AnnualView>('byPeriod')
  const sortedPeriods = React.useMemo(
    () => [...periods].sort((a, b) => a.periodNumber - b.periodNumber),
    [periods],
  )

  const results = useQueries({
    queries: sortedPeriods.map((p) => ({
      queryKey: ['grades-grid', courseAssignmentId, p.id],
      queryFn: () => getGradesReport({ courseAssignmentId, periodId: p.id }),
      enabled: !!courseAssignmentId,
    })),
  })

  if (results.some((r) => r.isLoading)) return <PageLoader />

  const periodData = sortedPeriods.map((p, i) => ({ period: p, data: results[i].data }))
  const loaded = periodData.filter((pd): pd is { period: AcademicPeriod; data: GradesReportData } => !!pd.data)

  if (loaded.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sin datos de notas"
        description="No hay actividades o notas registradas en este año lectivo"
      />
    )
  }

  const examWeight = loaded[0].data.assignment.examWeight ?? 30

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Vista anual · {loaded.length} de {sortedPeriods.length} período(s) con datos
        </span>
        <div className="flex self-start overflow-hidden rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setView('byPeriod')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              view === 'byPeriod' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Promedio por trimestre
          </button>
          <button
            type="button"
            onClick={() => setView('detail')}
            className={cn(
              'border-l px-3 py-1.5 font-medium transition-colors',
              view === 'detail' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Detalle por trimestre
          </button>
        </div>
      </div>

      {view === 'byPeriod' ? (
        <AnnualByPeriodGrid periodData={loaded} />
      ) : (
        <AnnualDetailGrid periodData={loaded} examWeight={examWeight} />
      )}
    </div>
  )
}

function AnnualByPeriodGrid({
  periodData,
}: {
  periodData: Array<{ period: AcademicPeriod; data: GradesReportData }>
}) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  // Totales por período y unión de estudiantes
  const totalsByPeriod = periodData.map((pd) => periodTotalsByStudent(pd.data))
  const studentMap = new Map<string, { lastName: string; firstName: string }>()
  for (const pd of periodData) {
    for (const row of pd.data.students) {
      if (!studentMap.has(row.student.id)) {
        studentMap.set(row.student.id, {
          lastName: row.student.profile.lastName,
          firstName: row.student.profile.firstName,
        })
      }
    }
  }
  const students = [...studentMap.entries()]
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 min-w-[180px] border border-border bg-muted/60 px-3 py-2 text-left font-semibold">
              Estudiante
            </th>
            {periodData.map(({ period }) => (
              <th key={period.id} className="whitespace-nowrap border border-border px-3 py-2 text-center font-semibold text-primary">
                {period.name}
              </th>
            ))}
            <th className="whitespace-nowrap border border-border bg-muted px-3 py-2 text-center font-semibold">
              Anual
            </th>
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => {
            const perPeriod = totalsByPeriod.map((m) => m.get(s.id) ?? null)
            const annual = mean(perPeriod)
            return (
              <tr key={s.id} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
                <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-inherit px-3 py-2 font-medium">
                  {s.lastName}, {s.firstName}
                </td>
                {perPeriod.map((v, idx) => (
                  <td key={periodData[idx].period.id} className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(v, gradingScaleMax)}>{v != null ? v.toFixed(2) : '—'}</span>
                  </td>
                ))}
                <td className="border border-border bg-muted/20 px-3 py-2 text-center font-bold tabular-nums">
                  <span className={scoreColor(annual, gradingScaleMax)}>{annual != null ? annual.toFixed(2) : '—'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** Estructura de columnas de un período (mismos criterios que CompactGrid). */
function buildPeriodColumns(data: GradesReportData) {
  const kindOf = (code: string) => (code === 'exam' ? 'exam' : code === 'project' ? 'project' : 'regular')
  const allActs = data.insumos.flatMap((i) => i.activities)
  const regularInsumos = data.insumos
    .filter((i) => i.id !== 'no-insumo')
    .map((i) => ({ ...i, activities: i.activities.filter((a) => kindOf(a.activityType.code) === 'regular') }))
    .filter((i) => i.activities.length > 0)
  const summaryByStudent = new Map(data.students.map((s) => [s.student.id, s.summary]))
  const hasRegular = allActs.some((a) => kindOf(a.activityType.code) === 'regular')
  const hasExam = allActs.some((a) => kindOf(a.activityType.code) === 'exam')
  const hasProject = allActs.some((a) => kindOf(a.activityType.code) === 'project')
  const colCount =
    regularInsumos.length + (hasRegular ? 1 : 0) + (hasExam ? 1 : 0) + (hasProject ? 1 : 0) + 1
  return { regularInsumos, summaryByStudent, hasRegular, hasExam, hasProject, colCount }
}

/** Detalle anual horizontal: una tabla, los trimestres como grupos de columnas. */
function AnnualDetailGrid({
  periodData,
  examWeight,
}: {
  periodData: Array<{ period: AcademicPeriod; data: GradesReportData }>
  examWeight: number
}) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  const regularWeight = 100 - examWeight
  const halfWeight = Math.round(examWeight / 2)
  const cols = periodData.map((pd) => ({ period: pd.period, ...buildPeriodColumns(pd.data) }))

  const studentMap = new Map<string, { lastName: string; firstName: string }>()
  for (const pd of periodData) {
    for (const row of pd.data.students) {
      if (!studentMap.has(row.student.id)) {
        studentMap.set(row.student.id, {
          lastName: row.student.profile.lastName,
          firstName: row.student.profile.firstName,
        })
      }
    }
  }
  const students = [...studentMap.entries()]
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          {/* Fila 1: grupos por trimestre */}
          <tr className="bg-muted/60">
            <th
              rowSpan={2}
              className="sticky left-0 z-20 min-w-[180px] border border-border bg-muted/60 px-3 py-2 text-left align-bottom font-semibold"
            >
              Estudiante
            </th>
            {cols.map((c) => (
              <th
                key={c.period.id}
                colSpan={c.colCount}
                className="border border-l-2 border-l-border/80 border-border px-3 py-2 text-center font-semibold"
              >
                {c.period.name}
              </th>
            ))}
          </tr>
          {/* Fila 2: subcolumnas */}
          <tr className="bg-muted/40">
            {cols.map((c) => (
              <React.Fragment key={c.period.id}>
                {c.regularInsumos.map((ins, idx) => (
                  <th
                    key={ins.id}
                    className={cn(
                      'whitespace-nowrap border border-border px-3 py-1.5 text-center font-semibold text-primary',
                      idx === 0 && 'border-l-2 border-l-border/80',
                    )}
                  >
                    {ins.name}
                    <div className="text-[10px] font-normal text-muted-foreground">promedio</div>
                  </th>
                ))}
                {c.hasRegular && (
                  <th
                    className={cn(
                      'whitespace-nowrap border border-border bg-blue-50/50 px-3 py-1.5 text-center font-semibold text-primary',
                      c.regularInsumos.length === 0 && 'border-l-2 border-l-border/80',
                    )}
                  >
                    Formativa
                    <div className="text-[10px] font-normal text-muted-foreground">
                      {c.hasExam || c.hasProject ? `${regularWeight}%` : 'promedio'}
                    </div>
                  </th>
                )}
                {c.hasExam && (
                  <th className="whitespace-nowrap border border-border px-3 py-1.5 text-center font-semibold text-primary">
                    Examen
                    <div className="text-[10px] font-normal text-muted-foreground">{halfWeight}%</div>
                  </th>
                )}
                {c.hasProject && (
                  <th className="whitespace-nowrap border border-border px-3 py-1.5 text-center font-semibold text-primary">
                    Proyecto
                    <div className="text-[10px] font-normal text-muted-foreground">{halfWeight}%</div>
                  </th>
                )}
                <th
                  className={cn(
                    'whitespace-nowrap border border-border bg-muted px-3 py-1.5 text-center font-semibold',
                    c.colCount === 1 && 'border-l-2 border-l-border/80',
                  )}
                >
                  Total
                  {(c.hasExam || c.hasProject) && (
                    <div className="text-[10px] font-normal text-muted-foreground">ponderado</div>
                  )}
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {students.map((s, i) => (
            <tr key={s.id} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
              <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-inherit px-3 py-2 font-medium">
                {s.lastName}, {s.firstName}
              </td>
              {cols.map((c) => {
                const summary = c.summaryByStudent.get(s.id)
                const avgById = summary ? avgByInsumoId(summary) : new Map<string, number | null>()
                const insumoAvgs = c.regularInsumos.map((ins) => avgById.get(ins.id) ?? null)
                const regularAvg = summary?.insumosBase ?? null
                const examenAvg = summary?.examenAvg ?? null
                const proyectoAvg = summary?.proyectoAvg ?? null
                const total = summary?.total ?? null
                return (
                  <React.Fragment key={c.period.id}>
                    {insumoAvgs.map((avg, idx) => (
                      <td
                        key={c.regularInsumos[idx].id}
                        className={cn(
                          'border border-border px-3 py-2 text-center tabular-nums',
                          idx === 0 && 'border-l-2 border-l-border/80',
                        )}
                      >
                        <span className={scoreColor(avg, gradingScaleMax)}>{avg != null ? avg.toFixed(2) : '—'}</span>
                      </td>
                    ))}
                    {c.hasRegular && (
                      <td
                        className={cn(
                          'border border-border bg-blue-50/50 px-3 py-2 text-center font-semibold tabular-nums',
                          c.regularInsumos.length === 0 && 'border-l-2 border-l-border/80',
                        )}
                      >
                        <span className={scoreColor(regularAvg, gradingScaleMax)}>{regularAvg != null ? regularAvg.toFixed(2) : '—'}</span>
                      </td>
                    )}
                    {c.hasExam && (
                      <td className="border border-border px-3 py-2 text-center tabular-nums">
                        <span className={scoreColor(examenAvg, gradingScaleMax)}>{examenAvg != null ? examenAvg.toFixed(2) : '—'}</span>
                      </td>
                    )}
                    {c.hasProject && (
                      <td className="border border-border px-3 py-2 text-center tabular-nums">
                        <span className={scoreColor(proyectoAvg, gradingScaleMax)}>{proyectoAvg != null ? proyectoAvg.toFixed(2) : '—'}</span>
                      </td>
                    )}
                    <td
                      className={cn(
                        'border border-border bg-muted/20 px-3 py-2 text-center font-bold tabular-nums',
                        c.colCount === 1 && 'border-l-2 border-l-border/80',
                      )}
                    >
                      <span className={scoreColor(total, gradingScaleMax)}>{total != null ? total.toFixed(2) : '—'}</span>
                    </td>
                  </React.Fragment>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ---- Main Page ----

// ---- Student Grades View ----
function StudentGradesView({ periodId }: { periodId: string }) {
  const guardianStudentId = useGuardianStudentId()
  const { data: subjects, isLoading } = useQuery({
    queryKey: ['my-grades', periodId, guardianStudentId],
    queryFn: () => getMyGrades({ periodId, studentId: guardianStudentId }),
    enabled: !!periodId,
  })

  if (isLoading) return <PageLoader />
  if (!subjects || subjects.length === 0)
    return <EmptyState icon={BarChart3} title="Sin datos" description="No hay notas registradas para este período" />

  return <StudentGradesTable subjects={subjects} />
}

/** Tabla presentacional Materia × insumos para un período (sin query). */
function StudentGradesTable({ subjects }: { subjects: MyGradesSubject[] }) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  // Collect all unique insumo column names (preserve order from first subject)
  const allInsumoNames = subjects[0]?.insumoColumns.map((c) => c.name) ?? []

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="text-sm border-collapse w-full">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 bg-muted/60 border border-border px-3 py-2 text-left font-semibold min-w-[160px]">
              Materia
            </th>
            {allInsumoNames.map((name) => (
              <th key={name} className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                {name}
              </th>
            ))}
            {allInsumoNames.length > 0 && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary bg-blue-50/50 whitespace-nowrap">
                Formativa
                <div className="text-[10px] font-normal text-muted-foreground">
                  {subjects.some((s) => s.hasSummative) ? `${100 - (subjects[0]?.examWeight ?? 30)}%` : 'promedio'}
                </div>
              </th>
            )}
            {subjects.some((s) => s.examenAvg != null) && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                Examen
                <div className="text-[10px] font-normal text-muted-foreground">{Math.round((subjects[0]?.examWeight ?? 30) / 2)}%</div>
              </th>
            )}
            {subjects.some((s) => s.proyectoAvg != null) && (
              <th className="border border-border px-3 py-2 text-center font-semibold text-primary whitespace-nowrap">
                Proyecto
                <div className="text-[10px] font-normal text-muted-foreground">{Math.round((subjects[0]?.examWeight ?? 30) / 2)}%</div>
              </th>
            )}
            <th className="border border-border px-3 py-2 text-center font-semibold bg-muted whitespace-nowrap">
              Total
            </th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => (
            <tr key={s.assignmentId} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
              <td className="sticky left-0 z-10 bg-inherit border border-border px-3 py-2 font-medium whitespace-nowrap">
                <div>{s.subjectName}</div>
                <div className="text-xs text-muted-foreground">{s.teacherName}</div>
              </td>
              {allInsumoNames.map((name) => {
                const col = s.insumoColumns.find((c) => c.name === name)
                const v = col?.avg ?? null
                return (
                  <td key={name} className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(v, gradingScaleMax)}>{v != null ? v.toFixed(2) : '—'}</span>
                  </td>
                )
              })}
              {allInsumoNames.length > 0 && (
                <td className="border border-border px-3 py-2 text-center tabular-nums bg-blue-50/50 font-semibold">
                  <span className={scoreColor(s.regularAvg, gradingScaleMax)}>
                    {s.regularAvg != null ? s.regularAvg.toFixed(2) : '—'}
                  </span>
                </td>
              )}
              {subjects.some((sub) => sub.examenAvg != null) && (
                <td className="border border-border px-3 py-2 text-center tabular-nums">
                  <span className={scoreColor(s.examenAvg ?? null, gradingScaleMax)}>
                    {s.examenAvg != null ? s.examenAvg.toFixed(2) : '—'}
                  </span>
                </td>
              )}
              {subjects.some((sub) => sub.proyectoAvg != null) && (
                <td className="border border-border px-3 py-2 text-center tabular-nums">
                  <span className={scoreColor(s.proyectoAvg ?? null, gradingScaleMax)}>
                    {s.proyectoAvg != null ? s.proyectoAvg.toFixed(2) : '—'}
                  </span>
                </td>
              )}
              <td className="border border-border px-3 py-2 text-center font-bold tabular-nums bg-muted/20">
                <span className={scoreColor(s.total, gradingScaleMax)}>
                  {s.total != null ? s.total.toFixed(2) : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Vista anual del alumno/representante: consolida sus materias en todos los trimestres. */
function StudentAnnualView({ periods }: { periods: AcademicPeriod[] }) {
  const [view, setView] = React.useState<AnnualView>('byPeriod')
  const sortedPeriods = React.useMemo(
    () => [...periods].sort((a, b) => a.periodNumber - b.periodNumber),
    [periods],
  )

  const guardianStudentId = useGuardianStudentId()
  const results = useQueries({
    queries: sortedPeriods.map((p) => ({
      queryKey: ['my-grades', p.id, guardianStudentId],
      queryFn: () => getMyGrades({ periodId: p.id, studentId: guardianStudentId }),
    })),
  })

  if (results.some((r) => r.isLoading)) return <PageLoader />

  const periodData = sortedPeriods.map((p, i) => ({ period: p, subjects: results[i].data ?? [] }))
  const loaded = periodData.filter((pd) => pd.subjects.length > 0)

  if (loaded.length === 0) {
    return <EmptyState icon={BarChart3} title="Sin datos" description="No hay notas registradas en este año lectivo" />
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-sm text-muted-foreground">
          Vista anual · {loaded.length} de {sortedPeriods.length} período(s) con datos
        </span>
        <div className="flex self-start overflow-hidden rounded-md border text-xs">
          <button
            type="button"
            onClick={() => setView('byPeriod')}
            className={cn(
              'px-3 py-1.5 font-medium transition-colors',
              view === 'byPeriod' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Promedio por trimestre
          </button>
          <button
            type="button"
            onClick={() => setView('detail')}
            className={cn(
              'border-l px-3 py-1.5 font-medium transition-colors',
              view === 'detail' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
            )}
          >
            Detalle por trimestre
          </button>
        </div>
      </div>

      {view === 'byPeriod' ? (
        <StudentAnnualByPeriodGrid periodData={periodData} />
      ) : (
        <div className="space-y-6">
          {periodData.map(({ period, subjects }) => (
            <div key={period.id} className="space-y-2">
              <h3 className="text-sm font-semibold">{period.name}</h3>
              {subjects.length > 0 ? (
                <StudentGradesTable subjects={subjects} />
              ) : (
                <p className="text-xs text-muted-foreground">Sin notas registradas en este período.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StudentAnnualByPeriodGrid({
  periodData,
}: {
  periodData: Array<{ period: AcademicPeriod; subjects: MyGradesSubject[] }>
}) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  // Unión de materias por assignmentId (preserva nombre y docente)
  const subjectMap = new Map<string, { subjectName: string; teacherName: string }>()
  for (const pd of periodData) {
    for (const s of pd.subjects) {
      if (!subjectMap.has(s.assignmentId)) {
        subjectMap.set(s.assignmentId, { subjectName: s.subjectName, teacherName: s.teacherName })
      }
    }
  }
  const subjects = [...subjectMap.entries()]
    .map(([assignmentId, v]) => ({ assignmentId, ...v }))
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName))

  // total por (assignmentId, período)
  const totalByKey = new Map<string, number | null>()
  for (const pd of periodData) {
    for (const s of pd.subjects) totalByKey.set(`${s.assignmentId}:${pd.period.id}`, s.total)
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/60">
            <th className="sticky left-0 z-20 min-w-[180px] border border-border bg-muted/60 px-3 py-2 text-left font-semibold">
              Materia
            </th>
            {periodData.map(({ period }) => (
              <th key={period.id} className="whitespace-nowrap border border-border px-3 py-2 text-center font-semibold text-primary">
                {period.name}
              </th>
            ))}
            <th className="whitespace-nowrap border border-border bg-muted px-3 py-2 text-center font-semibold">Anual</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s, i) => {
            const perPeriod = periodData.map((pd) => totalByKey.get(`${s.assignmentId}:${pd.period.id}`) ?? null)
            const annual = mean(perPeriod)
            return (
              <tr key={s.assignmentId} className={cn('hover:bg-muted/20', i % 2 === 0 ? 'bg-white' : 'bg-muted/10')}>
                <td className="sticky left-0 z-10 whitespace-nowrap border border-border bg-inherit px-3 py-2 font-medium">
                  <div>{s.subjectName}</div>
                  <div className="text-xs text-muted-foreground">{s.teacherName}</div>
                </td>
                {perPeriod.map((v, idx) => (
                  <td key={periodData[idx].period.id} className="border border-border px-3 py-2 text-center tabular-nums">
                    <span className={scoreColor(v, gradingScaleMax)}>{v != null ? v.toFixed(2) : '—'}</span>
                  </td>
                ))}
                <td className="border border-border bg-muted/20 px-3 py-2 text-center font-bold tabular-nums">
                  <span className={scoreColor(annual, gradingScaleMax)}>{annual != null ? annual.toFixed(2) : '—'}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function GradeEntryPage() {
  const { hasAnyRole } = usePermissions()
  const isStudentOrGuardian = hasAnyRole('student', 'guardian')

  const teacherDefaults = useTeacherDefaults()

  // Student: load their own assignments + periods (backend resolves the active year)
  const { data: myData, isSuccess: myDataLoaded } = useQuery({
    queryKey: ['my-course-assignments'],
    queryFn: () => academicApi.getMyAssignments(),
    enabled: isStudentOrGuardian,
  })
  const studentAssignments = myData?.assignments ?? []
  const studentPeriods = myData?.periods ?? []

  const assignments = isStudentOrGuardian ? studentAssignments : teacherDefaults.assignments
  const periods = isStudentOrGuardian ? studentPeriods : teacherDefaults.periods
  const defaultAssignmentId = isStudentOrGuardian
    ? (myDataLoaded && studentAssignments.length === 1 ? studentAssignments[0].id : '')
    : teacherDefaults.defaultAssignmentId
  const defaultPeriodId = isStudentOrGuardian
    ? (studentPeriods.find((p) => p.isActive)?.id ?? studentPeriods[0]?.id ?? '')
    : teacherDefaults.defaultPeriodId

  // Students only see summary tab
  const [activeTab, setActiveTab] = React.useState<Tab>(isStudentOrGuardian ? 'summary' : 'entry')
  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState('')
  const [selectedPeriodId, setSelectedPeriodId] = React.useState('')
  const [selectedActivityId, setSelectedActivityId] = React.useState('')

  // Apply defaults once they're available
  React.useEffect(() => {
    if (defaultAssignmentId && !selectedAssignmentId) setSelectedAssignmentId(defaultAssignmentId)
  }, [defaultAssignmentId])

  React.useEffect(() => {
    if (defaultPeriodId && selectedAssignmentId && !selectedPeriodId) setSelectedPeriodId(defaultPeriodId)
  }, [defaultPeriodId, selectedAssignmentId])

  const { data: activitiesList = [] } = useQuery({
    queryKey: ['activities', selectedAssignmentId, selectedPeriodId],
    queryFn: () =>
      activitiesApi.getActivities({
        courseAssignmentId: selectedAssignmentId,
        periodId: selectedPeriodId,
      }),
    enabled: !!selectedAssignmentId && !!selectedPeriodId && selectedPeriodId !== ALL_PERIODS,
  })

  const selectedActivity = activitiesList.find((a) => a.id === selectedActivityId)

  const { data: grades = [], isLoading: gradesLoading } = useGradesByActivity(selectedActivityId)
  const bulkSave = useBulkSaveGrades()

  // Local grade state
  const [localGrades, setLocalGrades] = React.useState<Record<string, number | null>>({})
  const [localStatus, setLocalStatus] = React.useState<Record<string, GradeStatus>>({})
  const [modified, setModified] = React.useState<Set<string>>(new Set())

  // Reset local state when activity changes
  React.useEffect(() => {
    setLocalGrades({})
    setLocalStatus({})
    setModified(new Set())
  }, [selectedActivityId])

  // Reset period/activity when assignment changes
  React.useEffect(() => {
    setSelectedPeriodId('')
    setSelectedActivityId('')
  }, [selectedAssignmentId])

  React.useEffect(() => {
    setSelectedActivityId('')
  }, [selectedPeriodId])

  function handleScoreChange(studentId: string, value: number | null) {
    setLocalGrades((prev) => ({ ...prev, [studentId]: value }))
    setModified((prev) => new Set(prev).add(studentId))
  }

  function handleStatusChange(studentId: string, status: GradeStatus) {
    setLocalStatus((prev) => ({ ...prev, [studentId]: status }))
    // Ajustar la nota según el estado: no realizado → 0, excusado → sin nota.
    if (status === 'no_realizado') {
      setLocalGrades((prev) => ({ ...prev, [studentId]: 0 }))
    } else if (status === 'excusado') {
      setLocalGrades((prev) => ({ ...prev, [studentId]: null }))
    }
    setModified((prev) => new Set(prev).add(studentId))
  }

  function handleSaveAll() {
    if (modified.size === 0) {
      toast.info('No hay cambios pendientes')
      return
    }
    const current = new Map(grades.map((g) => [g.studentId, g]))
    const gradesToSave: GradeInput[] = Array.from(modified).map((studentId) => ({
      studentId,
      activityId: selectedActivityId,
      score: localGrades[studentId] ?? null,
      status: localStatus[studentId] ?? current.get(studentId)?.status ?? 'entregado',
    }))
    bulkSave.mutate(gradesToSave, {
      onSuccess: () => {
        setModified(new Set())
        setLocalGrades({})
        setLocalStatus({})
      },
    })
  }

  const canShowGrades = !!selectedAssignmentId && !!selectedPeriodId && !!selectedActivityId

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notas</h1>
          <p className="text-muted-foreground text-sm mt-1">Ingresa y consulta las notas de los estudiantes</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {!isStudentOrGuardian && (
          <button
            type="button"
            onClick={() => setActiveTab('entry')}
            className={cn(
              'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
              activeTab === 'entry'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            Ingresar Notas
          </button>
        )}
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors',
            activeTab === 'summary'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          {isStudentOrGuardian ? 'Mis Calificaciones' : 'Ver Resumen'}
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        {!isStudentOrGuardian && (
          <div className="w-full sm:w-64">
            <Select value={selectedAssignmentId} onValueChange={setSelectedAssignmentId}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar asignación" />
              </SelectTrigger>
              <SelectContent>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.subject?.name ?? a.subjectName ?? a.subjectId} — {a.parallel?.level?.name ? `${a.parallel.level.name} ${a.parallel.name}` : (a.parallelName ?? a.parallelId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="w-full sm:w-44">
          <Select
            value={selectedPeriodId}
            onValueChange={setSelectedPeriodId}
            disabled={!isStudentOrGuardian && !selectedAssignmentId}
          >
            <SelectTrigger>
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {activeTab === 'summary' && (
                <SelectItem value={ALL_PERIODS}>Todos los trimestres</SelectItem>
              )}
              {periods.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {activeTab === 'entry' && !isStudentOrGuardian && (
          <div className="w-full sm:w-52">
            <Select
              value={selectedActivityId}
              onValueChange={setSelectedActivityId}
              disabled={!selectedPeriodId}
            >
              <SelectTrigger>
                <SelectValue placeholder="Actividad" />
              </SelectTrigger>
              <SelectContent>
                {activitiesList.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'summary' ? (
        isStudentOrGuardian ? (
          selectedPeriodId === ALL_PERIODS ? (
            <StudentAnnualView periods={periods} />
          ) : selectedPeriodId ? (
            <StudentGradesView periodId={selectedPeriodId} />
          ) : (
            <EmptyState icon={BarChart3} title="Selecciona un período" description="Elige el período académico para ver tus notas" />
          )
        ) : selectedAssignmentId && selectedPeriodId === ALL_PERIODS ? (
          <AnnualSummaryTab courseAssignmentId={selectedAssignmentId} periods={periods} />
        ) : selectedAssignmentId && selectedPeriodId ? (
          <SummaryTab courseAssignmentId={selectedAssignmentId} periodId={selectedPeriodId} />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="Selecciona una asignación y período"
            description="Para ver el resumen de notas, selecciona la asignación y el período"
          />
        )
      ) : !canShowGrades ? (
        <EmptyState
          icon={GraduationCap}
          title="Selecciona los filtros"
          description="Selecciona la asignación, período y actividad para ingresar notas"
        />
      ) : gradesLoading ? (
        <PageLoader />
      ) : grades.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Sin estudiantes"
          description="No hay estudiantes registrados para esta actividad"
        />
      ) : (
        <div className="space-y-4">
          {/* Activity info + Save button */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div>
                <p className="break-words text-sm font-semibold">{selectedActivity?.name}</p>
                <p className="text-xs text-muted-foreground">
                  Puntaje máximo: {selectedActivity?.maxScore} pts
                  {modified.size > 0 && (
                    <span className="ml-2 text-amber-600">
                      · {modified.size} {modified.size === 1 ? 'cambio pendiente' : 'cambios pendientes'}
                    </span>
                  )}
                </p>
              </div>
              {selectedActivity?.isPublished ? (
                <Badge variant="success">Publicado</Badge>
              ) : (
                <Badge variant="secondary">Borrador</Badge>
              )}
            </div>
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

          {/* Grade table */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Estudiante</TableHead>
                  <TableHead>Nota</TableHead>
                  <TableHead>Entrega</TableHead>
                  <TableHead className="w-32">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {grades.map((grade) => (
                  <GradeRow
                    key={grade.studentId}
                    grade={grade}
                    maxScore={selectedActivity?.maxScore ?? 10}
                    localScore={localGrades[grade.studentId]}
                    localStatus={localStatus[grade.studentId]}
                    isModified={modified.has(grade.studentId)}
                    onChange={handleScoreChange}
                    onStatusChange={handleStatusChange}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      )}
    </div>
  )
}
