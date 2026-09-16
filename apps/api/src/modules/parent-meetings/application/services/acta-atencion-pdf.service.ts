import PDFDocument from 'pdfkit'
import { resolveLogo, drawHeader, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'

export interface ActaAtencionPdfData {
  institutionName: string
  logoUrl?: string | null
  meetingDate: Date
  meetingTime: string | null
  visitorName: string
  visitorRelation: string | null
  studentName: string | null
  studentDni: string | null
  subject: string
  details: string
  agreements: string | null
  recorderName: string
  /** PNG de la firma del visitante (buffer), o null si aún no firmó. */
  signature: Buffer | null
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

/** Genera el PDF del acta de atención a padres y lo devuelve como Buffer. */
export function buildActaAtencionPdf(data: ActaAtencionPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logo = resolveLogo(data.logoUrl)
    drawWatermark(doc, logo, 0.07)
    drawHeader(doc, logo, data.institutionName, 'ACTA DE ATENCIÓN A PADRES DE FAMILIA')


    doc.fontSize(10).font('Helvetica')
    const fecha = data.meetingTime ? `${fmtDate(data.meetingDate)} — ${data.meetingTime}` : fmtDate(data.meetingDate)
    doc.text(`Fecha y hora: ${fecha}`)
    doc.moveDown(0.8)

    // Datos
    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
      doc.font('Helvetica').text(value || '—')
    }
    const visitor = data.visitorRelation
      ? `${data.visitorName} (${data.visitorRelation})`
      : data.visitorName
    row('Persona que se acercó', visitor)
    if (data.studentName) {
      row('Estudiante', data.studentName)
      row('Cédula', data.studentDni ?? '—')
    }
    row('Asunto', data.subject)
    doc.moveDown(1)

    // Detalle de lo conversado
    doc.font('Helvetica-Bold').fontSize(11).text('Detalle de lo conversado')
    doc.moveDown(0.4)
    doc.font('Helvetica').fontSize(10).text(data.details, { align: 'justify' })
    doc.moveDown(1)

    // Acuerdos / compromisos
    if (data.agreements) {
      doc.font('Helvetica-Bold').fontSize(11).text('Acuerdos y compromisos')
      doc.moveDown(0.4)
      doc.font('Helvetica').fontSize(10).text(data.agreements, { align: 'justify' })
      doc.moveDown(1)
    }

    doc.moveDown(2)

    // Firma del visitante (dibujada) — si existe, se incrusta sobre la línea
    if (data.signature) {
      try {
        doc.image(data.signature, { width: 180 })
      } catch {
        // si la imagen no es válida, se omite y queda la línea en blanco
      }
    }
    doc.font('Helvetica').fontSize(10)
    doc.text('_______________________________')
    doc.text(`Firma: ${data.visitorName}`)
    doc.moveDown(2)

    // Funcionario que atendió (nombre impreso)
    doc.text('_______________________________')
    doc.text(`Atendió: ${data.recorderName}`)

    doc.end()
  })
}
