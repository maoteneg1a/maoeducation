import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Send, CheckCircle2, Puzzle, Download, Plus, Sparkles } from 'lucide-react'
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
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useCourseAssignments } from '@/features/academic/hooks/useAcademic'
import { useAiEnabled, useDraftProject } from '@/features/ai-assistant/hooks/useAiAssistant'
import { ContributionCard } from '../components/ContributionCard'
import { useProject, useUpdateProject, useJoinProject } from '../hooks/useInterdisciplinaryProjects'
import { interdisciplinaryProjectApi, type InterdisciplinaryProjectStatus } from '../api/interdisciplinary-project.api'

const STATUS_LABEL: Record<InterdisciplinaryProjectStatus, { label: string; variant: 'success' | 'warning' | 'secondary' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  enviado: { label: 'Enviado — pendiente de aprobación', variant: 'warning' },
  aprobado: { label: 'Aprobado', variant: 'success' },
}

export function InterdisciplinaryProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { hasPermission } = usePermissions()
  const canApprove = hasPermission('planning:manage')

  const qc = useQueryClient()
  const { data: project, isLoading } = useProject(id)
  const updateProject = useUpdateProject(id!)
  const joinProject = useJoinProject(id!)
  const draftProject = useDraftProject()
  const aiEnabled = useAiEnabled()

  const { data: allAssignments = [] } = useCourseAssignments()

  const [title, setTitle] = React.useState('')
  const [situacionReto, setSituacionReto] = React.useState('')
  const [contexto, setContexto] = React.useState('')
  const [propositoComun, setPropositoComun] = React.useState('')
  const [productoFinal, setProductoFinal] = React.useState('')
  const [expandedContribution, setExpandedContribution] = React.useState<string | null>(null)
  const [joinAssignmentId, setJoinAssignmentId] = React.useState('')
  const [aiPrompt, setAiPrompt] = React.useState('')

  React.useEffect(() => {
    if (project) {
      setTitle(project.title)
      setSituacionReto(project.situacionReto ?? '')
      setContexto(project.contexto ?? '')
      setPropositoComun(project.propositoComun ?? '')
      setProductoFinal(project.productoFinal ?? '')
    }
  }, [project?.id])

  const handleGenerateProjectWithAi = () => {
    if (!id) return
    draftProject.mutate(
      { projectId: id, prompt: aiPrompt || undefined },
      {
        onSuccess: (result) => {
          setSituacionReto(result.situacionReto)
          setContexto(result.contexto)
          setPropositoComun(result.propositoComun)
          setProductoFinal(result.productoFinal)
          qc.invalidateQueries({ queryKey: ['interdisciplinary-project', id] })
        },
      },
    )
  }

  if (isLoading) return <PageLoader />
  if (!project) return <EmptyState icon={Puzzle} title="Proyecto no encontrado" />

  const isEditable = project.status === 'borrador'
  const joinedAssignmentIds = new Set((project.contributions ?? []).map((c) => c.courseAssignmentId))
  const availableToJoin = allAssignments.filter(
    (a) => a.parallelId === project.parallelId && !joinedAssignmentIds.has(a.id),
  )

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/interdisciplinary-projects" className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Proyectos Interdisciplinarios
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_LABEL[project.status].variant}>{STATUS_LABEL[project.status].label}</Badge>
          <Button variant="outline" size="sm" onClick={() => interdisciplinaryProjectApi.openProjectPdf(project.id)}>
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      {isEditable && aiEnabled && (project.contributions?.length ?? 0) >= 2 && (
        <Card className="space-y-3 border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            Generar todo el proyecto con IA
          </div>
          <p className="text-xs text-muted-foreground">
            Con el título ya alcanza. Si quieres, agrega una idea breve — la IA completa el reto, contexto,
            propósito, producto final, y el aporte + destrezas + todas las semanas de cada asignatura ya unida.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder={`Ej: ${title || 'idea breve del proyecto (opcional)'}`}
              className="flex-1"
            />
            <Button onClick={handleGenerateProjectWithAi} loading={draftProject.isPending}>
              <Sparkles className="h-4 w-4" />
              Generar todo con IA
            </Button>
          </div>
        </Card>
      )}

      <Card className="space-y-4 p-4 sm:p-6">
        <div className="space-y-1.5">
          <Label>Título</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} disabled={!isEditable} />
        </div>
        <div className="space-y-1.5">
          <Label>Situación / reto</Label>
          <textarea
            rows={2}
            value={situacionReto}
            onChange={(e) => setSituacionReto(e.target.value)}
            disabled={!isEditable}
            placeholder="Ej: ¿Qué solución sustentada podemos construir al relacionar...?"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Contexto</Label>
          <textarea
            rows={2}
            value={contexto}
            onChange={(e) => setContexto(e.target.value)}
            disabled={!isEditable}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Propósito interdisciplinario</Label>
          <textarea
            rows={2}
            value={propositoComun}
            onChange={(e) => setPropositoComun(e.target.value)}
            disabled={!isEditable}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Producto final</Label>
          <textarea
            rows={2}
            value={productoFinal}
            onChange={(e) => setProductoFinal(e.target.value)}
            disabled={!isEditable}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
          />
        </div>

        {isEditable && (
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              variant="outline"
              onClick={() => updateProject.mutate({ title, situacionReto, contexto, propositoComun, productoFinal })}
              loading={updateProject.isPending}
            >
              Guardar borrador
            </Button>
            <Button
              onClick={() => updateProject.mutate({ status: 'enviado' })}
              loading={updateProject.isPending}
              disabled={(project.contributions?.length ?? 0) < 2}
            >
              <Send className="h-4 w-4" />
              Enviar para aprobación
            </Button>
          </div>
        )}
        {project.status === 'enviado' && canApprove && (
          <div className="flex justify-end border-t pt-4">
            <Button onClick={() => updateProject.mutate({ status: 'aprobado' })} loading={updateProject.isPending}>
              <CheckCircle2 className="h-4 w-4" />
              Aprobar proyecto
            </Button>
          </div>
        )}
        {isEditable && (project.contributions?.length ?? 0) < 2 && (
          <p className="text-xs text-amber-600">Se necesitan al menos 2 asignaturas participantes para enviar el proyecto.</p>
        )}
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Asignaturas participantes</h2>
        </div>

        {isEditable && availableToJoin.length > 0 && (
          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label>Unirme con mi asignación</Label>
              <Select value={joinAssignmentId} onValueChange={setJoinAssignmentId}>
                <SelectTrigger><SelectValue placeholder="Selecciona tu asignación" /></SelectTrigger>
                <SelectContent>
                  {availableToJoin.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.subject?.name ?? a.subjectName} — {a.teacher?.profile ? `${a.teacher.profile.firstName} ${a.teacher.profile.lastName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => joinProject.mutate(joinAssignmentId, { onSuccess: () => setJoinAssignmentId('') })}
              disabled={!joinAssignmentId}
              loading={joinProject.isPending}
            >
              <Plus className="h-4 w-4" />
              Unirme
            </Button>
          </Card>
        )}

        {(project.contributions?.length ?? 0) === 0 ? (
          <EmptyState icon={Puzzle} title="Sin asignaturas participantes" description="Únete con tu asignación para empezar a aportar." />
        ) : (
          <div className="space-y-2">
            {project.contributions?.map((contribution) => (
              <ContributionCard
                key={contribution.id}
                contribution={contribution}
                projectId={project.id}
                subnivel={project.parallel?.level.subnivel ?? undefined}
                weeksCount={project.weeksCount}
                isEditable={isEditable}
                expanded={expandedContribution === contribution.id}
                onToggle={() => setExpandedContribution((prev) => (prev === contribution.id ? null : contribution.id))}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
