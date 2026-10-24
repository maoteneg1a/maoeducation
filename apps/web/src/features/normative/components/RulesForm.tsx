import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, RotateCcw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import {
  SUBNIVEL_LABEL,
  normativeApi,
  type AgreementRules,
  type ImprovementRule,
  type NormativeProfileResponse,
  type SubnivelCode,
} from '../api/normative.api'
import { CheckField, CheckGroup, FieldGrid, ListEditor, NumField, SelectField } from './form-bits'

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  )
}

export function RulesForm({ data }: { data: NormativeProfileResponse }) {
  const qc = useQueryClient()
  const [r, setR] = useState<AgreementRules>(() => structuredClone(data.rules))
  useEffect(() => setR(structuredClone(data.rules)), [data.rules])
  const P = data.preset
  const subOptions = data.options.subniveles.map((s) => ({ value: s, label: SUBNIVEL_LABEL[s] }))

  const save = useMutation({
    mutationFn: () => normativeApi.updateProfile({ rules: r }),
    onSuccess: (res) => {
      qc.setQueryData(['normative-profile'], res)
      toast.success('Reglas guardadas')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const set = <K extends keyof AgreementRules>(k: K, patch: Partial<AgreementRules[K]>) =>
    setR({ ...r, [k]: { ...r[k], ...patch } })

  const improvement = (k: 'direct' | 'withReinforcement', title: string, description: string) => {
    const rule = r.summativeImprovement[k]
    const pr = P.summativeImprovement[k]
    const setRule = (patch: Partial<ImprovementRule>) =>
      setR({ ...r, summativeImprovement: { ...r.summativeImprovement, [k]: { ...rule, ...patch } } })
    return (
      <div className="space-y-3 rounded-md border p-3">
        <CheckField label={title} description={description} checked={rule.enabled} onChange={(v) => setRule({ enabled: v })} />
        <FieldGrid>
          <NumField label="Nota inicial desde" value={rule.min} onChange={(v) => setRule({ min: v ?? 0 })} preset={pr.min} />
          <NumField label="Nota inicial hasta" value={rule.max} onChange={(v) => setRule({ max: v ?? 0 })} preset={pr.max} />
          <NumField label="Nota máxima resultante" value={rule.cap} onChange={(v) => setRule({ cap: v ?? 0 })} preset={pr.cap} />
          <NumField label="Máximo por asignatura en el año (0 = sin límite)" integer min={0} value={rule.perSubject} onChange={(v) => setRule({ perSubject: v ?? 0 })} preset={pr.perSubject} />
          <NumField label="Máximo total en el año (0 = sin límite)" integer min={0} value={rule.perYear} onChange={(v) => setRule({ perYear: v ?? 0 })} preset={pr.perYear} />
        </FieldGrid>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Estas reglas se aplican a los años lectivos que usan el Acuerdo 2026-00082-A. Las alertas tempranas las usan siempre.
        </p>
        <Button variant="outline" size="sm" onClick={() => setR(structuredClone(P))}>
          <RotateCcw className="mr-2 h-4 w-4" />Restaurar valores del acuerdo
        </Button>
      </div>

      <Section title="Decimales" description="Art. 8: los promedios se expresan con dos decimales truncados.">
        <FieldGrid>
          <NumField label="Cantidad de decimales" integer min={0} max={3} value={r.decimals.places} onChange={(v) => set('decimals', { places: v ?? 2 })} preset={P.decimals.places} />
          <SelectField
            label="Método"
            value={r.decimals.method}
            onChange={(v) => set('decimals', { method: v })}
            options={[{ value: 'truncate', label: 'Truncar' }, { value: 'round', label: 'Redondear' }]}
            preset={P.decimals.method}
          />
        </FieldGrid>
      </Section>

      <Section title="Alertas tempranas" description="Art. 10: detección de bajos desempeños a partir de las notas.">
        <FieldGrid>
          <SelectField
            label="Nota que se analiza"
            value={r.earlyAlert.source}
            onChange={(v) => set('earlyAlert', { source: v })}
            options={[{ value: 'formative', label: 'Base formativa del periodo' }, { value: 'period_total', label: 'Nota total del periodo' }]}
            preset={P.earlyAlert.source}
          />
          <SelectField
            label="Momento del cálculo"
            value={r.earlyAlert.moment}
            onChange={(v) => set('earlyAlert', { moment: v })}
            options={[{ value: 'live', label: 'En vivo (con cada nota)' }, { value: 'period_close', label: 'Solo al cerrar el periodo' }]}
            preset={P.earlyAlert.moment}
          />
          <NumField label="Rango cuantitativo desde" value={r.earlyAlert.quantitativeMin} onChange={(v) => set('earlyAlert', { quantitativeMin: v ?? 0 })} preset={P.earlyAlert.quantitativeMin} />
          <NumField label="Rango cuantitativo hasta" value={r.earlyAlert.quantitativeMax} onChange={(v) => set('earlyAlert', { quantitativeMax: v ?? 0 })} preset={P.earlyAlert.quantitativeMax} />
          <ListEditor label="Códigos cualitativos que activan la alerta" values={r.earlyAlert.qualitativeCodes} onChange={(v) => set('earlyAlert', { qualitativeCodes: v })} placeholder="E-, E+, D-, D+, C-, C+" />
        </FieldGrid>
        <CheckGroup label="Subniveles evaluados con escala cualitativa" options={subOptions} values={r.earlyAlert.qualitativeSubniveles} onChange={(v) => set('earlyAlert', { qualitativeSubniveles: v as SubnivelCode[] })} preset={P.earlyAlert.qualitativeSubniveles} />
        <CheckGroup label="Subniveles sin alertas" options={subOptions} values={r.earlyAlert.excludedSubniveles} onChange={(v) => set('earlyAlert', { excludedSubniveles: v as SubnivelCode[] })} preset={P.earlyAlert.excludedSubniveles} />
      </Section>

      <Section title="Refuerzo de actividades formativas" description="Art. 10.4: la actividad de refuerzo se promedia con la nota inicial, hasta 7,00.">
        <FieldGrid>
          <SelectField
            label="Cálculo"
            value={r.formativeReinforcement.method}
            onChange={(v) => set('formativeReinforcement', { method: v })}
            options={[{ value: 'average', label: 'Promedio con la nota inicial' }, { value: 'replace', label: 'Reemplaza la nota inicial' }]}
            preset={P.formativeReinforcement.method}
          />
          <NumField label="Nota máxima resultante" nullable value={r.formativeReinforcement.cap} onChange={(v) => set('formativeReinforcement', { cap: v })} preset={P.formativeReinforcement.cap} />
        </FieldGrid>
      </Section>

      <Section title="Mejora de evaluaciones sumativas" description="Arts. 11–14.">
        {improvement('direct', 'Mejora directa', 'Nota entre 7 y 9: se promedia con una evaluación adicional.')}
        {improvement('withReinforcement', 'Mejora con refuerzo pedagógico', 'Nota menor a 7: refuerzo y evaluación adicional.')}
      </Section>

      <Section title="Recuperación del periodo" description="Nota de recuperación pedagógica aplicada al total del periodo.">
        <FieldGrid>
          <SelectField
            label="Cálculo"
            value={r.periodRecovery.method}
            onChange={(v) => set('periodRecovery', { method: v })}
            options={[{ value: 'average', label: 'Promedio con la nota original' }, { value: 'replace_if_higher', label: 'Reemplaza si es mayor' }]}
            preset={P.periodRecovery.method}
          />
          <NumField label="Nota máxima resultante" nullable value={r.periodRecovery.cap} onChange={(v) => set('periodRecovery', { cap: v })} preset={P.periodRecovery.cap} />
        </FieldGrid>
      </Section>

      <Section title="Evaluación atrasada" description="Art. 18: si no se presenta sin justificación se registra uno.">
        <FieldGrid>
          <NumField label="Nota por no presentarse sin justificación" value={r.lateAssessment.unjustifiedScore} onChange={(v) => set('lateAssessment', { unjustifiedScore: v ?? 0 })} preset={P.lateAssessment.unjustifiedScore} />
          <SelectField
            label="Se aplica a"
            value={r.lateAssessment.applyTo}
            onChange={(v) => set('lateAssessment', { applyTo: v })}
            options={[{ value: 'summative', label: 'Solo evaluaciones sumativas' }, { value: 'all', label: 'Todas las actividades' }]}
            preset={P.lateAssessment.applyTo}
          />
        </FieldGrid>
      </Section>

      <Section title="Promoción" description="Arts. 20–27.">
        <FieldGrid>
          <NumField label="Nota mínima de promoción" value={r.promotion.minToPass} onChange={(v) => set('promotion', { minToPass: v ?? 0 })} preset={P.promotion.minToPass} />
          <NumField label="Supletorio desde" value={r.promotion.supletorioMin} onChange={(v) => set('promotion', { supletorioMin: v ?? 0 })} preset={P.promotion.supletorioMin} />
          <NumField label="Supletorio hasta" value={r.promotion.supletorioMax} onChange={(v) => set('promotion', { supletorioMax: v ?? 0 })} preset={P.promotion.supletorioMax} />
          <NumField label="Nota máxima del supletorio" value={r.promotion.supletorioCap} onChange={(v) => set('promotion', { supletorioCap: v ?? 0 })} preset={P.promotion.supletorioCap} />
          <NumField label="Repitencia directa con promedio igual o menor a" value={r.promotion.directRepeatMax} onChange={(v) => set('promotion', { directRepeatMax: v ?? 0 })} preset={P.promotion.directRepeatMax} />
        </FieldGrid>
        <CheckGroup label="Promoción automática (art. 20)" options={subOptions} values={r.promotion.automaticSubniveles} onChange={(v) => set('promotion', { automaticSubniveles: v as SubnivelCode[] })} preset={P.promotion.automaticSubniveles} />
        <CheckGroup label="Repitencia directa (art. 25)" options={subOptions} values={r.promotion.directRepeatSubniveles} onChange={(v) => set('promotion', { directRepeatSubniveles: v as SubnivelCode[] })} preset={P.promotion.directRepeatSubniveles} />
        <CheckGroup label="Decide la junta de docentes (arts. 23 y 27)" options={subOptions} values={r.promotion.juntaDecisionSubniveles} onChange={(v) => set('promotion', { juntaDecisionSubniveles: v as SubnivelCode[] })} preset={P.promotion.juntaDecisionSubniveles} />
      </Section>

      <Section title="Ponderación referencial" description="Art. 36: obligatoria para fiscales; referencial para otros sostenimientos. Debe sumar 100.">
        <FieldGrid>
          <NumField label="Formativa (%)" integer min={0} max={100} value={r.weights.formative} onChange={(v) => set('weights', { formative: v ?? 0 })} preset={P.weights.formative} />
          <NumField label="Sumativa (%)" integer min={0} max={100} value={r.weights.summative} onChange={(v) => set('weights', { summative: v ?? 0 })} preset={P.weights.summative} />
        </FieldGrid>
      </Section>

      <div className="sticky bottom-0 flex justify-end border-t bg-background/95 py-3">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Guardar reglas
        </Button>
      </div>
    </div>
  )
}
