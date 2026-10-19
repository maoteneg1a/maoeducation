import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return 'Ocurrió un error inesperado'
}

/**
 * Fecha de HOY en la zona horaria local, formato YYYY-MM-DD.
 * No usar `new Date().toISOString()` para esto: está en UTC y en Ecuador
 * (UTC-5) devuelve la fecha de mañana a partir de las 19:00.
 */
export function todayLocalISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Date-only fields (e.g. @db.Date in Prisma) come back as UTC midnight.
// Parsing with `new Date(isoString)` shifts them back 5h in UTC-5, showing
// the previous day. We extract YYYY-MM-DD and build a local Date instead.
export function formatDate(date: string | Date): string {
  const iso = typeof date === 'string' ? date : date.toISOString()
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(y, m - 1, d))
}

/**
 * Convierte un color hex (#rrggbb) a la cadena HSL "H S% L%" que usan las
 * variables CSS del theme (sin la función hsl()). Devuelve null si es inválido.
 */
export function hexToHsl(hex: string): string | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  const r = parseInt(m[1], 16) / 255
  const g = parseInt(m[2], 16) / 255
  const b = parseInt(m[3], 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h /= 6
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/** Convierte la cadena HSL "H S% L%" a hex #rrggbb (para inputs de color). */
export function hslToHex(hsl: string): string | null {
  const m = /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/.exec(hsl.trim())
  if (!m) return null
  const h = parseFloat(m[1]) / 360
  const s = parseFloat(m[2]) / 100
  const l = parseFloat(m[3]) / 100
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r: number
  let g: number
  let b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x: number) =>
    Math.round(x * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}
