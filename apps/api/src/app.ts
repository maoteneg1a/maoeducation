import path from 'path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import compress from '@fastify/compress'
import fp from 'fastify-plugin'
import { env } from './config/env'
import { errorPlugin } from './shared/infrastructure/plugins/error.plugin'
import { registerRoutes } from './shared/infrastructure/routes'
import { storage } from './shared/infrastructure/services/storage.service'

// Content-Type por extensión para la descarga de adjuntos.
const CONTENT_TYPES: Record<string, string> = {
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

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
          : undefined,
    },
    genReqId: () => crypto.randomUUID(),
  })

  // Security
  app.register(helmet, { contentSecurityPolicy: false })

  // Compresión de respuestas (gzip/brotli). Reduce el tamaño del JSON ~70-80%,
  // baja el costo de egress y mejora la latencia. Solo comprime respuestas
  // > 1 KB para no malgastar CPU en payloads pequeños.
  app.register(compress, { global: true, threshold: 1024 })

  // CORS — en producción, allowlist de orígenes (landing + app).
  // CORS_ORIGINS="https://auleka.com,https://app.auleka.com" (cae en FRONTEND_URL si no está).
  const allowedOrigins = (env.CORS_ORIGINS ?? env.FRONTEND_URL ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  app.register(cors, {
    origin: env.NODE_ENV === 'development' ? true : allowedOrigins,
    credentials: true,
  })

  // Cookies (para refresh token)
  app.register(cookie, {
    secret: env.JWT_REFRESH_SECRET,
  })

  // File uploads (max 10 MB)
  app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } })

  // Descarga de adjuntos. Una sola ruta que sirve tanto desde disco (dev) como
  // desde el bucket S3/R2 (prod), según el driver de storage. Reemplaza al
  // servido estático para que el frontend no cambie sus URLs (/uploads/...).
  app.get<{ Params: { '*': string } }>('/uploads/*', async (req, reply) => {
    const key = req.params['*']
    const stream = await storage.getStream(key)
    if (!stream) return reply.status(404).send({ message: 'Archivo no encontrado' })
    reply.header('Content-Type', CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(stream)
  })

  // Error handler global
  app.register(fp(errorPlugin))

  // Rutas
  app.register(registerRoutes)

  return app
}
