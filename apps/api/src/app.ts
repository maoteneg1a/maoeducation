import path from 'path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import compress from '@fastify/compress'
import rateLimit from '@fastify/rate-limit'
import fp from 'fastify-plugin'
import { env } from './config/env'
import { errorPlugin } from './shared/infrastructure/plugins/error.plugin'
import { registerRoutes } from './shared/infrastructure/routes'
import { storage, CONTENT_TYPES } from './shared/infrastructure/services/storage.service'
import type { Prisma } from '@prisma/client'
import { audit, redactSecrets } from './shared/infrastructure/services/audit.service'

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
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : env.NODE_ENV === 'production',
  })

  // Security
  app.register(helmet, { contentSecurityPolicy: false })

  // Rate limiting global por IP (generoso: un colegio comparte IP por NAT).
  // Rutas sensibles (login, IA) definen límites más estrictos en config.rateLimit.
  app.register(rateLimit, {
    global: true,
    max: 1200,
    timeWindow: '1 minute',
    allowList: (req) => req.url === '/health',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: {
        code: 'RATE_LIMITED',
        message: `Demasiadas solicitudes. Intenta de nuevo en ${Math.ceil(ctx.ttl / 1000)} s.`,
      },
    }),
  })

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

  // Descarga pública de archivos NO sensibles (recursos PDF generados por la IA
  // embebidos en planificaciones). Los adjuntos privados (tareas, mensajes,
  // incidentes) se sirven por /api/v1/files/* con autenticación; el resto de
  // carpetas (comprobantes, firmas, comunicados) tienen rutas dedicadas.
  const PUBLIC_UPLOAD_PREFIXES = ['planning-resources/']
  app.get<{ Params: { '*': string } }>('/uploads/*', async (req, reply) => {
    const key = req.params['*']
    if (!PUBLIC_UPLOAD_PREFIXES.some((p) => key.startsWith(p)) || key.includes('..')) {
      return reply.status(404).send({ message: 'Archivo no encontrado' })
    }
    const stream = await storage.getStream(key)
    if (!stream) return reply.status(404).send({ message: 'Archivo no encontrado' })
    reply.header('Content-Type', CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream')
    reply.header('Cache-Control', 'public, max-age=86400')
    return reply.send(stream)
  })

  // Toda escritura hecha durante una suplantación queda auditada (quién, qué ruta, resultado).
  app.addHook('onResponse', async (req, reply) => {
    const user = (req as { user?: { impersonatedBy?: string } }).user
    if (!user?.impersonatedBy || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
    await audit(req, {
      action: 'impersonation.request',
      resourceType: 'http_request',
      newValue: { method: req.method, url: req.routeOptions?.url ?? req.url, statusCode: reply.statusCode },
    })
  })

  // Toda acción de escritura del superadmin (consola /platform) queda auditada
  // con la ruta, los parámetros y el body (sin contraseñas).
  app.addHook('onResponse', async (req, reply) => {
    const platformAdmin = (req as { platformAdmin?: { sub: string } }).platformAdmin
    if (!platformAdmin || req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return
    if (reply.statusCode >= 400) return
    const route = req.routeOptions?.url ?? req.url
    const params = (req.params ?? {}) as Record<string, string>
    const institutionId =
      route.startsWith('/api/v1/platform/institutions/:id') ? params.id
        : route.startsWith('/api/v1/platform/subscriptions/:institutionId') ? params.institutionId
          : null
    await audit(req, {
      action: `platform.${req.method.toLowerCase()} ${route.replace('/api/v1/platform/', '')}`.slice(0, 100),
      resourceType: 'platform_action',
      resourceId: params.userId ?? params.subjectId ?? params.id ?? params.institutionId ?? null,
      institutionId,
      newValue: { params, body: redactSecrets(req.body) } as Prisma.InputJsonValue,
    })
  })

  // Error handler global
  app.register(fp(errorPlugin))

  // Rutas
  app.register(registerRoutes)

  return app
}
