import path from 'path'
import fs from 'fs'
import type PDFKit from 'pdfkit'

type Doc = InstanceType<typeof PDFKit>

/** Convierte logoUrl (data URI o /uploads/...) a algo que PDFKit puede embeber. */
export function resolveLogo(logoUrl: string | null | undefined): Buffer | string | null {
  if (!logoUrl) return null
  const dm = /^data:[^;]+;base64,(.+)$/.exec(logoUrl)
  if (dm) {
    try { return Buffer.from(dm[1], 'base64') } catch { return null }
  }
  const m = /\/uploads\/(.+)$/.exec(logoUrl)
  if (!m) return null
  const p = path.join(process.cwd(), 'uploads', m[1])
  return fs.existsSync(p) ? p : null
}

/**
 * Devuelve el tamaño real (en px) de una imagen que PDFKit puede embeber.
 * `doc.openImage()` existe en tiempo de ejecución (ver pdfkit.js) pero no está
 * declarado en @types/pdfkit — por eso el cast a `any`, centralizado aquí para
 * no repetirlo en cada lugar que necesita el aspect ratio real de un logo/banner.
 */
export function getImageSize(doc: Doc, src: Buffer | string): { width: number; height: number } {
  const image = (doc as unknown as { openImage: (s: Buffer | string) => { width: number; height: number } }).openImage(src)
  return { width: image.width, height: image.height }
}

/**
 * Dibuja el encabezado estándar: logo centrado arriba, nombre de la institución
 * en mayúsculas y título del documento. Deja el cursor listo para el contenido.
 */
export function drawHeader(
  doc: Doc,
  logoSrc: Buffer | string | null,
  institutionName: string,
  title: string,
): void {
  const pageW = doc.page.width
  const margin = doc.page.margins.left

  if (logoSrc) {
    try {
      doc.image(logoSrc, pageW / 2 - 24, doc.y, { width: 48 })
      doc.moveDown(3)
    } catch { /* logo inválido, se omite */ }
  }

  doc.fontSize(14).font('Helvetica-Bold').text(institutionName.toUpperCase(), { align: 'center' })
  doc.moveDown(0.3)
  doc.fontSize(12).text(title, { align: 'center' })
  doc.moveDown(0.5)

  // Línea divisoria sutil
  doc
    .moveTo(margin, doc.y)
    .lineTo(pageW - margin, doc.y)
    .strokeColor('#cccccc')
    .lineWidth(0.5)
    .stroke()
  doc.strokeColor('black').lineWidth(1)
  doc.moveDown(0.8)
}

/**
 * Dibuja el logo como marca de agua centrada en la página actual, con la
 * opacidad indicada (0 a 1, configurable por institución). Llamar antes o
 * después del contenido — usa posicionamiento absoluto y no altera el cursor.
 *
 * IMPORTANTE: nunca fijar `width` y `height` a la vez en `doc.image()` — PDFKit
 * solo mantiene la proporción original cuando se especifica un solo eje (ver
 * `image()` en pdfkit.js: si ambos vienen dados, dibuja exactamente esas
 * dimensiones sin calcular aspect ratio, estirando/deformando el logo si no es
 * cuadrado). Por eso aquí se consulta `doc.openImage()` para obtener el tamaño
 * real del asset y se escala manteniendo proporción dentro de una caja máxima
 * `maxSize`×`maxSize` (el lado más largo se ajusta a `maxSize`, el otro se
 * deriva proporcionalmente) — igual nunca se pasan ambos ejes a `doc.image()`.
 */
export function drawWatermark(doc: Doc, logoSrc: Buffer | string | null, opacity: number): void {
  if (!logoSrc || opacity <= 0) return
  const maxSize = 180
  try {
    const { width: naturalW, height: naturalH } = getImageSize(doc, logoSrc)
    const scale = Math.min(maxSize / naturalW, maxSize / naturalH)
    const w = naturalW * scale
    const h = naturalH * scale
    const x = (doc.page.width - w) / 2
    const y = (doc.page.height - h) / 2
    doc.save()
    doc.opacity(opacity)
    doc.image(logoSrc, x, y, { width: w })
    doc.restore()
  } catch { /* logo inválido, se omite */ }
}
