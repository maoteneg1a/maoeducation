import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { GraduationCap, ChevronDown, ChevronRight, Save, Lock, ListFilter } from 'lucide-react'
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
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { useAcademicYears, useParallels } from '@/features/academic/hooks/useAcademic'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { useGradingConfig } from '@/features/settings/hooks/useSettings'
import {
  promotionApi,
  type PromotionStatus,
  type PromotionStudent,
  type PromotionSubject,
  type RecoveryType,
  type SubjectStatus,
  type EffectiveStatus,
} from '../api/promotion.api'

const SUBJECT_STATUS: Record<SubjectStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  approved: { label: 'Aprobado', variant: 'success' },
  supletorio: { label: 'Supletorio', variant: 'warning' },
  remedial: { label: 'Remedial', variant: 'destructive' },
  pending: { label: 'Sin notas', variant: 'secondary' },
}

const EFFECTIVE_STATUS: Record<EffectiveStatus, { label: string; variant: 'success' | 'warning' | 'destructive' | 'secondary' }> = {
  passed: { label: 'Aprobada', variant: 'success' },
  failed: { label: 'Reprobada', variant: 'destructive' },
  recovery_pending: { label: 'Falta recuperación', variant: 'warning' },
  pending: { label: 'Sin notas', variant: 'secondary' },
}

const PROMOTION_STATUS: Record<PromotionStatus, { label: string; variant: 'success' | 'destructive' | 'secondary' }> = {
  promoted: { label: 'Promovido', variant: 'success' },
  not_promoted: { label: 'No promovido', variant: 'destructive' },
  pending: { label: 'Pendiente', variant: 'secondary' },
}

const RECOVERY_TYPES: RecoveryType[] = ['supletorio', 'remedial', 'gracia']

function fmt(v: number | null) {
  return v != null ? v.toFixed(2) : '—'
}

export function PromotionPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const { hasAnyRole } = usePermissions()
  const isAdminLike = hasAnyRole('admin', 'inspector')

  const { data: years = [] } = useAcademicYears()
  const [yearId, setYearId] = React.useState('')
  const activeYear = years.find((y) => y.isActive)

  React.useEffect(() => {
    if (!yearId && activeYear) setYearId(activeYear.id)
  }, [activeYear])

  const { data: allParallels = [] } = useParallels(yearId || undefined)
  const parallels = React.useMemo(() => {
    if (isAdminLike) return allParallels
    const tutored = user?.tutorParallelIds ?? []
    return allParallels.filter((p) => tutored.includes(p.id))
  }, [allParallels, isAdminLike, user])

  const [parallelId, setParallelId] = React.useState('')
  React.useEffect(() => {
    if (parallels.length === 1 && !parallelId) setParallelId(parallels[0].id)
  }, [parallels])

  const canLoad = !!parallelId && !!yearId
  const { data, isLoading } = useQuery({
    queryKey: ['promotion', parallelId, yearId],
    queryFn: () => promotionApi.getByParallel(parallelId, yearId),
    enabled: canLoad,
  })

  const [onlyRecovery, setOnlyRecovery] = React.useState(false)

  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const saveRecovery = useMutation({
    mutationFn: promotionApi.saveRecovery,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion', parallelId, yearId] })
      toast.success('Recuperación guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const saveDecision = useMutation({
    mutationFn: promotionApi.saveDecision,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promotion', parallelId, yearId] })
      toast.success('Decisión guardada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Promoción y recuperaciones</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Estado anual por materia, exámenes de recuperación y decisión de promoción
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-44">
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger>
              <SelectValue placeholder="Año lectivo" />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-64">
          <Select value={parallelId} onValueChange={setParallelId} disabled={!yearId}>
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
      </div>

      {!canLoad ? (
        <EmptyState
          icon={GraduationCap}
          title="Selecciona los filtros"
          description="Elige el año lectivo y el paralelo para ver el estado de promoción."
        />
      ) : isLoading ? (
        <PageLoader />
      ) : !data || data.students.length === 0 ? (
        <EmptyState icon={GraduationCap} title="Sin estudiantes" description="No hay estudiantes matriculados en este paralelo." />
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Aprueba con ≥ {data.config.minToPass} · supletorio {data.config.supletorioMin}–{data.config.supletorioMax} ·
            aprueba el supletorio con ≥ {data.config.passWithExam} · máx. {data.config.maxFailedSubjects} materia(s) reprobada(s)
          </p>

          {!data.recoveryEnabled && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Las recuperaciones se habilitan al cerrar todos los periodos del año (
                {data.periodsClosed}/{data.periodsTotal} cerrados). Por ahora puedes consultar el
                estado anual, pero no registrar supletorios/remediales.
              </span>
            </div>
          )}

          {(() => {
            const recoveryCount = data.students.filter((s) =>
              s.subjects.some((subj) => subj.status === 'supletorio' || subj.status === 'remedial'),
            ).length
            const visible = onlyRecovery
              ? data.students.filter((s) =>
                  s.subjects.some((subj) => subj.status === 'supletorio' || subj.status === 'remedial'),
                )
              : data.students
            return (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant={onlyRecovery ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setOnlyRecovery((v) => !v)}
                  >
                    <ListFilter className="h-4 w-4" />
                    Solo con supletorio/remedial
                    <Badge variant="secondary" className="ml-1">
                      {recoveryCount}
                    </Badge>
                  </Button>
                  <span className="text-xs text-muted-foreground">
                    {visible.length} de {data.students.length} estudiante(s)
                  </span>
                </div>

                {visible.length === 0 ? (
                  <EmptyState
                    icon={GraduationCap}
                    title="Sin estudiantes en recuperación"
                    description="Ningún estudiante de este paralelo quedó en supletorio o remedial."
                  />
                ) : (
                  visible.map((student) => (
                    <StudentCard
                      key={student.studentId}
                      student={student}
                      yearId={yearId}
                      expanded={expanded.has(student.studentId)}
                      onToggle={() => toggle(student.studentId)}
                      passWithExam={data.config.passWithExam}
                      recoveryEnabled={data.recoveryEnabled}
                      onSaveRecovery={(input) => saveRecovery.mutate(input)}
                      onSaveDecision={(input) => saveDecision.mutate(input)}
                      savingRecovery={saveRecovery.isPending}
                      savingDecision={saveDecision.isPending}
                    />
                  ))
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

interface StudentCardProps {
  student: PromotionStudent
  yearId: string
  expanded: boolean
  onToggle: () => void
  passWithExam: number
  recoveryEnabled: boolean
  onSaveRecovery: (input: { studentId: string; courseAssignmentId: string; academicYearId: string; type: RecoveryType; score: number | null }) => void
  onSaveDecision: (input: { studentId: string; academicYearId: string; status: PromotionStatus; notes?: string | null }) => void
  savingRecovery: boolean
  savingDecision: boolean
}

function StudentCard({
  student,
  yearId,
  expanded,
  onToggle,
  recoveryEnabled,
  onSaveRecovery,
  onSaveDecision,
  savingRecovery,
  savingDecision,
}: StudentCardProps) {
  const [decisionStatus, setDecisionStatus] = React.useState<PromotionStatus>(
    student.decision?.status ?? student.suggestedStatus,
  )
  const [notes, setNotes] = React.useState(student.decision?.notes ?? '')

  const approved = student.subjects.filter((s) => s.effectiveStatus === 'passed').length
  const needRecovery = student.subjects.filter(
    (s) => s.status === 'supletorio' || s.status === 'remedial',
  )

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="flex-1 font-medium">{student.studentName}</span>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {approved}/{student.subjects.length} aprobadas
          {student.failedCount > 0 && ` · ${student.failedCount} reprobada(s)`}
        </span>
        <Badge variant={PROMOTION_STATUS[student.decision?.status ?? student.suggestedStatus].variant}>
          {student.decision ? PROMOTION_STATUS[student.decision.status].label : `Sugerido: ${PROMOTION_STATUS[student.suggestedStatus].label}`}
        </Badge>
      </button>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-3">
          {/* Materias */}
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border px-2 py-1.5 text-left">Materia</th>
                  <th className="border px-2 py-1.5 text-center w-20">Prom.</th>
                  <th className="border px-2 py-1.5 text-center w-28">Estado</th>
                  <th className="border px-2 py-1.5 text-center w-44">Recuperación</th>
                  <th className="border px-2 py-1.5 text-center w-32">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {student.subjects.map((subj) => (
                  <SubjectRow
                    key={subj.assignmentId}
                    subject={subj}
                    recoveryEnabled={recoveryEnabled}
                    onSave={(type, score) =>
                      onSaveRecovery({
                        studentId: student.studentId,
                        courseAssignmentId: subj.assignmentId,
                        academicYearId: yearId,
                        type,
                        score,
                      })
                    }
                    saving={savingRecovery}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {needRecovery.length === 0 && (
            <p className="text-xs text-muted-foreground">Ninguna materia requiere recuperación.</p>
          )}

          {/* Decisión */}
          <div className="flex flex-col gap-3 rounded border bg-muted/20 p-3 sm:flex-row sm:items-end">
            <div className="sm:w-48">
              <label className="mb-1 block text-xs font-medium">Decisión de promoción</label>
              <Select value={decisionStatus} onValueChange={(v) => setDecisionStatus(v as PromotionStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="promoted">Promovido</SelectItem>
                  <SelectItem value="not_promoted">No promovido</SelectItem>
                  <SelectItem value="pending">Pendiente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">Observación</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opcional" />
            </div>
            <Button
              onClick={() =>
                onSaveDecision({
                  studentId: student.studentId,
                  academicYearId: yearId,
                  status: decisionStatus,
                  notes: notes.trim() || null,
                })
              }
              loading={savingDecision}
            >
              <Save className="h-4 w-4" />
              Guardar
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}

function SubjectRow({
  subject,
  recoveryEnabled,
  onSave,
  saving,
}: {
  subject: PromotionSubject
  recoveryEnabled: boolean
  onSave: (type: RecoveryType, score: number | null) => void
  saving: boolean
}) {
  const { data: gradingConfig } = useGradingConfig()
  const gradingScaleMax = gradingConfig?.gradingScaleMax ?? 10
  const needsRecovery = subject.status === 'supletorio' || subject.status === 'remedial'
  const [type, setType] = React.useState<RecoveryType>(subject.recovery?.type ?? (subject.status === 'remedial' ? 'remedial' : 'supletorio'))
  const [score, setScore] = React.useState<string>(subject.recovery ? String(subject.recovery.score) : '')

  return (
    <tr>
      <td className="border px-2 py-1.5">{subject.subjectName}</td>
      <td className="border px-2 py-1.5 text-center tabular-nums">{fmt(subject.annualAvg)}</td>
      <td className="border px-2 py-1.5 text-center">
        <Badge variant={SUBJECT_STATUS[subject.status].variant}>{SUBJECT_STATUS[subject.status].label}</Badge>
      </td>
      <td className="border px-2 py-1.5">
        {needsRecovery ? (
          <div className="flex items-center gap-1">
            <Select value={type} onValueChange={(v) => setType(v as RecoveryType)} disabled={!recoveryEnabled}>
              <SelectTrigger className="h-8 w-[7.5rem] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECOVERY_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              max={gradingScaleMax}
              step={0.01}
              inputMode="decimal"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              className="h-8 w-16 px-1 text-center text-sm"
              placeholder="—"
              disabled={!recoveryEnabled}
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2"
              disabled={saving || !recoveryEnabled}
              onClick={() => onSave(type, score === '' ? null : parseFloat(score))}
              title={recoveryEnabled ? 'Guardar recuperación' : 'Disponible al cerrar el año'}
            >
              {recoveryEnabled ? <Save className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="border px-2 py-1.5 text-center">
        <Badge variant={EFFECTIVE_STATUS[subject.effectiveStatus].variant}>
          {EFFECTIVE_STATUS[subject.effectiveStatus].label}
        </Badge>
      </td>
    </tr>
  )
}
