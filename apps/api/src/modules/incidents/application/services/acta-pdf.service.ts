import PDFDocument from 'pdfkit'
import { resolveLogo, drawHeader, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'

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
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

/** Genera el PDF del acta de compromiso y lo devuelve como Buffer. */
export function buildActaPdf(data: ActaPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logo = resolveLogo(data.logoUrl)
    drawWatermark(doc, logo, 0.07)
    drawHeader(doc, logo, data.institutionName, 'ACTA DE COMPROMISO')


    doc.fontSize(10).font('Helvetica')
    doc.text(`Fecha: ${fmtDate(data.createdAt)}`)
    doc.moveDown(0.8)

    // Datos
    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').text(`${label}: `, { continued: true })
      doc.font('Helvetica').text(value || '—')
    }
    row('Estudiante', data.studentName)
    row('Cédula', data.studentDni ?? '—')
    row('Tipo de falta', data.incidentTypeName ?? '—')
    row('Gravedad', data.severity ?? '—')
    row('Fecha de seguimiento', fmtDate(data.followUpDate))
    doc.moveDown(1)

    // Términos del compromiso
    doc.font('Helvetica-Bold').fontSize(11).text('Compromisos acordados')
    doc.moveDown(0.4)
    doc.font('Helvetica').fontSize(10).text(data.terms, { align: 'justify' })
    doc.moveDown(3)

    // Firmas
    const signLine = (label: string) => {
      doc.font('Helvetica').fontSize(10)
      doc.text('_______________________________')
      doc.text(label)
      doc.moveDown(1.5)
    }
    doc.moveDown(2)
    signLine('Firma del estudiante')
    signLine('Firma del representante')
    signLine('Firma del DECE / Autoridad')

    doc.end()
  })
}
