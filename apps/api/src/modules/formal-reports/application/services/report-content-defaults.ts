import type { ReportTypeConfig } from '../../../../shared/domain/reports-flow'

/** Fecha de emisión del documento en Ecuador; no rellena fechas de reuniones o del plan. */
export function withDocumentDateDefault(type: Pick<ReportTypeConfig, 'fields'>, content: Record<string, string>, now = new Date()): Record<string, string> {
  if (content.fecha_documento?.trim() || !type.fields.some((f) => f.key === 'fecha_documento' && f.type === 'date')) return content
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return { ...content, fecha_documento: `${part('year')}-${part('month')}-${part('day')}` }
}
