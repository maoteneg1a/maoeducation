import * as React from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, CheckCircle2, RotateCcw, NotebookPen, Download, Pencil, Sparkles, Puzzle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PdfPreviewModal } from '@/shared/components/feedback/PdfPreviewModal'
import { apiClient } from '@/shared/lib/api-client'
import { usePlanningModel } from '@/features/settings/hooks/useSettings'
import { useDraftProjectFromSituation } from '@/features/interdisciplinary-projects/hooks/useInterdisciplinaryProjects'
import { WeekCard } from '../components/WeekCard'
import { GenerateBlockPanel } from '../components/GenerateBlockPanel'
import { InterdisciplinaryConnectionSelector } from '../components/InterdisciplinaryConnectionSelector'
import {
  useSituation,
  useUpdateSituation,
  useMarkSituationReady,
  useReopenSituation,
  useWeeks,
  useCreateWeek,
} from '../hooks/usePlanning'
import { planningApi } from '../api/planning.api'
import type { SituationStatus } from '../api/planning.api'

// Sin flujo de aprobación por terceros (pedido explícito del usuario) — solo
// "Borrador" y "Listo", decididos únicamente por el docente.
const STATUS_LABEL: Record<SituationStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  listo: { label: 'Listo', variant: 'success' },
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-EC', { day: 'numeric', month: 'long' })
}

export function PlanningSituationPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: planningModel } = usePlanningModel()
  const isCompetencyModel = planningModel === 'competencias'

  const { data: situation, isLoading } = useSituation(id)
  const planId = situation?.planId
  const updateSituation = useUpdateSituation(id!, planId)
  const markSituationReady = useMarkSituationReady(id!, planId)
  const reopenSituation = useReopenSituation(id!, planId)
  const draftInterdisciplinaryProject = useDraftProjectFromSituation()

  const { data: weeks = [] } = useWeeks(id)
  const createWeek = useCreateWeek(id!)

  const [pdfPreviewOpen, setPdfPreviewOpen] = React.useState(false)
  const [downloadingDocx, setDownloadingDocx] = React.useState(false)

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [interdisciplinarySubjectIds, setInterdisciplinarySubjectIds] = React.useState<string[]>([])
  const [expandedWeek, setExpandedWeek] = React.useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = React.useState(false)

  React.useEffect(() => {
    if (situation) {
      setTitle(situation.title)
      setDescription(situation.description ?? '')
      setStartDate(situation.startDate?.slice(0, 10) ?? '')
      setEndDate(situation.endDate?.slice(0, 10) ?? '')
      setInterdisciplinarySubjectIds(situation.interdisciplinarySubjectIds ?? [])
    }
  }, [situation?.id])

  if (isLoading) return <PageLoader />
  if (!situation) return <EmptyState icon={NotebookPen} title="Situación de aprendizaje no encontrada" />

  const isEditable = situation.status === 'borrador'
  const subjectId = situation.plan?.courseAssignment?.subject.id
  const subnivel = situation.plan?.courseAssignment?.parallel.level.subnivel ?? undefined
  const nextWeekNumber = weeks.length > 0 ? Math.max(...weeks.map((w) => w.weekNumber)) + 1 : 1

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          {planId && (
            <Link to={`/planning/${planId}`} className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3.5 w-3.5" />
              Volver a {isCompetencyModel ? 'Planificación por Competencias' : 'PCA'}
            </Link>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{situation.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {situation.academicPeriod?.name} · {situation.plan?.courseAssignment?.subject.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_LABEL[situation.status].variant}>{STATUS_LABEL[situation.status].label}</Badge>
          <Button variant="outline" size="sm" onClick={() => setPdfPreviewOpen(true)}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            loading={downloadingDocx}
            onClick={async () => {
              setDownloadingDocx(true)
              try {
                await planningApi.downloadMicrocurricularDocx(situation.id)
              } finally {
                setDownloadingDocx(false)
              }
            }}
          >
            <Download className="h-4 w-4" />
            Word
          </Button>
        </div>
      </div>

      <Card className="space-y-4 p-4 sm:p-6">
        {/*
          En el modelo por competencias el título y las fechas los deriva el
          backend al crear (de la competencia y del periodo), así que aquí no hay
          nada obligatorio que llenar. Los campos quedan detrás de "Ajustar
          detalles" para quien quiera afinarlos, en vez de presentarse como
          formulario pendiente. En destrezas se siguen mostrando directos.
        */}
        {isCompetencyModel && !detailsOpen && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-1 text-sm">
              <p className="text-muted-foreground">
                {situation.startDate && situation.endDate ? (
                  <>
                    Del {formatDate(situation.startDate)} al {formatDate(situation.endDate)}
                  </>
                ) : (
                  'Sin fechas definidas'
                )}
              </p>
              {situation.description && <p className="text-foreground">{situation.description}</p>}
            </div>
            {isEditable && (
              <Button variant="ghost" size="sm" onClick={() => setDetailsOpen(true)}>
                <Pencil className="h-3.5 w-3.5" />
                Ajustar detalles
              </Button>
            )}
          </div>
        )}

        {(!isCompetencyModel || detailsOpen) && (
          <>
            <div className="space-y-1.5">
              <Label>Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} disabled={!isEditable} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción de la situación de aprendizaje</Label>
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!isEditable}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
              />
            </div>

            {isCompetencyModel && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Fecha inicio</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={!isEditable} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fecha fin</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={!isEditable} />
                </div>
              </div>
            )}

            <InterdisciplinaryConnectionSelector
              subjectIds={interdisciplinarySubjectIds}
              onSubjectIdsChange={setInterdisciplinarySubjectIds}
              isEditable={isEditable}
            />
          </>
        )}

        {isEditable && (
          <div className="flex justify-end gap-2 border-t pt-4">
            {(!isCompetencyModel || detailsOpen) && (
              <Button
                variant="outline"
                onClick={() =>
                  updateSituation.mutate(
                    {
                      title,
                      description,
                      startDate: startDate || null,
                      endDate: endDate || null,
                      interdisciplinarySubjectIds,
                    },
                    { onSuccess: () => setDetailsOpen(false) },
                  )
                }
                loading={updateSituation.isPending}
              >
                Guardar borrador
              </Button>
            )}
            <Button onClick={() => markSituationReady.mutate()} loading={markSituationReady.isPending} disabled={weeks.length === 0}>
              <CheckCircle2 className="h-4 w-4" />
              Marcar como lista
            </Button>
          </div>
        )}
        {situation.status === 'listo' && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
            {situation.interdisciplinarySubjectIds.length >= 2 && (
              <Button
                variant="default"
                onClick={() =>
                  draftInterdisciplinaryProject.mutate(situation.id, {
                    onSuccess: (project) => project?.id && navigate(`/interdisciplinary-projects/${project.id}`),
                  })
                }
                loading={draftInterdisciplinaryProject.isPending}
              >
                <Sparkles className="h-4 w-4" />
                Generar proyecto interdisciplinario en automático
              </Button>
            )}
            <Button variant="outline" onClick={() => reopenSituation.mutate()} loading={reopenSituation.isPending}>
              <RotateCcw className="h-4 w-4" />
              Volver a borrador
            </Button>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Semanas</h2>
          {isEditable && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  createWeek.mutate(
                    { situationId: id!, weekNumber: nextWeekNumber },
                    { onSuccess: (week) => setExpandedWeek(week.id) },
                  )
                }
                loading={createWeek.isPending}
              >
                <Plus className="h-4 w-4" />
                Agregar semana suelta
              </Button>
            </div>
          )}
        </div>

        {isEditable && (
          <GenerateBlockPanel
            situationId={id!}
            subjectId={subjectId}
            subnivel={subnivel}
            situationCompetencyIds={situation.competencyIds}
          />
        )}

        {weeks.length === 0 ? (
          <EmptyState icon={NotebookPen} title="Sin semanas" description="Agrega la primera semana de esta situación de aprendizaje." />
        ) : (
          <div className="space-y-2">
            {weeks.map((week) => (
              <WeekCard
                key={week.id}
                week={week}
                situationId={id!}
                subjectId={subjectId}
                subnivel={subnivel}
                isEditable={isEditable}
                expanded={expandedWeek === week.id}
                onToggle={() => setExpandedWeek((prev) => (prev === week.id ? null : week.id))}
              />
            ))}
          </div>
        )}
      </div>

      <PdfPreviewModal
        open={pdfPreviewOpen}
        onOpenChange={setPdfPreviewOpen}
        title={situation.title}
        fetchPdf={() => apiClient.get(`planning/situations/${situation.id}/pdf`).blob()}
      />
    </div>
  )
}
