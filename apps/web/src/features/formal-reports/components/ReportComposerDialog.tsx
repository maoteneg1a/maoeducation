import { reinforcementDeskApi } from '@/features/reinforcement-desk/api/reinforcement-desk.api'
import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowRight, FileText, Loader2, Lock } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { formalReportsApi, type ReportTypeConfig } from '../api/formal-reports.api'

export interface ReportComposerContext {
  alertId?: string
  reinforcementPlanId?: string
  studentId?: string
  parallelId?: string
  courseAssignmentId?: string
  academicPeriodId?: string
  academicYearId?: string
}

/**
 * Elige el tipo de informe (catálogo configurable de la institución) y crea el
 * BORRADOR con el contexto dado (alerta, caso de refuerzo, estudiante...).
 */
export function ReportComposerDialog({
  open,
  onOpenChange,
  context,
  typeKeys,
  defaultTypeKey,
  onCreated,
  students: providedStudents,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  context: ReportComposerContext
  typeKeys?: string[]
  defaultTypeKey?: string
  onCreated?: (reportId: string) => void
  students?: Array<{ id: string; name: string }>
}) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const plan = useQuery({
    queryKey: ['reinforcement-desk-detail', context.reinforcementPlanId],
    queryFn: () => reinforcementDeskApi.detail(context.reinforcementPlanId!),
    enabled: open && !!context.reinforcementPlanId && !providedStudents,
  })
  const students = providedStudents ?? plan.data?.students
  const { roles, hasRole } = usePermissions()
  const [selected, setSelected] = React.useState<string | null>(defaultTypeKey ?? null)
  const [studentId, setStudentId] = React.useState('')
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['reports-flow'],
    queryFn: formalReportsApi.reportsFlow,
    enabled: open,
    staleTime: 60_000,
  })

  React.useEffect(() => {
    if (open) { setSelected(defaultTypeKey ?? null); setStudentId(context.studentId ?? (students?.length === 1 ? students[0].id : '')) }
  }, [open, defaultTypeKey])

  const isAuthority = hasRole('admin') || hasRole('rector')
  const hasStudent = !!(context.studentId || context.alertId || context.reinforcementPlanId)
  const hasParallel = hasStudent || !!context.parallelId || !!context.courseAssignmentId

  const types = React.useMemo(() => {
    const list = (data?.config.reportTypes ?? []).filter((t) => t.enabled)
    return list
      .filter((t) => !typeKeys || typeKeys.includes(t.key))
      .filter((t) => !t.requiresReinforcementCase || !!context.reinforcementPlanId)
      .filter((t) => isAuthority || t.authorRoles.includes('tutor') || t.authorRoles.some((r) => roles.includes(r)))
  }, [data, typeKeys, context.reinforcementPlanId, isAuthority, roles])

  const unavailableReason = (t: ReportTypeConfig): string | null => {
    if (context.reinforcementPlanId && !providedStudents && plan.isPending) return 'Cargando los participantes del plan'
    if (context.reinforcementPlanId && !providedStudents && plan.isError) return 'No se pudo cargar el plan'
    if (t.pdfTemplate && !context.alertId && !context.reinforcementPlanId && (!context.courseAssignmentId || !context.academicPeriodId)) return 'Requiere asignatura y periodo'
    if (t.scope === 'student' && !hasStudent) return 'Requiere un estudiante'
    if (t.scope === 'parallel' && !hasParallel) return 'Requiere un paralelo'
    return null
  }

  const instanceLabel = (key: string) => data?.config.instances.find((i) => i.key === key)?.label ?? key

  const create = useMutation({
    mutationFn: (typeKey: string) =>
      formalReportsApi.create({
        typeKey,
        ...Object.fromEntries(Object.entries(context).filter(([, v]) => !!v)),
        ...(studentId ? { studentId } : {}),
      }),
    onSuccess: (report) => {
      qc.invalidateQueries({ queryKey: ['formal-reports'] })
      qc.invalidateQueries({ queryKey: ['formal-reports-counts'] })
      toast.success('Borrador creado')
      onOpenChange(false)
      onCreated?.(report.id)
      navigate(`/informes/${report.id}`)
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const current = types.find((t) => t.key === selected) ?? null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Redactar informe</DialogTitle>
          <DialogDescription>
            Elige el tipo de informe. Se crea como borrador: podrás completarlo, adjuntar evidencias y enviarlo a la instancia correspondiente.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <PageLoader />
        ) : isError ? (
          <div className="space-y-2"><p role="alert">{getErrorMessage(error)}</p><Button variant="outline" onClick={() => refetch()}>Reintentar</Button></div>
        ) : types.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay tipos de informe disponibles para este contexto o tu rol.
          </p>
        ) : (
          <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
            {types.map((t) => {
              const reason = unavailableReason(t)
              return (
                <button
                  key={t.key}
                  type="button"
                  disabled={!!reason}
                  onClick={() => setSelected(t.key)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition-colors',
                    selected === t.key ? 'border-primary bg-primary/5' : 'hover:bg-muted/50',
                    reason && 'cursor-not-allowed opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div>
                        <p className="text-sm font-medium">{t.label}</p>
                        {t.description && <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>}
                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                          <ArrowRight className="h-3 w-3" /> {instanceLabel(t.to)}
                          {t.ackDeadlineDays > 0 && <> · acuse en {t.ackDeadlineDays} día(s)</>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {t.confidential && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Confidencial</Badge>}
                      {t.triggeredByAlert && <Badge variant="warning">Alerta</Badge>}
                      {reason && <span className="text-[11px] text-muted-foreground">{reason}</span>}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <DialogFooter>
          {!!students?.length && current?.scope === 'student' && (
            <div className="mr-auto w-full space-y-1 sm:w-64">
              <Label>Estudiante del informe individual</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Selecciona un estudiante" /></SelectTrigger>
                <SelectContent>{students.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!current || !!(current && unavailableReason(current)) || (!!students?.length && current?.scope === 'student' && !studentId) || create.isPending} onClick={() => current && create.mutate(current.key)}>
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Crear borrador
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
