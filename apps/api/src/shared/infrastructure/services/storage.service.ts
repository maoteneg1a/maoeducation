import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3'

// Content-Type por extensión para la descarga de adjuntos.
export const CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.zip': 'application/zip',
}

/**
 * Almacenamiento de archivos con dos drivers:
 *  - "local": disco (apps/api/uploads/...). Útil en desarrollo. OJO: en hostings
 *    como Railway el disco es efímero y se borra en cada redeploy.
 *  - "s3": bucket S3‑compatible (Cloudflare R2, AWS S3). Persistente. Recomendado
 *    en producción.
 *
 * El driver se elige por env: STORAGE_DRIVER=s3 (o se infiere si hay S3_BUCKET).
 * Variables S3/R2 necesarias: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID,
 * S3_SECRET_ACCESS_KEY, (opcional) S3_REGION.
 */
const DRIVER: 'local' | 's3' =
  process.env.STORAGE_DRIVER === 's3' || (!process.env.STORAGE_DRIVER && process.env.S3_BUCKET)
    ? 's3'
    : 'local'

const LOCAL_ROOT = path.join(process.cwd(), 'uploads')
const BUCKET = process.env.S3_BUCKET ?? ''

let s3: S3Client | null = null
function getS3(): S3Client {
  if (!s3) {
    s3 = new S3Client({
      region: process.env.S3_REGION ?? 'auto',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      },
    })
  }
  return s3
}

/** Evita path traversal (../) en las claves recibidas por la ruta de descarga. */
function safeKey(key: string): string {
  return key.replace(/\\/g, '/').split('/').filter((s) => s && s !== '.' && s !== '..').join('/')
}

export const storage = {
  driver: DRIVER,

  /** Guarda un archivo bajo `key` (p.ej. "tasks/uuid.pdf"). */
  async save(key: string, body: Buffer, contentType?: string): Promise<void> {
    const k = safeKey(key)
    if (DRIVER === 's3') {
      await getS3().send(
        new PutObjectCommand({ Bucket: BUCKET, Key: k, Body: body, ContentType: contentType }),
      )
    } else {
      const full = path.join(LOCAL_ROOT, k)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, body)
    }
  },

  /** Borra el archivo (idempotente: no falla si no existe). */
  async remove(key: string): Promise<void> {
    const k = safeKey(key)
    if (DRIVER === 's3') {
      await getS3().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: k }))
    } else {
      const full = path.join(LOCAL_ROOT, k)
      if (fs.existsSync(full)) fs.unlinkSync(full)
    }
  },

  /** Devuelve un stream para descargar, o null si no existe. */
  async getStream(key: string): Promise<Readable | null> {
    const k = safeKey(key)
    if (DRIVER === 's3') {
      try {
        const out = await getS3().send(new GetObjectCommand({ Bucket: BUCKET, Key: k }))
        return (out.Body as Readable) ?? null
      } catch {
        return null
      }
    }
    const full = path.join(LOCAL_ROOT, k)
    if (!fs.existsSync(full)) return null
    return fs.createReadStream(full)
  },
}
