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
      const logoW = 48
      const logoY = doc.y
      // El logo se dibuja con posicionamiento absoluto y NO avanza el cursor
      // — antes se asumía una altura fija (moveDown(3)) que no cubre logos con
      // proporción distinta a la asumida (ej. escudos más altos que anchos),
      // dejando el título superpuesto sobre la parte baja del logo. Se calcula
      // la altura real vía getImageSize (mismo aspect ratio que usa doc.image
      // al recibir solo `width`) y se posiciona el cursor exactamente donde
      // termina el logo, con un margen de separación fijo.
      const { width: naturalW, height: naturalH } = getImageSize(doc, logoSrc)
      const logoH = naturalW > 0 ? (logoW * naturalH) / naturalW : logoW
      doc.image(logoSrc, pageW / 2 - logoW / 2, logoY, { width: logoW })
      doc.y = logoY + logoH + 10
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

/**
 * Encabezado con logo a la izquierda y el nombre de la institución centrado
 * en el resto del ancho — usado por los PDFs de refuerzo pedagógico y de
 * proyecto interdisciplinario. Devuelve el cursor Y en el punto donde el
 * contenido siguiente puede empezar sin solaparse con el logo.
 *
 * Antes cada servicio dibujaba el logo con `width` fijo y avanzaba el cursor
 * con el `doc.y` de ANTES de dibujar el logo (el texto se posiciona junto al
 * logo, no debajo, así que en teoría no se solapan entre sí) — pero nada
 * verificaba que la línea divisoria/contenido siguiente, que sí usa
 * `doc.moveDown()` desde ese mismo punto, quedara por debajo del logo si este
 * es más alto que el texto (logos no cuadrados, ej. escudos verticales).
 */
export function drawLeftLogoHeader(
  doc: Doc,
  logoSrc: Buffer | string | null,
  institutionName: string,
  x0: number,
  fullWidth: number,
): void {
  const logoW = logoSrc ? 40 : 0
  const startY = doc.y
  let logoBottom = startY
  if (logoSrc) {
    try {
      const { width: naturalW, height: naturalH } = getImageSize(doc, logoSrc)
      const logoH = naturalW > 0 ? (logoW * naturalH) / naturalW : logoW
      doc.image(logoSrc, x0, startY, { width: logoW })
      logoBottom = startY + logoH
    } catch { /* logo inválido, se omite */ }
  }
  doc
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(institutionName.toUpperCase(), x0 + logoW + (logoSrc ? 10 : 0), startY, { width: fullWidth - logoW, align: 'center' })
  // El cursor queda en el mayor de: donde terminó el texto del nombre, o
  // donde termina el logo (si es más alto) — así el contenido siguiente
  // (línea divisoria, etc.) nunca arranca por encima del logo.
  doc.y = Math.max(doc.y, logoBottom)
}
