import type PDFKit from 'pdfkit'
import { drawWatermark, resolveLogo } from '../../../shared/infrastructure/services/pdf-helpers'
import { boardConfig } from '../domain/course-board-config'
import type { BoardSnapshot } from '../domain/course-board.types'

type Doc = InstanceType<typeof PDFKit>
export const documentStyle = (snapshot: BoardSnapshot) => boardConfig({ courseBoards: snapshot.config })

/** Se dibuja antes del contenido de cada página, también en los cambios de orientación. */
export function installBoardWatermark(doc: Doc, snapshot: BoardSnapshot) {
  const style = documentStyle(snapshot)
  if (!style.watermarkEnabled) return
  const logo = resolveLogo(snapshot.logoUrl)
  function paint() {
    const { x, y } = doc
    drawWatermark(doc, logo, style.watermarkOpacity)
    doc.x = x; doc.y = y
  }
  paint()
  doc.on('pageAdded', paint)
}
