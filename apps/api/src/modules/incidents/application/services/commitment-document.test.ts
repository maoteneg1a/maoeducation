import { describe, expect, it } from 'vitest'
import { buildCommitmentDocument, DEFAULT_ACTA_TEMPLATE, parseCommitmentInput, resolveActaTemplate } from './commitment-document'
import { sampleActaPdfData } from './acta-preview'

const context = () => sampleActaPdfData('Escuela de prueba', null, DEFAULT_ACTA_TEMPLATE).document!.context

describe('contenido conservado del acta', () => {
  it('acepta acuerdos estructurados sin exigir repetirlos en texto libre', () => {
    expect(parseCommitmentInput({ document: { agreements: [{ action: 'Revisar avances', responsible: 'Docente' }] } }).terms).toBe('')
    expect(() => parseCommitmentInput({ terms: '   ' })).toThrow()
    expect(() => parseCommitmentInput({ document: { agreements: [{ action: 'Revisar', responsible: '' }] } })).toThrow()
  })
  it.each(['2026-02-30', '2026-13-01', 'mañana'])('rechaza fechas imposibles %s', (date) => {
    expect(() => parseCommitmentInput({ terms: 'Acuerdo', followUpDate: date })).toThrow()
    expect(() => parseCommitmentInput({ terms: 'Acuerdo', document: { agreements: [{ action: 'Revisar', responsible: 'Docente', dueDate: date }] } })).toThrow()
  })
  it('incluye solo las entradas seleccionadas y no admite eventos ajenos al caso', () => {
    expect(buildCommitmentDocument(context(), DEFAULT_ACTA_TEMPLATE, { timelineEventIds: ['event-2'] }).context.timeline.map((event) => event.id)).toEqual(['event-2'])
    expect(buildCommitmentDocument(context(), DEFAULT_ACTA_TEMPLATE, { timelineEventIds: [] }).context.timeline).toEqual([])
    expect(() => buildCommitmentDocument(context(), DEFAULT_ACTA_TEMPLATE, { timelineEventIds: ['otro-caso'] })).toThrow()
  })
  it('conserva una copia independiente del expediente, acuerdos y plantilla', () => {
    const source = context()
    const template = structuredClone(DEFAULT_ACTA_TEMPLATE)
    const input = { agreements: [{ action: 'Acción original', responsible: 'Docente' }] }
    const document = buildCommitmentDocument(source, template, input)
    source.description = 'Nueva descripción'; source.timeline[0].description = 'Modificada'
    template.title = 'Otro formato'; input.agreements[0].action = 'Otro acuerdo'
    expect(document.context.description).not.toBe(source.description)
    expect(document.context.timeline[0].description).not.toBe('Modificada')
    expect(document.template.title).toBe(DEFAULT_ACTA_TEMPLATE.title)
    expect(document.details.agreements[0].action).toBe('Acción original')
  })
  it('aplica las preferencias institucionales y permite cambiar las secciones por acta', () => {
    const template = resolveActaTemplate({ documentTemplates: { incidentCommitment: { includeTimeline: false, includeEvidenceList: false } } })
    expect(buildCommitmentDocument(context(), template).context).toMatchObject({ timeline: [], evidence: [] })
    expect(buildCommitmentDocument(context(), template, { includeTimeline: true, includeEvidenceList: true }).context.timeline).toHaveLength(2)
    expect(resolveActaTemplate(null)).toEqual(DEFAULT_ACTA_TEMPLATE)
  })
})
