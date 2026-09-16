import PDFDocument from 'pdfkit'

type Doc = InstanceType<typeof PDFDocument>

/** Motor mínimo de tablas para PDFKit — celdas con borde real, altura auto-calculada
 * por texto. Compartido entre cualquier documento del sistema que necesite tablas
 * (Planificación Microcurricular, fichas de recursos generadas por la IA, etc.). */

export interface Cell {
  text: string
  width: number
  bold?: boolean
  fill?: string
  align?: 'left' | 'center'
  fontSize?: number
}

export function cellHeight(doc: Doc, cell: Cell): number {
  doc.font(cell.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(cell.fontSize ?? 8.5)
  const h = doc.heightOfString(cell.text || ' ', { width: cell.width - 8 })
  return Math.max(h + 8, 18)
}

export function ensureSpace(doc: Doc, needed: number) {
  const bottom = doc.page.height - doc.page.margins.bottom
  if (doc.y + needed > bottom) doc.addPage()
}

/** Dibuja una fila de celdas con borde, ajustando la altura a la celda más alta. */
export function drawRow(doc: Doc, x0: number, cells: Cell[]): number {
  const rowHeight = Math.max(...cells.map((c) => cellHeight(doc, c)))
  ensureSpace(doc, rowHeight + 2)
  const y = doc.y
  let x = x0
  for (const cell of cells) {
    if (cell.fill) doc.save().fillColor(cell.fill).rect(x, y, cell.width, rowHeight).fill().restore()
    doc.lineWidth(0.75).strokeColor('#333333').rect(x, y, cell.width, rowHeight).stroke()
    doc
      .font(cell.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(cell.fontSize ?? 8.5)
      .fillColor('#111111')
      .text(cell.text, x + 4, y + 4, { width: cell.width - 8, align: cell.align ?? 'left' })
    x += cell.width
  }
  doc.y = y + rowHeight
  return rowHeight
}
