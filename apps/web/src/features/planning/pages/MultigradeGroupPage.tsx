import * as React from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Sparkles, Download, Users } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { usePeriods } from '@/features/academic/hooks/useAcademic'
import { useAiEnabled } from '@/features/ai-assistant/hooks/useAiAssistant'
import { planningApi } from '../api/planning.api'
import { useMultigradeGroup, useDraftMultigradeWeek } from '../hooks/useMultigrade'
import type { DraftMultigradeWeekResult } from '@/features/ai-assistant/api/ai-assistant.api'

export function MultigradeGroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const aiEnabled = useAiEnabled()
  const { data: group, isLoading } = useMultigradeGroup(groupId)
  const { data: periods = [] } = usePeriods(group?.academicYearId ?? '')
  const draftWeek = useDraftMultigradeWeek()

  const [academicPeriodId, setAcademicPeriodId] = React.useState('')
  const [weekNumber, setWeekNumber] = React.useState('')
  const [lastResult, setLastResult] = React.useState<DraftMultigradeWeekResult | null>(null)
  const [downloadingWeek, setDownloadingWeek] = React.useState<number | null>(null)

  const nextWeekNumber = React.useMemo(() => {
    if (!group || group.experiences.length === 0) return 1
    return Math.max(...group.experiences.map((e) => e.weekNumber)) + 1
  }, [group])

  React.useEffect(() => {
    if (!weekNumber) setWeekNumber(String(nextWeekNumber))
  }, [nextWeekNumber])

  if (isLoading) return <PageLoader />
  if (!group) return <EmptyState icon={Users} title="Aula multigrado no encontrada" />

  const canGenerate = !!academicPeriodId && !!weekNumber && Number(weekNumber) >= 1

  const handleGenerate = () => {
    if (!canGenerate || !groupId) return
    draftWeek.mutate(
      { groupId, academicPeriodId, weekNumber: Number(weekNumber) },
      { onSuccess: (result) => setLastResult(result) },
    )
  }

  const handleDownload = async (wn: number) => {
    if (!groupId) return
    setDownloadingWeek(wn)
    try {
      await planningApi.downloadMultigradePdf(groupId, wn)
    } finally {
      setDownloadingWeek(null)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <Link to="/planning" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" />
          Planificaciones
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Users className="h-5 w-5 text-muted-foreground" />
          {group.name}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Aula multigrado — {group.members.length} grado(s)/materia(s) participando a la vez
        </p>
      </div>

      <Card className="p-4 sm:p-6">
        <p className="text-sm font-medium mb-2">Grados y materias del grupo</p>
        <div className="flex flex-wrap gap-2">
          {group.members.map((m) => (
            <Badge key={m.courseAssignmentId} variant="secondary">
              {m.gradeName} — {m.subjectName}
            </Badge>
          ))}
        </div>
      </Card>

      {!aiEnabled ? (
        <EmptyState icon={Sparkles} title="Asistente IA no habilitado" description="Pide al administrador que active el asistente IA para generar la experiencia común." />
      ) : (
        <Card className="space-y-4 p-4 sm:p-6">
          <div>
            <p className="text-sm font-medium">Generar experiencia común de una semana</p>
            <p className="text-xs text-muted-foreground">
              El sistema plantea una situación disparadora común para toda el aula y genera, a la vez, la semana
              completa (Inicio/Desarrollo/Cierre) de cada grado — cada grado conserva su propio currículo.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Periodo académico</Label>
              <Select value={academicPeriodId} onValueChange={setAcademicPeriodId}>
                <SelectTrigger>
                  <SelectValue placeholder="Trimestre / periodo" />
                </SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Número de semana</Label>
              <Input type="number" min={1} value={weekNumber} onChange={(e) => setWeekNumber(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={handleGenerate} disabled={!canGenerate} loading={draftWeek.isPending}>
              <Sparkles className="h-4 w-4" />
              Generar experiencia común de esta semana
            </Button>
          </div>

          {lastResult && (
            <div className="space-y-2 border-t pt-4">
              <p className="text-sm font-medium">{lastResult.title}</p>
              <p className="text-sm text-muted-foreground">{lastResult.context}</p>
              <p className="text-sm text-muted-foreground">{lastResult.commonPurpose}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                {lastResult.grades.map((g) => (
                  <Badge key={g.courseAssignmentId} variant={g.validationErrors.length > 0 ? 'warning' : 'success'}>
                    {g.gradeCode}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Semanas generadas</h2>
        {group.experiences.length === 0 ? (
          <EmptyState icon={Sparkles} title="Todavía no hay semanas generadas" description="Usa el formulario de arriba para generar la primera." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.experiences.map((exp) => (
              <Card key={exp.id} className="p-4">
                <p className="font-medium">Semana {exp.weekNumber}</p>
                <p className="text-xs text-muted-foreground mt-1">{exp.title}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  loading={downloadingWeek === exp.weekNumber}
                  onClick={() => handleDownload(exp.weekNumber)}
                >
                  <Download className="h-3.5 w-3.5" />
                  Descargar PDF
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
