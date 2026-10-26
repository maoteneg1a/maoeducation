import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import type { LegacyCase } from '../api/reinforcement-desk.api'

const fmt = (d: string | null | undefined) => (d ? d.slice(0, 10) : '—')
const DECISION_LABEL: Record<string, string> = {
  LEARNING_ACHIEVED: 'Aprendizaje logrado',
  CONTINUE_REINFORCEMENT: 'Continuar refuerzo',
  MODIFY_STRATEGY_OR_SUPPORT: 'Modificar estrategia o apoyo',
  INSTITUTIONAL_FOLLOW_UP: 'Seguimiento institucional',
}
const OUTCOME_LABEL: Record<string, string> = { CONSOLIDATED: 'Consolidado', NOT_CONSOLIDATED: 'No consolidado' }

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{value?.trim() || '—'}</p>
    </div>
  )
}

/** Vista de solo lectura del caso (sin destrezas). Las transiciones se gestionan en la pestaña Plan y seguimiento. */
export function CaseSummaryTab({ kase }: { kase: LegacyCase }) {
  return (
    <div className="space-y-4">


      <Card>
        <CardHeader><CardTitle className="text-base">Detección</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha" value={fmt(kase.detectedOn)} />
          <Field label="Resultado inicial" value={kase.detectionInitialResult} />
          <Field label="Observación" value={kase.detectionObservation} />
          <Field label="Origen de la evidencia" value={kase.detectionEvidenceOrigin} />
          <Field label="Aprendizaje a reforzar" value={kase.learningTargetTitle} />
          <Field label="Descripción" value={kase.learningTargetDescription} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Propuesta de refuerzo</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Objetivo" value={kase.proposalObjective} />
          <Field label="Estrategia activa" value={kase.proposalActiveStrategy} />
          <Field label="Actividad concreta" value={kase.proposalConcreteActivity} />
          <Field label="Recursos" value={kase.proposalResource} />
          <Field label="Evidencia" value={kase.proposalEvidence} />
          <Field label="Evaluación" value={kase.proposalEvaluation} />
          <Field label="Duración / frecuencia" value={kase.proposalDurationFrequency} />
          <Field label="Resultado esperado" value={kase.proposalExpectedResult} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Comunicaciones con el representante</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {kase.communications.length === 0 ? <p className="text-sm text-muted-foreground">Sin comunicaciones registradas.</p> : kase.communications.map((c) => (
            <div key={c.id} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">{fmt(c.date)} · {c.mediumLabel} · {c.recipient}</p>
              <p className="mt-1 whitespace-pre-wrap">{c.institutionalText}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Compromisos</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {kase.commitments.length === 0 ? <p className="text-sm text-muted-foreground">Sin compromisos registrados.</p> : kase.commitments.map((c) => (
            <div key={c.id} className="text-sm">
              <span className="font-medium">{c.commitmentLabel}</span> — {c.responsible}
              {c.targetDate ? ` (hasta ${fmt(c.targetDate)})` : ''}
              {c.note ? <p className="text-xs text-muted-foreground">{c.note}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Seguimientos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {kase.followUps.length === 0 ? <p className="text-sm text-muted-foreground">Sin seguimientos.</p> : kase.followUps.map((f) => (
            <div key={f.id} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">{fmt(f.date)}</p>
              <p><span className="font-medium">Estrategia:</span> {f.strategyApplied}</p>
              <p><span className="font-medium">Evidencia:</span> {f.evidence}</p>
              <p><span className="font-medium">Observación:</span> {f.observation}</p>
              {f.observedProgress && <p><span className="font-medium">Progreso:</span> {f.observedProgress}</p>}
              {f.nextAction && <p><span className="font-medium">Siguiente acción:</span> {f.nextAction}</p>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Reevaluaciones</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {kase.reevaluations.length === 0 ? <p className="text-sm text-muted-foreground">Sin reevaluaciones.</p> : kase.reevaluations.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm">
              <p className="text-xs text-muted-foreground">{fmt(r.date)}</p>
              <p>{r.evaluation}</p>
              <p className="text-xs">Inicial: {r.initialResult ?? '—'} → Posterior: {r.subsequentResult ?? '—'}</p>
              {r.pedagogicalDecision && <p className="text-xs font-medium">Decisión: {DECISION_LABEL[r.pedagogicalDecision] ?? r.pedagogicalDecision}</p>}
              {r.outcomes.length > 0 && (
                <ul className="mt-1 text-xs">
                  {r.outcomes.map((o) => (
                    <li key={o.id}>
                      {o.student.profile ? `${o.student.profile.firstName} ${o.student.profile.lastName}` : o.studentId}: {OUTCOME_LABEL[o.result] ?? o.result}
                      {o.assessmentValue ? ` (${o.assessmentValue})` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
