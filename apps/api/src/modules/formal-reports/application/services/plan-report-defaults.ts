import type { ReportTypeConfig } from '../../../../shared/domain/reports-flow'

export interface PlanReportDefaults {
  teacher: string
  mode: string
  subject: string
  learningTarget: string | null
  objective: string | null
  strategy: string | null
  resources: string | null
  evaluation: string | null
  startDate: string | null
}

/** Reutiliza datos registrados; no inventa horarios, indicadores, resultados ni firmas. */
export function withPlanReportDefaults(type: Pick<ReportTypeConfig, 'pdfTemplate' | 'fields'>, content: Record<string, string>, plan: PlanReportDefaults | null) {
  if (!plan || !type.pdfTemplate) return content
  const defaults: Record<string, string | null> = {
    docente_refuerzo: plan.teacher,
    agrupacion: plan.mode === 'GROUP' ? 'Pequeño grupo' : plan.mode === 'INDIVIDUAL' ? 'Individual' : null,
    objetivo: plan.objective,
    competencia_saberes: plan.learningTarget,
    fecha_inicio: plan.startDate,
  }
  const subject = plan.subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const prefix = subject.includes('lengua y literatura') || subject === 'lengua' || subject === 'lenguaje' ? 'lengua' : subject.includes('matemat') ? 'matematica' : null
  if (prefix && type.pdfTemplate === 'annex_plan') {
    defaults[`${prefix}_saberes`] = plan.learningTarget
    defaults[`${prefix}_estrategias`] = plan.strategy
    defaults[`${prefix}_recursos`] = plan.resources
    defaults[`${prefix}_evaluacion`] = plan.evaluation
  }
  const allowed = new Set(type.fields.map((field) => field.key))
  return { ...Object.fromEntries(Object.entries(defaults).filter((entry): entry is [string, string] => allowed.has(entry[0]) && !!entry[1]?.trim())), ...content }
}
