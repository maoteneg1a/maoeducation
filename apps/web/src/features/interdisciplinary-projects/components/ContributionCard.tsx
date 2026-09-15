import * as React from 'react'
import { ChevronDown, ChevronRight, Save, Trash2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Label } from '@/shared/components/ui/label'
import { SkillAndSaberSelector } from '@/features/planning/components/SkillAndSaberSelector'
import { useUpdateContribution, useRemoveContribution, useUpsertWeekEntry } from '../hooks/useInterdisciplinaryProjects'
import type { Contribution, WeekEntry } from '../api/interdisciplinary-project.api'

interface ContributionCardProps {
  contribution: Contribution
  projectId: string
  academicPeriodId: string
  subnivel: string | undefined
  weeksCount: number
  isEditable: boolean
  expanded: boolean
  onToggle: () => void
}

export function ContributionCard({ contribution, projectId, academicPeriodId, subnivel, weeksCount, isEditable, expanded, onToggle }: ContributionCardProps) {
  const updateContribution = useUpdateContribution(contribution.id, projectId)
  const removeContribution = useRemoveContribution(projectId)

  const [contribucion, setContribucion] = React.useState(contribution.contribucion ?? '')
  const [responsabilidad, setResponsabilidad] = React.useState(contribution.responsabilidad ?? '')
  const [skillIds, setSkillIds] = React.useState<string[]>(contribution.skillIds)
  const [saberIds, setSaberIds] = React.useState<string[]>(contribution.saberIds)

  const teacherName = contribution.courseAssignment?.teacher.profile
    ? `${contribution.courseAssignment.teacher.profile.firstName} ${contribution.courseAssignment.teacher.profile.lastName}`
    : ''

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/30">
        {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
        <span className="flex-1 font-medium">{contribution.courseAssignment?.subject.name}</span>
        <span className="text-xs text-muted-foreground">{teacherName}</span>
      </button>

      {expanded && (
        <div className="space-y-4 border-t px-4 py-4">
          <div className="space-y-1.5">
            <Label>Contribución</Label>
            <textarea
              rows={2}
              value={contribucion}
              onChange={(e) => setContribucion(e.target.value)}
              disabled={!isEditable}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsabilidad</Label>
            <textarea
              rows={2}
              value={responsabilidad}
              onChange={(e) => setResponsabilidad(e.target.value)}
              disabled={!isEditable}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
            />
          </div>

          <SkillAndSaberSelector
            subjectId={contribution.courseAssignment?.subject.id}
            subnivel={subnivel}
            skillIds={skillIds}
            saberIds={saberIds}
            onSkillIdsChange={setSkillIds}
            onSaberIdsChange={setSaberIds}
            isEditable={isEditable}
            courseAssignmentId={contribution.courseAssignmentId}
            academicPeriodId={academicPeriodId}
          />

          {isEditable && (
            <div className="flex justify-between border-t pt-3">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => confirm('¿Salir de este proyecto?') && removeContribution.mutate(contribution.id)}
                loading={removeContribution.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Salir del proyecto
              </Button>
              <Button
                onClick={() => updateContribution.mutate({ contribucion, responsabilidad, skillIds, saberIds })}
                loading={updateContribution.isPending}
              >
                <Save className="h-4 w-4" />
                Guardar aporte
              </Button>
            </div>
          )}

          <div className="space-y-2 border-t pt-3">
            <Label>Integración por semanas</Label>
            <div className="space-y-2">
              {Array.from({ length: weeksCount }, (_, i) => i + 1).map((weekNumber) => (
                <WeekEntryRow
                  key={weekNumber}
                  contributionId={contribution.id}
                  projectId={projectId}
                  weekNumber={weekNumber}
                  entry={contribution.weekEntries?.find((w) => w.weekNumber === weekNumber)}
                  isEditable={isEditable}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  )
}

function WeekEntryRow({
  contributionId,
  projectId,
  weekNumber,
  entry,
  isEditable,
}: {
  contributionId: string
  projectId: string
  weekNumber: number
  entry: WeekEntry | undefined
  isEditable: boolean
}) {
  const [expanded, setExpanded] = React.useState(false)
  const upsertWeek = useUpsertWeekEntry(contributionId, projectId)

  const [weekProposito, setWeekProposito] = React.useState(entry?.weekProposito ?? '')
  const [faseInicio, setFaseInicio] = React.useState(entry?.faseInicio ?? '')
  const [faseDesarrollo, setFaseDesarrollo] = React.useState(entry?.faseDesarrollo ?? '')
  const [faseCierre, setFaseCierre] = React.useState(entry?.faseCierre ?? '')
  const [propositoPedagogico, setPropositoPedagogico] = React.useState(entry?.propositoPedagogico ?? '')
  const [evidencias, setEvidencias] = React.useState(entry?.evidencias ?? '')

  const hasContent = !!(entry?.faseInicio || entry?.faseDesarrollo || entry?.faseCierre)

  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted/40"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="flex-1">Semana {weekNumber}</span>
        {hasContent && <span className="text-xs text-muted-foreground">completada</span>}
      </button>
      {expanded && (
        <div className="space-y-2 border-t p-3 text-sm">
          <FieldRow label="Propósito de la semana" value={weekProposito} onChange={setWeekProposito} disabled={!isEditable} />
          <FieldRow label="Inicio" value={faseInicio} onChange={setFaseInicio} disabled={!isEditable} />
          <FieldRow label="Desarrollo" value={faseDesarrollo} onChange={setFaseDesarrollo} disabled={!isEditable} />
          <FieldRow label="Cierre" value={faseCierre} onChange={setFaseCierre} disabled={!isEditable} />
          <FieldRow label="Propósito pedagógico" value={propositoPedagogico} onChange={setPropositoPedagogico} disabled={!isEditable} />
          <FieldRow label="Evidencias" value={evidencias} onChange={setEvidencias} disabled={!isEditable} />
          {isEditable && (
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={() =>
                  upsertWeek.mutate({ weekNumber, weekProposito, faseInicio, faseDesarrollo, faseCierre, propositoPedagogico, evidencias })
                }
                loading={upsertWeek.isPending}
              >
                Guardar semana
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FieldRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <textarea
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-60"
      />
    </div>
  )
}
