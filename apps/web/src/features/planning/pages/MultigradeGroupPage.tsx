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
import { planningApi, type MultigradeSubjectBlock } from '../api/planning.api'
import { useMultigradeGroup, useSuggestMultigradeWeek, useDraftMultigradeWeek } from '../hooks/useMultigrade'
import { CheckBox } from '../components/SkillAndSaberSelector'
import type { SuggestedMultigradeGrade, DraftMultigradeWeekResult } from '@/features/ai-assistant/api/ai-assistant.api'

const SABER_TYPE_LABEL: Record<'declarativo' | 'procedimental' | 'actitudinal', string> = {
  declarativo: 'Declarativo',
  procedimental: 'Procedimental',
  actitudinal: 'Actitudinal',
}

export function MultigradeGroupPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const { data: group, isLoading } = useMultigradeGroup(groupId)

  if (isLoading) return <PageLoader />
  if (!group) return <EmptyState icon={Users} title="Aula multigrado no encontrada" />

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
          La experiencia común se genera POR MATERIA — cada materia con 2+ grados es un bloque independiente.
        </p>
      </div>

      {group.subjectBlocks.map((block) => (
        <SubjectBlockCard key={block.subjectId} groupId={groupId!} academicYearId={group.academicYearId} block={block} />
      ))}
    </div>
  )
}

function SubjectBlockCard({
  groupId,
  academicYearId,
  block,
}: {
  groupId: string
  academicYearId: string
  block: MultigradeSubjectBlock
}) {
  const aiEnabled = useAiEnabled()
  const { data: periods = [] } = usePeriods(academicYearId)
  const suggestWeek = useSuggestMultigradeWeek()
  const draftWeek = useDraftMultigradeWeek()

  const [academicPeriodId, setAcademicPeriodId] = React.useState('')
  const [weekNumber, setWeekNumber] = React.useState('')
  const [suggestion, setSuggestion] = React.useState<SuggestedMultigradeGrade[] | null>(null)
  const [lastResult, setLastResult] = React.useState<DraftMultigradeWeekResult | null>(null)
  const [downloadingWeek, setDownloadingWeek] = React.useState<number | null>(null)

  const nextWeekNumber = React.useMemo(() => {
    if (block.experiences.length === 0) return 1
    return Math.max(...block.experiences.map((e) => e.weekNumber)) + 1
  }, [block.experiences])

  React.useEffect(() => {
    if (!weekNumber) setWeekNumber(String(nextWeekNumber))
  }, [nextWeekNumber])

  const canGenerable = block.members.length >= 2
  const canSuggest = canGenerable && !!academicPeriodId && !!weekNumber && Number(weekNumber) >= 1

  const toggleSaber = (courseAssignmentId: string, saberId: string) => {
    setSuggestion((prev) =>
      prev
        ? prev.map((g) =>
            g.courseAssignmentId === courseAssignmentId
              ? { ...g, saberIds: g.saberIds.includes(saberId) ? g.saberIds.filter((id) => id !== saberId) : [...g.saberIds, saberId] }
              : g,
          )
        : prev,
    )
  }

  const handleSuggest = () => {
    if (!canSuggest) return
    setLastResult(null)
    suggestWeek.mutate(
      { groupId, subjectId: block.subjectId, academicPeriodId, weekNumber: Number(weekNumber) },
      { onSuccess: (result) => setSuggestion(result) },
    )
  }

  const handleConfirm = () => {
    if (!suggestion) return
    draftWeek.mutate(
      {
        groupId,
        subjectId: block.subjectId,
        academicPeriodId,
        weekNumber: Number(weekNumber),
        grades: suggestion.map((g) => ({ courseAssignmentId: g.courseAssignmentId, competencyId: g.competencyId, saberIds: g.saberIds })),
      },
      {
        onSuccess: (result) => {
          setLastResult(result)
          setSuggestion(null)
        },
      },
    )
  }

  const handleDownload = async (wn: number) => {
    setDownloadingWeek(wn)
    try {
      await planningApi.downloadMultigradePdf(groupId, wn, block.subjectId)
    } finally {
      setDownloadingWeek(null)
    }
  }

  return (
    <Card className="space-y-4 p-4 sm:p-6">
      <div>
        <p className="text-sm font-medium">{block.subjectName}</p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          {block.members.map((m) => (
            <Badge key={m.courseAssignmentId} variant="secondary">{m.gradeName}</Badge>
          ))}
        </div>
      </div>

      {!canGenerable ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Necesitas al menos 2 grados con {block.subjectName} en esta aula para generar una experiencia común.
        </p>
      ) : !aiEnabled ? (
        <EmptyState icon={Sparkles} title="Asistente IA no habilitado" description="Pide al administrador que active el asistente IA." />
      ) : (
        <div className="space-y-4 border-t pt-4">
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
            <Button type="button" variant="outline" onClick={handleSuggest} disabled={!canSuggest} loading={suggestWeek.isPending}>
              <Sparkles className="h-4 w-4" />
              Ver sugerencia
            </Button>
          </div>

          {suggestion && (
            <div className="space-y-3 border-t pt-4">
              <p className="text-sm font-medium">Sugerencia por grado — revisa antes de generar</p>
              {suggestion.map((g) => (
                <div key={g.courseAssignmentId} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">
                      {g.gradeLabel} —{' '}
                      <span className="font-mono text-xs text-muted-foreground">{g.competencyCode}</span> {g.competencyText}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.sabers.map((saber) => {
                      const selected = g.saberIds.includes(saber.id)
                      return (
                        <button
                          key={saber.id}
                          type="button"
                          onClick={() => toggleSaber(g.courseAssignmentId, saber.id)}
                          className="flex items-center gap-1.5 rounded border px-2 py-1 text-left text-xs transition hover:bg-muted/50"
                          title={saber.description}
                        >
                          <CheckBox selected={selected} />
                          <span className="text-muted-foreground">[{SABER_TYPE_LABEL[saber.type]}]</span>
                          <span className="font-mono">{saber.code}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              <div className="flex justify-end border-t pt-3">
                <Button type="button" onClick={handleConfirm} loading={draftWeek.isPending}>
                  <Sparkles className="h-4 w-4" />
                  Confirmar y generar experiencia común
                </Button>
              </div>
            </div>
          )}

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
        </div>
      )}

      <div className="space-y-3 border-t pt-4">
        <p className="text-sm font-medium">Semanas generadas</p>
        {block.experiences.length === 0 ? (
          <p className="text-sm text-muted-foreground">Todavía no hay semanas generadas para esta materia.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {block.experiences.map((exp) => (
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
    </Card>
  )
}
