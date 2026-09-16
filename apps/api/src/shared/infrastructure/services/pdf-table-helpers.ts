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
  /** Color del texto — por defecto casi-negro. Usar blanco sobre un `fill` oscuro (ej. encabezado ESTRATEGIAS/RECURSOS/EVALUACIÓN calcado de TIGA: fondo azul marino, texto blanco). */
  textColor?: string
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
      .fillColor(cell.textColor ?? '#111111')
      .text(cell.text, x + 4, y + 4, { width: cell.width - 8, align: cell.align ?? 'left' })
    doc.fillColor('#111111')
    x += cell.width
  }
  doc.y = y + rowHeight
  return rowHeight
}

// ─── Flujo multi-columna con salto de página consistente ───────────────────
// Para contenido que no cabe en una sola fila simple (ej. la tabla semanal de
// 3 columnas ESTRATEGIAS/RECURSOS/EVALUACIÓN del formato CNC/TIGA, con listas
// largas de actividades) — cada columna es una lista de bloques de altura
// variable que se dibujan en paralelo. Si el conjunto no cabe en la página
// actual, se corta ahí (nunca a la mitad de un bloque individual) y continúa
// en una página nueva CON LOS MISMOS anchos/posiciones de columna — nunca
// reinicia el layout.

export interface FlowBlock {
  height: number
  draw: (doc: Doc, x: number, y: number, width: number) => void
}

export interface FlowColumn {
  x: number
  width: number
  blocks: FlowBlock[]
}

/**
 * `drawHeaderBand` dibuja el encabezado de columnas (repetido en cada página
 * nueva donde continúa el contenido) y debe devolver la altura dibujada.
 */
export function drawFlowRow(doc: Doc, columns: FlowColumn[], drawHeaderBand: () => number): void {
  const bottom = () => doc.page.height - doc.page.margins.bottom
  const cursors = columns.map(() => 0)

  while (cursors.some((c, i) => c < columns[i].blocks.length)) {
    const startY = doc.y
    const colYs = columns.map(() => startY)
    let progressed = false

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      while (cursors[i] < col.blocks.length) {
        const block = col.blocks[cursors[i]]
        if (colYs[i] + block.height > bottom() && colYs[i] > startY) break
        block.draw(doc, col.x, colYs[i], col.width)
        colYs[i] += block.height
        cursors[i]++
        progressed = true
      }
    }

    const chunkHeight = Math.max(...colYs.map((y) => y - startY), 1)
    for (const col of columns) {
      doc.lineWidth(0.75).strokeColor('#333333').rect(col.x, startY, col.width, chunkHeight).stroke()
    }
    doc.y = startY + chunkHeight

    const pending = cursors.some((c, i) => c < columns[i].blocks.length)
    if (pending) {
      doc.addPage()
      doc.y = doc.page.margins.top
      drawHeaderBand()
      if (!progressed) {
        // Ni un solo bloque cupo en una página completa (bloque anormalmente
        // alto) — se fuerza su dibujo para nunca quedar en loop infinito.
        const forcedY = doc.y
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i]
          if (cursors[i] < col.blocks.length) {
            const block = col.blocks[cursors[i]]
            block.draw(doc, col.x, forcedY, col.width)
            cursors[i]++
          }
        }
        doc.y = forcedY + Math.max(...columns.map((c) => c.blocks[0]?.height ?? 0), 1)
      }
    }
  }
}

/** Ancho de una cadena con la fuente/tamaño dados — sin mutar el estado de fuente actual del doc más de lo necesario. */
export function measureTextWidth(doc: Doc, text: string, opts: { bold?: boolean; fontSize?: number } = {}): number {
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.fontSize ?? 8.5)
  return doc.widthOfString(text)
}

/** Badge de color de fondo + texto encima (ej. código DUA resaltado) — devuelve el ancho ocupado. */
export function drawBadge(
  doc: Doc,
  x: number,
  y: number,
  text: string,
  opts: { fill: string; fontSize?: number; padding?: number },
): number {
  const fontSize = opts.fontSize ?? 7.5
  const padding = opts.padding ?? 3
  doc.font('Helvetica-Bold').fontSize(fontSize)
  const textWidth = doc.widthOfString(text)
  const height = fontSize + padding
  const width = textWidth + padding * 2
  doc.save().fillColor(opts.fill).rect(x, y, width, height).fill().restore()
  doc
    .fillColor('#111111')
    .font('Helvetica-Bold')
    .fontSize(fontSize)
    .text(text, x + padding, y + padding / 2, { lineBreak: false })
  doc.fillColor('#111111')
  return width
}
