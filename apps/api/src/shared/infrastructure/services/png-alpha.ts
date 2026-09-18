import zlib from 'zlib'

/**
 * `docx` (librería usada por microcurricular-docx.service.ts para el Word) no
 * expone un control de opacidad real sobre `ImageRun` — `createBlip` (interno
 * de la librería) nunca emite `<a:alphaModFix>` ni ningún efecto de
 * transparencia DrawingML, así que pasar `watermarkOpacity` tal cual no hace
 * nada visible en el documento generado.
 *
 * Word/Office resuelven esto para SU PROPIA función nativa de "Marca de agua"
 * con la misma técnica que aplicamos aquí: en vez de transparencia real,
 * ACLARAN (washout) los colores de la imagen hacia blanco proporcionalmente a
 * la opacidad deseada — a mayor aclarado, más "transparente" se percibe sobre
 * el fondo blanco de la página. No requiere agregar/tocar un canal alfa ni
 * ninguna librería de imagen nueva (`sharp`/`jimp` no son dependencias de
 * `apps/api`, solo transitivas inalcanzables de otro workspace) — se
 * implementa con el decoder/encoder PNG mínimo de abajo + `zlib` nativo de
 * Node (`inflateSync`/`deflateSync`/`crc32`, disponibles en Node 20).
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface DecodedPng {
  width: number
  height: number
  bitDepth: number
  colorType: number
  /** Bytes por pixel (canales × 1 byte, solo bitDepth 8 soportado). */
  bpp: number
  /** Scanlines sin filtrar, concatenadas (sin el byte de filtro inicial de cada fila). */
  raw: Buffer
}

function channelsForColorType(colorType: number): number | null {
  switch (colorType) {
    case 0:
      return 1 // grayscale
    case 2:
      return 3 // RGB
    case 3:
      return 1 // paleta — 1 byte de índice por pixel, resuelto contra PLTE/tRNS después de defiltrar
    case 4:
      return 2 // grayscale + alpha
    case 6:
      return 4 // RGBA
    default:
      return null
  }
}

/**
 * Expande scanlines de índices de paleta (colorType 3, 1 byte/pixel) a RGBA
 * (4 bytes/pixel) resolviendo cada índice contra `PLTE` (color) y `tRNS`
 * (alfa por índice, si el chunk existe — si no, todo opaco). Este es el caso
 * REAL más probable detrás del bug reportado ("marca de agua con fondo negro
 * sólido, opaca, tapando la tabla"): escudos/logos institucionales exportados
 * como PNG indexado son comunes (paletas de pocos colores), y ANTES de este
 * fix `decodePng` lanzaba `unsupported colorType 3` para cualquiera de ellos
 * — `applyPngWashout` atrapaba esa excepción y devolvía el buffer ORIGINAL
 * sin aclarar, así que `buildWatermarkImage` embebía el logo real, a opacidad
 * completa, con el fondo que sea que tenga la paleta en su índice de fondo
 * (frecuentemente negro) — exactamente la imagen opaca de fondo negro tapando
 * contenido que describen las 3 capturas reales.
 */
function expandPaletteToRgba(indices: Buffer, plte: Buffer, trns: Buffer | null): Buffer {
  const paletteSize = Math.floor(plte.length / 3)
  const rgba = Buffer.alloc(indices.length * 4)
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i]
    const safeIdx = idx < paletteSize ? idx : 0
    const p = safeIdx * 3
    rgba[i * 4] = plte[p]
    rgba[i * 4 + 1] = plte[p + 1]
    rgba[i * 4 + 2] = plte[p + 2]
    rgba[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255
  }
  return rgba
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** Decodifica un PNG a scanlines sin filtro — soporta solo bitDepth=8, sin interlace. Lanza si el formato no es soportado (paleta, bitDepth≠8, interlace Adam7, chunks corruptos). */
function decodePng(buffer: Buffer): DecodedPng {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG')

  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
  let plte: Buffer | null = null
  let trns: Buffer | null = null
  const idatChunks: Buffer[] = []

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('ascii', offset + 4, offset + 8)
    const dataStart = offset + 8
    const data = buffer.subarray(dataStart, dataStart + length)

    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data.readUInt8(8)
      colorType = data.readUInt8(9)
      interlace = data.readUInt8(12)
    } else if (type === 'PLTE') {
      plte = Buffer.from(data)
    } else if (type === 'tRNS') {
      trns = Buffer.from(data)
    } else if (type === 'IDAT') {
      idatChunks.push(data)
    } else if (type === 'IEND') {
      break
    }

    offset = dataStart + length + 4 // salta CRC
  }

  if (bitDepth !== 8) throw new Error(`unsupported bitDepth ${bitDepth}`)
  if (interlace !== 0) throw new Error('interlaced PNG not supported')
  const channels = channelsForColorType(colorType)
  if (channels === null) throw new Error(`unsupported colorType ${colorType}`)
  if (colorType === 3 && !plte) throw new Error('paletted PNG without PLTE')
  if (idatChunks.length === 0) throw new Error('no IDAT data')

  const compressed = Buffer.concat(idatChunks)
  const inflated = zlib.inflateSync(compressed)

  const bpp = channels // bitDepth 8 → 1 byte por canal
  const stride = width * bpp
  const raw = Buffer.alloc(height * stride)

  let pos = 0
  const prevRow = Buffer.alloc(stride)
  for (let y = 0; y < height; y++) {
    const filterType = inflated[pos]
    pos += 1
    const rowStart = pos
    const outRowOffset = y * stride
    for (let x = 0; x < stride; x++) {
      const raw_x = inflated[rowStart + x]
      const a = x >= bpp ? raw[outRowOffset + x - bpp] : 0
      const b = y > 0 ? prevRow[x] : 0
      const c = y > 0 && x >= bpp ? prevRow[x - bpp] : 0
      let value: number
      switch (filterType) {
        case 0:
          value = raw_x
          break
        case 1:
          value = (raw_x + a) & 0xff
          break
        case 2:
          value = (raw_x + b) & 0xff
          break
        case 3:
          value = (raw_x + Math.floor((a + b) / 2)) & 0xff
          break
        case 4:
          value = (raw_x + paethPredictor(a, b, c)) & 0xff
          break
        default:
          throw new Error(`unsupported filter type ${filterType}`)
      }
      raw[outRowOffset + x] = value
    }
    raw.copy(prevRow, 0, outRowOffset, outRowOffset + stride)
    pos = rowStart + stride
  }

  // colorType 3 (paleta): `raw` en este punto son ÍNDICES de paleta (1
  // byte/pixel), no colores — el washout de más abajo asume que cada byte de
  // `raw` es directamente un canal de color/alfa (0-255 aclarable hacia
  // blanco). Sin esta expansión, "aclarar" un índice de paleta no aclara
  // nada visualmente (el índice se re-mapea a un color totalmente distinto o
  // fuera de rango de la paleta) y, más grave: el índice de fondo transparente
  // de un logo (tRNS) se pierde del todo, así que el color de paleta en ESE
  // índice (frecuentemente negro, color de "relleno" habitual al exportar
  // logos con fondo transparente) queda opaco — la causa raíz más probable
  // del bug reportado ("marca de agua con fondo negro sólido tapando la
  // tabla"). Se expande aquí a RGBA real (colorType 6) para que el resto del
  // pipeline (washout + encode) opere sobre colores/alfa reales.
  if (colorType === 3) {
    const rgba = expandPaletteToRgba(raw, plte as Buffer, trns)
    return { width, height, bitDepth, colorType: 6, bpp: 4, raw: rgba }
  }

  return { width, height, bitDepth, colorType, bpp, raw }
}

function crc32Chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, 'ascii')
  const combined = Buffer.concat([typeBuf, data])
  const crc = zlib.crc32(combined)
  const chunk = Buffer.alloc(8 + data.length + 4)
  chunk.writeUInt32BE(data.length, 0)
  typeBuf.copy(chunk, 4)
  data.copy(chunk, 8)
  chunk.writeUInt32BE(crc >>> 0, 8 + data.length)
  return chunk
}

/** Re-encodea scanlines (sin filtro, todas con filtro None=0) a un PNG completo válido, reusando ancho/alto/bitDepth/colorType del original. */
function encodePng(decoded: DecodedPng): Buffer {
  const { width, height, bitDepth, colorType, bpp, raw } = decoded
  const stride = width * bpp
  const filtered = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    filtered[y * (stride + 1)] = 0 // filtro None
    raw.copy(filtered, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  const compressed = zlib.deflateSync(filtered)

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(bitDepth, 8)
  ihdr.writeUInt8(colorType, 9)
  ihdr.writeUInt8(0, 10) // compression
  ihdr.writeUInt8(0, 11) // filter
  ihdr.writeUInt8(0, 12) // interlace

  return Buffer.concat([
    PNG_SIGNATURE,
    crc32Chunk('IHDR', ihdr),
    crc32Chunk('IDAT', compressed),
    crc32Chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Aclara (washout) los canales de color de un PNG hacia blanco, proporcional a
 * `opacity` (0 = blanco total/invisible, 1 = sin cambios) — misma técnica que
 * usa Word nativamente para sus marcas de agua. Si el PNG usa un formato no
 * soportado (bitDepth≠8, interlace) o el buffer no es un PNG válido, devuelve
 * el buffer original sin modificar — mismo criterio de "mejor esfuerzo" que el
 * resto de este servicio ante logos/assets con formatos inesperados.
 *
 * CASO CON CANAL ALFA (colorType 4/6, o paleta con tRNS ya expandida a RGBA
 * por `decodePng`): antes de este fix, el alfa se preservaba "sin tocar" en
 * el PNG de salida, asumiendo que el renderer que abre el .docx compone esa
 * transparencia contra el fondo de la página igual que Python/Pillow (con lo
 * que se verificó el PR anterior). El bug real reportado con 3 capturas de
 * producción (marca de agua con FONDO NEGRO SÓLIDO, opaca, en primer plano,
 * tapando la celda "Grado/Curso") muestra que eso no es cierto para el motor
 * de renderizado real: los píxeles con alfa=0 de un logo con fondo
 * "transparente" (RGB de relleno frecuentemente (0,0,0), un artefacto común
 * de exportación) terminan pintados con su color de relleno a opacidad total
 * en vez de mostrarse en blanco/transparente — el canal alfa se pierde o se
 * interpreta mal más adelante en el pipeline (Word/convertidor), no aquí.
 *
 * El fix: en vez de confiar en que algo más adelante respete el alfa,
 * COMPONEMOS aquí mismo cada píxel contra blanco usando su propio alfa como
 * parte de la opacidad final (`visibility = (alpha/255) * opacity`) y
 * devolvemos un PNG SIEMPRE opaco (sin canal alfa) — un píxel totalmente
 * transparente (alfa=0) queda blanco puro sin importar su RGB original, y uno
 * parcialmente transparente se aclara proporcionalmente más. Así el resultado
 * es correcto sin depender de que el visor final soporte alfa en absoluto.
 */
export function applyPngWashout(buffer: Buffer, opacity: number): Buffer {
  const clamped = Math.max(0, Math.min(1, opacity))
  if (clamped >= 1) return buffer
  try {
    const decoded = decodePng(buffer)
    const hasAlpha = decoded.colorType === 4 || decoded.colorType === 6
    const colorChannels = hasAlpha ? decoded.bpp - 1 : decoded.bpp
    const raw = decoded.raw

    if (!hasAlpha) {
      for (let i = 0; i < raw.length; i += decoded.bpp) {
        for (let c = 0; c < colorChannels; c++) {
          raw[i + c] = Math.round(raw[i + c] * clamped + 255 * (1 - clamped))
        }
      }
      return encodePng(decoded)
    }

    const outBpp = colorChannels
    const pixelCount = raw.length / decoded.bpp
    const outRaw = Buffer.alloc(pixelCount * outBpp)
    for (let i = 0, o = 0; i < raw.length; i += decoded.bpp, o += outBpp) {
      const alpha = raw[i + colorChannels] / 255
      const visibility = alpha * clamped
      for (let c = 0; c < colorChannels; c++) {
        outRaw[o + c] = Math.round(raw[i + c] * visibility + 255 * (1 - visibility))
      }
    }
    const outColorType = colorChannels === 1 ? 0 : 2 // grayscale u RGB, siempre sin alfa (salida opaca)
    return encodePng({ width: decoded.width, height: decoded.height, bitDepth: decoded.bitDepth, colorType: outColorType, bpp: outBpp, raw: outRaw })
  } catch {
    return buffer
  }
}
