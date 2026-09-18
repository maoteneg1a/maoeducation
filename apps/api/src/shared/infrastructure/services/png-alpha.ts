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
    case 4:
      return 2 // grayscale + alpha
    case 6:
      return 4 // RGBA
    default:
      return null // 3 = paleta, no soportado
  }
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
 * usa Word nativamente para sus marcas de agua. El canal alfa (si existe) se
 * preserva sin tocar. Si el PNG usa un formato no soportado (paleta,
 * bitDepth≠8, interlace) o el buffer no es un PNG válido, devuelve el buffer
 * original sin modificar — mismo criterio de "mejor esfuerzo" que el resto de
 * este servicio ante logos/assets con formatos inesperados.
 */
export function applyPngWashout(buffer: Buffer, opacity: number): Buffer {
  const clamped = Math.max(0, Math.min(1, opacity))
  if (clamped >= 1) return buffer
  try {
    const decoded = decodePng(buffer)
    const colorChannels = decoded.colorType === 4 || decoded.colorType === 6 ? decoded.bpp - 1 : decoded.bpp
    const raw = decoded.raw
    for (let i = 0; i < raw.length; i += decoded.bpp) {
      for (let c = 0; c < colorChannels; c++) {
        raw[i + c] = Math.round(raw[i + c] * clamped + 255 * (1 - clamped))
      }
    }
    return encodePng(decoded)
  } catch {
    return buffer
  }
}
