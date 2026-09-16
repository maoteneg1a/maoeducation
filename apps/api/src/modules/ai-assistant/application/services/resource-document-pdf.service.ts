import PDFDocument from 'pdfkit'
import { drawRow, ensureSpace, type Cell } from '../../../../shared/infrastructure/services/pdf-table-helpers'

export interface DocumentBlockParagraph {
  type: 'paragraph'
  text: string
}
export interface DocumentBlockNumberedLines {
  type: 'numbered_lines'
  count: number
}
export interface DocumentBlockTable {
  type: 'table'
  headers: string[]
  rows: number
}
export interface DocumentBlockBlankSpace {
  type: 'blank_space'
  label: string
}
export type DocumentBlock = DocumentBlockParagraph | DocumentBlockNumberedLines | DocumentBlockTable | DocumentBlockBlankSpace

export interface DocumentSpec {
  title: string
  instructions: string
  blocks: DocumentBlock[]
}

/**
 * Genera una ficha/organizador de trabajo simple (una página, tablas/líneas/recuadros)
 * a partir de una especificación que la IA de planificación devuelve cuando decide
 * que la actividad necesita un material propio en vez de solo texto (ej. "clasifica
 * estos animales en una tabla" en vez de únicamente describir la actividad).
 */
export function buildResourceDocumentPdf(spec: DocumentSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const x0 = doc.page.margins.left
    const fullWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right

    doc.font('Helvetica-Bold').fontSize(16).text(spec.title, { align: 'center' })
    doc.moveDown(0.5)
    doc.font('Helvetica').fontSize(11).text(spec.instructions, { width: fullWidth })
    doc.moveDown(1)

    for (const block of spec.blocks) {
      drawBlock(doc, x0, fullWidth, block)
      doc.moveDown(0.8)
    }

    doc.end()
  })
}

type Doc = InstanceType<typeof PDFDocument>

function drawBlock(doc: Doc, x0: number, fullWidth: number, block: DocumentBlock) {
  if (block.type === 'paragraph') {
    ensureSpace(doc, 20)
    doc.font('Helvetica').fontSize(11).text(block.text, { width: fullWidth })
    return
  }

  if (block.type === 'numbered_lines') {
    for (let i = 1; i <= block.count; i++) {
      ensureSpace(doc, 24)
      doc.font('Helvetica').fontSize(11).text(`${i}. `, x0, doc.y, { continued: false })
      doc
        .moveTo(x0 + 20, doc.y + 14)
        .lineTo(x0 + fullWidth, doc.y + 14)
        .lineWidth(0.5)
        .strokeColor('#999999')
        .stroke()
      doc.moveDown(1.3)
    }
    return
  }

  if (block.type === 'table') {
    const colW = fullWidth / block.headers.length
    drawRow(
      doc,
      x0,
      block.headers.map((h): Cell => ({ text: h, width: colW, bold: true, fill: '#f2f2f2', align: 'center', fontSize: 10 })),
    )
    for (let r = 0; r < block.rows; r++) {
      drawRow(
        doc,
        x0,
        block.headers.map((): Cell => ({ text: ' ', width: colW, fontSize: 10 })),
      )
    }
    return
  }

  if (block.type === 'blank_space') {
    const height = 140
    ensureSpace(doc, height + 20)
    const y = doc.y
    doc.lineWidth(1).strokeColor('#999999').dash(4, { space: 4 }).rect(x0, y, fullWidth, height).stroke()
    doc.undash()
    doc
      .font('Helvetica-Oblique')
      .fontSize(10)
      .fillColor('#666666')
      .text(block.label, x0, y + height / 2 - 6, { width: fullWidth, align: 'center' })
    doc.fillColor('#111111')
    doc.y = y + height
  }
}
