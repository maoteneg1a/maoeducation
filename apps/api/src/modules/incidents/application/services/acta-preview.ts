import { buildCommitmentDocument, type ActaTemplate, type ActaContext } from './commitment-document'
import type { ActaPdfData } from './acta-pdf.service'

export function sampleActaPdfData(institutionName: string, logoUrl: string | null, template: ActaTemplate): ActaPdfData {
  const createdAt = new Date()
  const day = createdAt.toISOString().slice(0, 10)
  const context: ActaContext = {
    institutionName, logoUrl, incidentId: 'CASO-DE-EJEMPLO', studentName: 'Estudiante de ejemplo', studentDni: null,
    classroom: 'Quinto de Básica A · Año lectivo de ejemplo',
    guardians: [{ name: 'Representante de ejemplo', dni: null, relationship: 'representante' }],
    incidentDate: day, incidentTypeName: 'Situación de convivencia de ejemplo', severity: 'leve',
    description: 'Durante una actividad grupal se registraron interrupciones que dificultaron el trabajo del equipo. El docente conversó con los participantes y propuso una reunión de acompañamiento. Este relato es ficticio y sirve únicamente para revisar el formato.',
    workflowState: 'en_revision', reporterName: 'Docente de ejemplo', assignedDeceName: null,
    guardianNotifiedAt: null, resolutionNotes: null,
    timeline: [
      { id: 'event-1', type: 'created', description: 'Se registró la situación y se escuchó al estudiante.', actorName: 'Docente de ejemplo', createdAt: createdAt.toISOString() },
      { id: 'event-2', type: 'note', description: 'Se coordinó una reunión de acompañamiento con el representante.', actorName: 'Inspector de ejemplo', createdAt: createdAt.toISOString() },
    ],
    evidence: [{ id: 'evidence-1', fileName: 'registro-de-ejemplo.pdf', uploaderName: 'Docente de ejemplo', createdAt: createdAt.toISOString() }],
  }
  const document = buildCommitmentDocument(context, template, {
    meetingPlace: 'Sala de reuniones · ejemplo', meetingDate: day, purpose: 'Acordar acciones concretas para mejorar la participación en clase.',
    participants: [{ name: 'Estudiante de ejemplo', role: 'Estudiante' }, { name: 'Representante de ejemplo', role: 'Representante' }, { name: 'Docente de ejemplo', role: 'Docente' }],
    agreements: [
      { action: 'Respetar los turnos de intervención y solicitar la palabra durante las actividades grupales.', responsible: 'Estudiante de ejemplo', dueDate: day, verification: 'Revisión del registro de participación por parte del docente.' },
      { action: 'Realizar una conversación de seguimiento con el estudiante y su representante.', responsible: 'Docente de ejemplo', verification: 'Nota de seguimiento en la bitácora del caso.' },
    ], observations: 'Vista previa con datos ficticios. La creación de esta muestra no registra un acta ni modifica un expediente.',
  }, createdAt)
  document.generalTerms = 'Se acuerda mantener una comunicación respetuosa y revisar los avances en la fecha señalada.'
  document.followUpDate = day
  return { institutionName, logoUrl, studentName: context.studentName, studentDni: null, incidentTypeName: context.incidentTypeName, severity: 'leve', terms: document.generalTerms, followUpDate: createdAt, createdAt, signatories: {}, reference: 'VISTA-PREVIA', status: 'draft', document }
}
