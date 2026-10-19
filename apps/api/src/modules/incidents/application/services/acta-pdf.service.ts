import PDFDocument from 'pdfkit'
import { resolveLogo, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'
import { DEFAULT_ACTA_TEMPLATE, type CommitmentDocument } from './commitment-document'

export interface ActaPdfData {
  institutionName: string
  logoUrl?: string | null
  studentName: string
  studentDni: string | null
  incidentTypeName: string | null
  severity: string | null
  terms: string
  followUpDate: Date | null
  createdAt: Date
  signatories: Record<string, unknown>
  reference?: string
  status?: string
  document?: CommitmentDocument
  contextIsCurrent?: boolean
}
const severityLabels: Record<string, string> = { low: 'Leve', medium: 'Moderado', high: 'Grave', leve: 'Leve', grave: 'Grave', muy_grave: 'Muy grave' }
const stateLabels: Record<string, string> = { reportado: 'Reportado', en_revision: 'En revisión', derivado_dece: 'Derivado al DECE', medidas_definidas: 'Medidas definidas', acta_firmada: 'Acta firmada', en_seguimiento: 'En seguimiento', resuelto: 'Resuelto', cerrado: 'Cerrado' }
const eventLabels: Record<string, string> = { created: 'Registro del incidente', state_changed: 'Cambio de estado', note: 'Nota de seguimiento', dece_assigned: 'Derivación al DECE', guardian_notified: 'Notificación al representante', commitment_created: 'Creación de acta', attachment_added: 'Evidencia adjuntada', commitment_signed: 'Registro de firma' }
const dateOnly = (value: Date | string | null | undefined) => {
  if (!value) return 'No indicada'
  const date = new Date(typeof value === 'string' ? `${value.slice(0, 10)}T12:00:00.000Z` : value)
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}
const dateTime = (value: Date | string) => new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guayaquil' }).format(new Date(value))

/** Documento multipágina con el contexto conservado al emitir el acta. */
export function buildActaPdf(data: ActaPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 48, left: 48, right: 48, bottom: 58 }, bufferPages: true })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    try {
      const saved = data.document
      const context = saved?.context
      const details = saved?.details
      const template = saved?.template ?? DEFAULT_ACTA_TEMPLATE
      const institution = context?.institutionName ?? data.institutionName
      const logo = resolveLogo(context?.logoUrl ?? data.logoUrl)
      const left = 48
      const width = doc.page.width - 96
      const reference = data.reference ?? context?.incidentId ?? 'Sin referencia'
      const color = template.accentColor
      const body = () => doc.font('Helvetica').fontSize(10).fillColor('#182230')
      const continuation = () => {
        if (template.showWatermark) drawWatermark(doc, logo, 0.05)
        doc.font('Helvetica-Bold').fontSize(9).fillColor(color).text(institution, left, 30, { width })
        doc.moveTo(left, 47).lineTo(left + width, 47).strokeColor('#d8dee8').stroke()
        doc.x = left; doc.y = 62; body()
      }
      doc.on('pageAdded', continuation)
      const ensure = (height: number) => { if (doc.y + height > doc.page.height - 64) doc.addPage() }
      const section = (title: string) => {
        ensure(60)
        doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(color).text(title, { width })
        doc.moveDown(0.35); body()
      }
      const row = (label: string, value: string | null | undefined) => {
        ensure(32)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#4b5563').text(label, { width })
        body().text(value || 'No registrado', { width, lineGap: 2 })
        doc.moveDown(0.25)
      }
      const pair = (items: Array<[string, string | null | undefined]>) => {
        const columnWidth = (width - 20) / 2
        const height = Math.max(...items.map(([label, value]) => {
          const labelHeight = doc.font('Helvetica-Bold').fontSize(9).heightOfString(label, { width: columnWidth })
          return labelHeight + doc.font('Helvetica').fontSize(10).heightOfString(value || 'No registrado', { width: columnWidth }) + 10
        }))
        ensure(height)
        const y = doc.y
        items.forEach(([label, value], column) => {
          const x = left + column * (columnWidth + 20)
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#4b5563').text(label, x, y, { width: columnWidth })
          body().text(value || 'No registrado', { width: columnWidth })
        })
        doc.x = left; doc.y = y + height
      }
      if (template.showWatermark) drawWatermark(doc, logo, 0.05)
      if (logo) {
        try { doc.image(logo, left, 46, { fit: [48, 48] }) } catch { /* logo no disponible */ }
      }
      doc.rect(left, 40, width, 3).fill(color)
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#111827').text(institution.toUpperCase(), left + (logo ? 60 : 0), 54, { width: width - (logo ? 60 : 0) })
      doc.moveDown(0.5).fontSize(13).fillColor(color).text(template.title, left, Math.max(doc.y, 101), { width })
      if (template.subtitle) doc.moveDown(0.25).font('Helvetica').fontSize(10).fillColor('#6b7280').text(template.subtitle, { width })
      doc.moveDown(0.7); body()
      pair([['Referencia del acta', reference], ['Emisión · hora de Ecuador', dateTime(data.createdAt)]])
      row('Estado del registro', data.status === 'signed' ? 'Firmado' : 'Borrador para firmas')
      if (data.contextIsCurrent && saved) row('Información del expediente consultada el', dateTime(saved.capturedAt))
      if (template.introduction) { doc.moveDown(0.4); body().text(template.introduction, { width, align: 'justify', lineGap: 2 }) }

      section('Identificación del estudiante y del caso')
      pair([['Estudiante', context?.studentName ?? data.studentName], ['Cédula / identificación', context?.studentDni ?? data.studentDni]])
      if (context?.classroom) row('Curso, paralelo y año lectivo', context.classroom)
      for (const guardian of context?.guardians ?? []) row(`Representante registrado · ${guardian.relationship}`, `${guardian.name}${guardian.dni ? ` · CI ${guardian.dni}` : ''}`)
      if (context) {
        pair([['Referencia del incidente', context.incidentId], ['Fecha del incidente', dateOnly(context.incidentDate)]])
      }
      row('Tipo de incidente', context?.incidentTypeName ?? data.incidentTypeName)
      const severity = context?.severity ?? data.severity
      pair([['Gravedad registrada', severity ? severityLabels[severity] ?? severity : null], ['Estado del caso al consultar / emitir', context ? stateLabels[context.workflowState] ?? context.workflowState : null]])
      if (context) {
        pair([['Registrado por', context.reporterName], ['Profesional DECE asignado', context.assignedDeceName]])
        if (context.guardianNotifiedAt) row('Notificación registrada al representante', dateTime(context.guardianNotifiedAt))
      }
      if (details?.meetingDate || details?.meetingPlace) {
        section('Datos de la reunión')
        if (details.meetingDate) row('Fecha de la reunión', dateOnly(details.meetingDate))
        if (details.meetingPlace) row('Lugar', details.meetingPlace)
      }
      if (details?.purpose) row('Objetivo de la reunión', details.purpose)
      if (context?.description) {
        section('Descripción y antecedentes del incidente')
        body().text(context.description, { width, align: 'justify', lineGap: 3 })
      }
      if ((details?.includeTimeline ?? template.includeTimeline) && context) {
        section('Bitácora de actuaciones incluidas')
        if (!context.timeline.length) body().text('No se incluyeron entradas de bitácora en esta acta.', { width })
        for (const event of context.timeline) {
          ensure(55)
          doc.font('Helvetica-Bold').fontSize(9).text(`${dateTime(event.createdAt)} · ${event.actorName}`, { width })
          body().text(`${eventLabels[event.type] ?? event.type}${event.description ? `: ${event.description}` : ''}`, { width, lineGap: 2 })
          doc.moveDown(0.5)
        }
      }
      if (details?.participants.length) {
        section('Participantes registrados en el acta')
        for (const participant of details.participants) row(participant.role, `${participant.name}${participant.dni ? ` · CI ${participant.dni}` : ''}`)
      }
      section('Acuerdos y compromisos')
      const terms = saved?.generalTerms ?? (details?.agreements.length ? '' : data.terms)
      if (terms) body().text(terms, { width, align: 'justify', lineGap: 3 })
      for (const [index, agreement] of (details?.agreements ?? []).entries()) {
        ensure(80)
        doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).text(`Acuerdo ${index + 1}`, { width })
        body().text(agreement.action, { width, lineGap: 2 })
        row('Responsable', agreement.responsible)
        row('Plazo de cumplimiento', dateOnly(agreement.dueDate))
        if (agreement.verification) row('Cómo se verificará el cumplimiento', agreement.verification)
      }
      section('Seguimiento y observaciones')
      row('Fecha de seguimiento', dateOnly(saved?.followUpDate !== undefined ? saved.followUpDate : data.followUpDate))
      if (details?.observations) row('Observaciones de la reunión', details.observations)
      if (context?.resolutionNotes) row('Resolución / medidas registradas en el caso', context.resolutionNotes)
      if ((details?.includeEvidenceList ?? template.includeEvidenceList) && context) {
        section('Relación de evidencias y anexos')
        if (!context.evidence.length) body().text('No se incluyeron referencias de evidencias.', { width })
        for (const [index, evidence] of context.evidence.entries()) {
          body().text(`${index + 1}. ${evidence.fileName} · ${dateTime(evidence.createdAt)} · ${evidence.uploaderName}`, { width, lineGap: 2 })
          doc.moveDown(0.3)
        }
      }
      if (template.closing) { section('Constancia y seguimiento'); body().text(template.closing, { width, align: 'justify', lineGap: 2 }) }
      ensure(140)
      section('Firmas')
      const signers = details?.participants.length ? details.participants : template.signatureLabels.map((role) => ({ role, name: '', dni: '' }))
      const columns = signers.length <= 3 ? signers.length : 2
      const columnWidth = (width - 24 * (columns - 1)) / columns
      for (let i = 0; i < signers.length; i += columns) {
        const pair = signers.slice(i, i + columns)
        body().fontSize(9)
        const texts = pair.map((person) => `${person.name || 'Nombre: ____________________'}\n${person.role}${person.dni ? `\nCI: ${person.dni}` : ''}`)
        const height = Math.max(...texts.map((text) => doc.heightOfString(text, { width: columnWidth }))) + 55
        ensure(height)
        const y = doc.y
        pair.forEach((_, column) => {
          const x = left + column * (columnWidth + 24)
          doc.moveTo(x, y + 24).lineTo(x + columnWidth, y + 24).strokeColor('#374151').stroke()
          doc.font('Helvetica').fontSize(9).fillColor('#182230').text(texts[column], x, y + 31, { width: columnWidth })
        })
        doc.x = left; doc.y = y + height
      }
      const range = doc.bufferedPageRange()
      for (let index = range.start; index < range.start + range.count; index++) {
        doc.switchToPage(index)
        const bottom = doc.page.margins.bottom
        doc.page.margins.bottom = 15
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(`Acta ${reference} · Página ${index + 1} de ${range.count}`, left, doc.page.height - 35, { width, align: 'center', lineBreak: false })
        doc.page.margins.bottom = bottom
      }
      doc.end()
    } catch (error) { doc.destroy(); reject(error) }
  })
}
