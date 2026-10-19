import { z } from 'zod'
import { BadRequestError } from '../../../../shared/domain/errors/app.errors'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Fecha inválida')
const text = (max: number) => z.string().trim().max(max)
export const actaTemplateSchema = z.object({
  title: text(150).min(1), subtitle: text(250), introduction: text(4000), closing: text(4000),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  includeTimeline: z.boolean(), includeEvidenceList: z.boolean(), showWatermark: z.boolean(),
  signatureLabels: z.array(text(100).min(1)).min(1).max(12),
})
export type ActaTemplate = z.infer<typeof actaTemplateSchema>
export const DEFAULT_ACTA_TEMPLATE: ActaTemplate = {
  title: 'ACTA DE COMPROMISO Y SEGUIMIENTO', subtitle: 'Convivencia y acompañamiento educativo',
  introduction: 'Se deja constancia de los hechos registrados, las actuaciones realizadas y los acuerdos establecidos para su seguimiento.',
  closing: 'Los participantes revisarán el cumplimiento de los acuerdos en la fecha de seguimiento indicada. Las firmas se recabarán en los espacios correspondientes.',
  accentColor: '#2563eb', includeTimeline: true, includeEvidenceList: true, showWatermark: false,
  signatureLabels: ['Estudiante', 'Representante', 'DECE / Autoridad'],
}
const participantSchema = z.object({ name: text(150).min(1), role: text(100).min(1), dni: text(20).optional() })
const agreementSchema = z.object({ action: text(4000).min(1), responsible: text(150).min(1), dueDate: date.optional(), verification: text(2000).optional() })
export const actaInputSchema = z.object({
  meetingPlace: text(250).optional(), meetingDate: date.optional(), purpose: text(3000).optional(),
  participants: z.array(participantSchema).max(20).default([]), agreements: z.array(agreementSchema).max(30).default([]),
  observations: text(10000).optional(), includeTimeline: z.boolean().optional(),
  timelineEventIds: z.array(z.string().min(1).max(100)).max(500).optional(), includeEvidenceList: z.boolean().optional(),
})
export type ActaInput = z.input<typeof actaInputSchema>
export const commitmentInputSchema = z.object({
  terms: text(20000).default(''), followUpDate: date.optional(), signatories: z.record(z.unknown()).optional(),
  document: actaInputSchema.optional(),
}).refine((input) => input.terms.length > 0 || (input.document?.agreements.length ?? 0) > 0, 'Registra al menos un acuerdo o compromiso')

export function parseCommitmentInput(value: unknown) {
  const result = commitmentInputSchema.safeParse(value)
  if (!result.success) throw new BadRequestError(result.error.issues.map((issue) => issue.message).join('. '))
  return result.data
}
export function resolveActaTemplate(settings: unknown): ActaTemplate {
  const source = (settings ?? {}) as { documentTemplates?: { incidentCommitment?: unknown } }
  const raw = source.documentTemplates?.incidentCommitment
  const result = actaTemplateSchema.safeParse({ ...DEFAULT_ACTA_TEMPLATE, ...(typeof raw === 'object' && raw ? raw : {}) })
  return result.success ? result.data : structuredClone(DEFAULT_ACTA_TEMPLATE)
}
export function parseActaTemplate(value: unknown): ActaTemplate {
  const result = actaTemplateSchema.safeParse(value)
  if (!result.success) throw new BadRequestError('Revisa los textos, el color y las firmas de la plantilla del acta')
  return result.data
}

export interface ActaContext {
  institutionName: string
  logoUrl: string | null
  incidentId: string
  studentName: string
  studentDni: string | null
  classroom: string | null
  guardians: Array<{ name: string; dni: string | null; relationship: string }>
  incidentDate: string
  incidentTypeName: string
  severity: string
  description: string
  workflowState: string
  reporterName: string
  assignedDeceName: string | null
  guardianNotifiedAt: string | null
  resolutionNotes: string | null
  timeline: Array<{ id: string; type: string; description: string | null; createdAt: string; actorName: string }>
  evidence: Array<{ id: string; fileName: string; createdAt: string; uploaderName: string }>
}
export interface CommitmentDocument {
  version: 1
  capturedAt: string
  generalTerms?: string
  followUpDate?: string | null
  context: ActaContext
  template: ActaTemplate
  details: z.output<typeof actaInputSchema>
}

export function buildCommitmentDocument(context: ActaContext, template: ActaTemplate, input: ActaInput = {}, capturedAt = new Date()): CommitmentDocument {
  const parsed = actaInputSchema.safeParse(input)
  if (!parsed.success) throw new BadRequestError('Revisa los participantes, acuerdos y fechas del acta')
  const details = parsed.data
  const selected = details.timelineEventIds ? new Set(details.timelineEventIds) : null
  if (selected && [...selected].some((id) => !context.timeline.some((event) => event.id === id))) {
    throw new BadRequestError('La bitácora seleccionada contiene eventos que no pertenecen a este incidente')
  }
  const includeTimeline = details.includeTimeline ?? template.includeTimeline
  const includeEvidence = details.includeEvidenceList ?? template.includeEvidenceList
  return {
    version: 1, capturedAt: capturedAt.toISOString(), template: structuredClone(template), details: structuredClone(details),
    context: {
      ...structuredClone(context),
      timeline: includeTimeline ? context.timeline.filter((event) => !selected || selected.has(event.id)).map((event) => ({ ...event })) : [],
      evidence: includeEvidence ? structuredClone(context.evidence) : [],
    },
  }
}
