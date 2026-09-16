import PDFDocument from 'pdfkit'
import { resolveLogo, drawHeader, drawWatermark } from '../../../../shared/infrastructure/services/pdf-helpers'

export interface EnrollmentCertificatePdfData {
  institutionName: string
  logoUrl: string | null
  studentName: string
  studentDni: string | null
  levelName: string
  parallelName: string
  yearName: string
  enrolledAt: Date
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  withdrawn: 'Retirado',
  transferred: 'Trasladado',
}

function fmtDate(d: Date | null): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'long', year: 'numeric' }).format(d)
}

/** Genera el certificado de matrícula y lo devuelve como Buffer. */
export function buildEnrollmentCertificatePdf(data: EnrollmentCertificatePdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const logo = resolveLogo(data.logoUrl)
    drawWatermark(doc, logo, 0.07)
    drawHeader(doc, logo, data.institutionName, 'CERTIFICADO DE MATRÍCULA')
    doc.moveDown(0.5)

    // Cuerpo
    doc.fontSize(11).font('Helvetica')
    doc.text(
      'La institución educativa certifica que el/la estudiante se encuentra matriculado/a según el siguiente detalle:',
      { align: 'justify' },
    )
    doc.moveDown(1.2)

    const row = (label: string, value: string) => {
      doc.font('Helvetica-Bold').fontSize(11).text(`${label}: `, { continued: true })
      doc.font('Helvetica').text(value || '—')
      doc.moveDown(0.2)
    }
    row('Estudiante', data.studentName)
    row('Cédula', data.studentDni ?? '—')
    row('Nivel', data.levelName)
    row('Paralelo', data.parallelName)
    row('Año lectivo', data.yearName)
    row('Fecha de matrícula', fmtDate(data.enrolledAt))
    row('Estado', STATUS_LABELS[data.status] ?? data.status)

    doc.moveDown(2)
    doc.fontSize(10).text(`Se expide el presente certificado a los ${fmtDate(new Date())}.`, {
      align: 'justify',
    })

    // Firma
    doc.moveDown(5)
    doc.fontSize(10).text('_______________________________', { align: 'center' })
    doc.text('Secretaría / Rectorado', { align: 'center' })

    doc.end()
  })
}
