import * as React from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Sparkles } from 'lucide-react'
import { Card } from '@/shared/components/ui/card'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  listReinforcementCases,
  createReinforcementCase,
  editReinforcementProposal,
  confirmReinforcementPlan,
  startReinforcement,
  addReinforcementCommunication,
  addReinforcementCommitment,
  addReinforcementFollowUp,
  reevaluateReinforcementCase,
  confirmReinforcementOutcome,
  createNextReinforcementCycle,
  openReinforcementCasePdf,
  DETECTION_SOURCES,
  PEDAGOGICAL_NEEDS,
  COMMUNICATION_MEDIA,
  COMMITMENT_TYPES,
  type ReinforcementCase,
  type ReinforcementCaseStatus,
} from '../api/pedagogic-recovery.api'
import type { SkillReinforcementCandidate, SkillReinforcementStudent } from '../api/pedagogic-recovery.api'

const STATUS_LABEL: Record<ReinforcementCaseStatus, { label: string; variant: 'success' | 'warning' | 'secondary' | 'destructive' }> = {
  DETECTED: { label: 'Detectado', variant: 'secondary' },
  PLANNED: { label: 'Planificado', variant: 'warning' },
  IN_REINFORCEMENT: { label: 'En refuerzo', variant: 'warning' },
  EVALUATED: { label: 'Evaluado', variant: 'warning' },
  CLOSED: { label: 'Cerrado', variant: 'success' },
  CONTINUES_REINFORCEMENT: { label: 'Continúa en refuerzo', variant: 'destructive' },
}

const PHASE_LABEL: Record<string, string> = {
  RECOVERY_EXPLORATION: 'Activación y exploración focal',
  MODELING: 'Modelado del procedimiento',
  GUIDED_PRACTICE: 'Práctica guiada con retroalimentación',
  APPLICATION: 'Aplicación contextualizada',
  TRANSFER: 'Transferencia a otra situación',
  CHECK_REEVALUATION: 'Comprobación del aprendizaje focal',
}

interface Props {
  courseAssignmentId: string
  academicPeriodId: string
}

/**
 * Flujo completo de refuerzo pedagógico (motor TIGA) sobre los candidatos ya
 * detectados por SkillReinforcementPanel (notas bajas vinculadas a una
 * destreza/competencia). Wizard por estado: crear caso → confirmar plan →
 * iniciar refuerzo → comunicaciones/compromisos/seguimientos → reevaluar →
 * cerrar o continuar en un nuevo ciclo.
 */
export function ReinforcementCaseWizard({ courseAssignmentId, academicPeriodId }: Props) {
  const qc = useQueryClient()
  const [expandedId, setExpandedId] = React.useState<string | null>(null)

  const { data: cases = [] } = useQuery({
    queryKey: ['reinforcement-cases', courseAssignmentId, academicPeriodId],
    queryFn: () => listReinforcementCases({ courseAssignmentId, academicPeriodId }),
    enabled: !!courseAssignmentId && !!academicPeriodId,
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['reinforcement-cases', courseAssignmentId, academicPeriodId] })

  if (cases.length === 0) return null

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Casos de refuerzo pedagógico (flujo completo)</h3>
      </div>
      <div className="space-y-2">
        {cases.map((c) => (
          <CaseRow
            key={c.id}
            kase={c}
            expanded={expandedId === c.id}
            onToggle={() => setExpandedId((v) => (v === c.id ? null : c.id))}
            onChanged={invalidate}
          />
        ))}
      </div>
    </Card>
  )
}

function studentName(p: { profile: { firstName: string; lastName: string } | null } | null | undefined): string {
  return p?.profile ? `${p.profile.firstName} ${p.profile.lastName}` : ''
}

function CaseRow({
  kase,
  expanded,
  onToggle,
  onChanged,
}: {
  kase: ReinforcementCase
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const status = STATUS_LABEL[kase.caseStatus]
  return (
    <div className="rounded border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40"
      >
        <span className="flex-1 font-medium">
          {studentName(kase.student) || kase.participants.map((p) => studentName(p.student)).join(', ')}
        </span>
        <span className="text-xs text-muted-foreground">Ciclo {kase.cycleNumber}</span>
        <Badge variant={status.variant}>{status.label}</Badge>
      </button>

      {expanded && (
        <div className="space-y-4 border-t p-3">
          <DetectionSummary kase={kase} />
          <ProposalSection kase={kase} onChanged={onChanged} />
          {kase.units.length > 0 && <TemporalPlanSection kase={kase} />}
          {kase.caseStatus !== 'DETECTED' && <CommunicationsSection kase={kase} onChanged={onChanged} />}
          {kase.caseStatus !== 'DETECTED' && <CommitmentsSection kase={kase} onChanged={onChanged} />}
          {(kase.caseStatus === 'IN_REINFORCEMENT' || kase.followUps.length > 0) && (
            <FollowUpSection kase={kase} onChanged={onChanged} />
          )}
          {kase.reevaluations.length > 0 && <ReevaluationsSection kase={kase} />}
          <ActionsBar kase={kase} onChanged={onChanged} />
        </div>
      )}
    </div>
  )
}

function DetectionSummary({ kase }: { kase: ReinforcementCase }) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50/50 p-2 text-xs">
      <p>
        <span className="font-semibold">Detección:</span>{' '}
        {kase.detectionSourceCode ? DETECTION_SOURCES[kase.detectionSourceCode] : ''} — {kase.detectionObservation}
      </p>
      <p>
        <span className="font-semibold">Necesidad(es):</span>{' '}
        {kase.needCodes.map((c) => PEDAGOGICAL_NEEDS[c] ?? c).join(', ')}
      </p>
      <p>
        <span className="font-semibold">Aprendizaje a reforzar:</span> {kase.learningTargetDescription}
      </p>
    </div>
  )
}

function ProposalSection({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const [fields, setFields] = React.useState({
    learningToReinforce: kase.proposalLearningToReinforce ?? '',
    objective: kase.proposalObjective ?? '',
    activeStrategy: kase.proposalActiveStrategy ?? '',
    concreteActivity: kase.proposalConcreteActivity ?? '',
    resource: kase.proposalResource ?? '',
    evidence: kase.proposalEvidence ?? '',
    evaluation: kase.proposalEvaluation ?? '',
    durationFrequency: kase.proposalDurationFrequency ?? '',
    expectedResult: kase.proposalExpectedResult ?? '',
  })
  const editable = kase.caseStatus === 'DETECTED'

  const edit = useMutation({
    mutationFn: () => editReinforcementProposal(kase.id, fields),
    onSuccess: () => {
      onChanged()
      toast.success('Propuesta actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  const rows: [keyof typeof fields, string][] = [
    ['learningToReinforce', 'Aprendizaje a reforzar'],
    ['objective', 'Objetivo'],
    ['activeStrategy', 'Estrategia activa'],
    ['concreteActivity', 'Actividad concreta'],
    ['resource', 'Recurso'],
    ['evidence', 'Evidencia'],
    ['evaluation', 'Evaluación'],
    ['durationFrequency', 'Duración/frecuencia'],
    ['expectedResult', 'Resultado esperado'],
  ]

  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">Propuesta de refuerzo (editable hasta confirmar el plan)</p>
      {rows.map(([key, label]) => (
        <div key={key} className="space-y-1">
          <Label className="text-xs">{label}</Label>
          <textarea
            rows={key === 'concreteActivity' || key === 'learningToReinforce' ? 2 : 1}
            value={fields[key]}
            disabled={!editable}
            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
            className="flex w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none disabled:opacity-70"
          />
        </div>
      ))}
      {editable && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" loading={edit.isPending} onClick={() => edit.mutate()}>
            Guardar propuesta
          </Button>
        </div>
      )}
    </div>
  )
}

function TemporalPlanSection({ kase }: { kase: ReinforcementCase }) {
  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">
        Plan temporal — {kase.units.length} semana{kase.units.length === 1 ? '' : 's'} (motor determinista, 6 fases)
      </p>
      <div className="max-h-64 space-y-1.5 overflow-y-auto">
        {kase.units.map((u) => (
          <div key={u.id} className="rounded border bg-muted/20 p-2 text-xs">
            <p className="font-medium">
              Semana {u.temporalIndex} · {PHASE_LABEL[u.phase] ?? u.phase}
            </p>
            <p>
              <span className="font-semibold">Objetivo:</span> {u.specificObjective}
            </p>
            <p>
              <span className="font-semibold">Actividad:</span> {u.concreteActivity}
            </p>
            <p>
              <span className="font-semibold">Evidencia:</span> {u.observableEvidence}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function CommunicationsSection({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const [mediumCode, setMediumCode] = React.useState('MEETING')
  const [text, setText] = React.useState('')
  const add = useMutation({
    mutationFn: () => addReinforcementCommunication(kase.id, { mediumCode, text: text.trim() || undefined }),
    onSuccess: () => {
      onChanged()
      setText('')
      toast.success('Comunicación registrada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">Comunicaciones con el representante</p>
      {kase.communications.map((c) => (
        <div key={c.id} className="rounded bg-muted/20 p-1.5 text-xs">
          <span className="font-medium">{c.mediumLabel}</span> → {c.recipient}: {c.institutionalText}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={mediumCode} onValueChange={setMediumCode}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMMUNICATION_MEDIA).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Texto (opcional — se sugiere uno si se deja vacío)"
          className="h-8 flex-1 text-xs"
        />
        <Button size="sm" loading={add.isPending} onClick={() => add.mutate()}>
          Registrar
        </Button>
      </div>
    </div>
  )
}

function CommitmentsSection({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const [commitmentCode, setCommitmentCode] = React.useState('HOME_PRACTICE')
  const [note, setNote] = React.useState('')
  const add = useMutation({
    mutationFn: () => addReinforcementCommitment(kase.id, { commitmentCode, note: note.trim() || undefined }),
    onSuccess: () => {
      onChanged()
      setNote('')
      toast.success('Compromiso registrado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">Compromisos acordados</p>
      {kase.commitments.map((c) => (
        <div key={c.id} className="rounded bg-muted/20 p-1.5 text-xs">
          <span className="font-medium">{c.commitmentLabel}</span> — {c.responsible} {c.note ? `(${c.note})` : ''}
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <Select value={commitmentCode} onValueChange={setCommitmentCode}>
          <SelectTrigger className="h-8 w-48 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMMITMENT_TYPES).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="h-8 flex-1 text-xs" />
        <Button size="sm" loading={add.isPending} onClick={() => add.mutate()}>
          Registrar
        </Button>
      </div>
    </div>
  )
}

function FollowUpSection({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const [strategyApplied, setStrategyApplied] = React.useState('')
  const [evidence, setEvidence] = React.useState('')
  const [observation, setObservation] = React.useState('')
  const canAdd = kase.caseStatus === 'IN_REINFORCEMENT'
  const add = useMutation({
    mutationFn: () => addReinforcementFollowUp(kase.id, { strategyApplied, evidence, observation }),
    onSuccess: () => {
      onChanged()
      setStrategyApplied('')
      setEvidence('')
      setObservation('')
      toast.success('Seguimiento registrado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">Seguimientos</p>
      {kase.followUps.map((f) => (
        <div key={f.id} className="rounded bg-muted/20 p-1.5 text-xs">
          <span className="font-medium">{f.strategyApplied}</span> — {f.evidence} — {f.observation}
        </div>
      ))}
      {canAdd && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={strategyApplied} onChange={(e) => setStrategyApplied(e.target.value)} placeholder="Estrategia aplicada" className="h-8 text-xs" />
          <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidencia" className="h-8 text-xs" />
          <Input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Observación" className="h-8 text-xs" />
          <div className="sm:col-span-3 flex justify-end">
            <Button
              size="sm"
              loading={add.isPending}
              disabled={!strategyApplied.trim() || !evidence.trim() || !observation.trim()}
              onClick={() => add.mutate()}
            >
              Registrar seguimiento
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReevaluationsSection({ kase }: { kase: ReinforcementCase }) {
  return (
    <div className="space-y-2 rounded border p-2">
      <p className="text-xs font-semibold text-muted-foreground">Reevaluaciones</p>
      {kase.reevaluations.map((r) => (
        <div key={r.id} className="rounded bg-muted/20 p-1.5 text-xs">
          <p className="font-medium">{r.evaluation}</p>
          <p>Decisión: {r.pedagogicalDecision}</p>
          {r.outcomes.map((o) => (
            <p key={o.id}>
              {studentName(o.student)}: {o.result === 'CONSOLIDATED' ? 'Consolidado' : 'No consolidado'}
            </p>
          ))}
        </div>
      ))}
    </div>
  )
}

function ActionsBar({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const confirmPlan = useMutation({
    mutationFn: () => confirmReinforcementPlan(kase.id),
    onSuccess: () => {
      onChanged()
      toast.success('Plan confirmado — se generó el plan temporal')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
  const start = useMutation({
    mutationFn: () => startReinforcement(kase.id),
    onSuccess: () => {
      onChanged()
      toast.success('Refuerzo iniciado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
  const nextCycle = useMutation({
    mutationFn: () => createNextReinforcementCycle(kase.id),
    onSuccess: () => {
      onChanged()
      toast.success('Nuevo ciclo creado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2">
        {kase.caseStatus === 'DETECTED' && (
          <Button size="sm" loading={confirmPlan.isPending} onClick={() => confirmPlan.mutate()}>
            Confirmar plan
          </Button>
        )}
        {kase.caseStatus === 'PLANNED' && (
          <Button size="sm" loading={start.isPending} onClick={() => start.mutate()}>
            Iniciar refuerzo
          </Button>
        )}
        {kase.caseStatus === 'IN_REINFORCEMENT' && <ReevaluateButton kase={kase} onChanged={onChanged} />}
        {kase.caseStatus === 'EVALUATED' && <ConfirmOutcomeButtons kase={kase} onChanged={onChanged} />}
        {kase.caseStatus === 'CONTINUES_REINFORCEMENT' && (
          <Button size="sm" loading={nextCycle.isPending} onClick={() => nextCycle.mutate()}>
            Crear siguiente ciclo
          </Button>
        )}
      </div>
      <Button variant="outline" size="sm" onClick={() => openReinforcementCasePdf(kase.id)}>
        <Download className="h-4 w-4" />
        PDF
      </Button>
    </div>
  )
}

function ReevaluateButton({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false)
  const [evaluation, setEvaluation] = React.useState('')
  const [results, setResults] = React.useState<Record<string, 'CONSOLIDATED' | 'NOT_CONSOLIDATED'>>({})

  const participants = kase.participants.length ? kase.participants : [{ id: kase.studentId, studentId: kase.studentId, student: kase.student }]

  const reevaluate = useMutation({
    mutationFn: () =>
      reevaluateReinforcementCase(kase.id, {
        evaluation,
        outcomes: participants.map((p) => ({ studentId: p.studentId, result: results[p.studentId] ?? 'CONSOLIDATED' })),
      }),
    onSuccess: () => {
      onChanged()
      setOpen(false)
      toast.success('Reevaluación registrada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Reevaluar
      </Button>
    )
  }

  return (
    <div className="w-full space-y-2 rounded border bg-muted/20 p-2">
      <Input value={evaluation} onChange={(e) => setEvaluation(e.target.value)} placeholder="Descripción de la evaluación aplicada" className="h-8 text-xs" />
      {participants.map((p) => (
        <div key={p.studentId} className="flex items-center justify-between gap-2 text-xs">
          <span>{studentName(p.student)}</span>
          <Select
            value={results[p.studentId] ?? 'CONSOLIDATED'}
            onValueChange={(v) => setResults((r) => ({ ...r, [p.studentId]: v as 'CONSOLIDATED' | 'NOT_CONSOLIDATED' }))}
          >
            <SelectTrigger className="h-7 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="CONSOLIDATED">Consolidado</SelectItem>
              <SelectItem value="NOT_CONSOLIDATED">No consolidado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button size="sm" loading={reevaluate.isPending} disabled={!evaluation.trim()} onClick={() => reevaluate.mutate()}>
          Guardar reevaluación
        </Button>
      </div>
    </div>
  )
}

function ConfirmOutcomeButtons({ kase, onChanged }: { kase: ReinforcementCase; onChanged: () => void }) {
  const latest = kase.reevaluations[kase.reevaluations.length - 1]
  const allConsolidated = latest?.outcomes.every((o) => o.result === 'CONSOLIDATED') ?? false

  const confirm = useMutation({
    mutationFn: (close: boolean) => confirmReinforcementOutcome(kase.id, close),
    onSuccess: () => {
      onChanged()
      toast.success('Resultado confirmado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  return (
    <div className="flex gap-2">
      {allConsolidated && (
        <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(true)}>
          Cerrar caso
        </Button>
      )}
      <Button size="sm" variant="outline" loading={confirm.isPending} onClick={() => confirm.mutate(false)}>
        Continúa en refuerzo
      </Button>
    </div>
  )
}

/**
 * Botón de creación de caso desde un candidato detectado automáticamente
 * (SkillReinforcementPanel) — arma la propuesta inicial vía NEED_PROPOSALS en
 * el backend. El docente eligió necesidad(es), fuente de detección y duración.
 */
export function CreateReinforcementCaseButton({
  courseAssignmentId,
  academicPeriodId,
  candidate,
  student,
  hasCase,
}: {
  courseAssignmentId: string
  academicPeriodId: string
  candidate: SkillReinforcementCandidate
  student: SkillReinforcementStudent
  hasCase: boolean
}) {
  const qc = useQueryClient()
  const [open, setOpen] = React.useState(false)
  const [needCode, setNeedCode] = React.useState('UNDERSTANDING')
  const [durationWeeks, setDurationWeeks] = React.useState(4)

  const create = useMutation({
    mutationFn: () =>
      createReinforcementCase({
        studentIds: [student.studentId],
        courseAssignmentId,
        academicPeriodId,
        learningTarget: {
          title: candidate.skillCode,
          description: candidate.skillDescription,
          evidence: '',
        },
        curriculumSkillId: candidate.curriculumSkillId,
        competencyId: candidate.competencyId,
        detectionSourceCode: 'NOT_CONSOLIDATED',
        detectionObservation: `Promedio ${student.average.toFixed(2)} bajo el umbral de aprobación (${candidate.passingGrade}) en actividades vinculadas a ${candidate.skillCode}.`,
        detectionInitialResult: student.average.toFixed(2),
        needCodes: [needCode],
        reinforcementDurationWeeks: durationWeeks,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reinforcement-cases', courseAssignmentId, academicPeriodId] })
      setOpen(false)
      toast.success('Caso de refuerzo creado — ábrelo abajo para confirmar el plan')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  if (hasCase) {
    return (
      <Badge variant="success" className="ml-1">
        Caso creado
      </Badge>
    )
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="h-5 px-1.5" onClick={() => setOpen(true)}>
        <Sparkles className="h-3 w-3" />
      </Button>
    )
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded border bg-white p-2 text-xs">
      <div className="space-y-1">
        <Label className="text-xs">Necesidad pedagógica</Label>
        <Select value={needCode} onValueChange={setNeedCode}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PEDAGOGICAL_NEEDS).map(([code, label]) => (
              <SelectItem key={code} value={code}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Duración (semanas)</Label>
        <Input
          type="number"
          min={1}
          max={16}
          value={durationWeeks}
          onChange={(e) => setDurationWeeks(Number(e.target.value) || 1)}
          className="h-7 text-xs"
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
        <Button size="sm" loading={create.isPending} onClick={() => create.mutate()}>
          Crear caso completo
        </Button>
      </div>
    </div>
  )
}
