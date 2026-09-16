import { z } from 'zod'

const schema = z.object({
  NODE_ENV:             z.enum(['development', 'test', 'production']).default('development'),
  PORT:                 z.coerce.number().default(3000),
  DATABASE_URL:         z.string().url(),
  JWT_SECRET:           z.string().min(32),
  JWT_REFRESH_SECRET:   z.string().min(32),
  JWT_ACCESS_EXPIRES:   z.string().default('15m'),
  JWT_REFRESH_EXPIRES:  z.string().default('7d'),
  LOG_LEVEL:            z.string().default('info'),
  FRONTEND_URL:         z.string().url().optional(),
  // Orígenes permitidos por CORS en producción, separados por coma.
  // Ej: "https://auleka.com,https://app.auleka.com"
  CORS_ORIGINS:         z.string().optional(),
  // Web Push (VAPID) — opcionales: si no están configuradas las notificaciones push se deshabilitan
  VAPID_PUBLIC_KEY:     z.string().optional(),
  VAPID_PRIVATE_KEY:    z.string().optional(),
  VAPID_SUBJECT:        z.string().default('mailto:hola@auleka.com'),
  RESEND_API_KEY:       z.string().optional(),
  APP_URL:              z.string().default('https://app.auleka.com'),
  // URL pública de ESTA API (no la del frontend) — se usa para construir links
  // absolutos a /uploads/* embebidos en texto (ej. recursos generados por la IA
  // de planificación), que deben funcionar fuera de la app (compartidos, impresos).
  API_PUBLIC_URL:       z.string().default('http://localhost:3000'),
  // Asistente IA de planificaciones (Claude) — opcional: sin esta key el asistente
  // se deshabilita automáticamente, el resto del módulo de planificación sigue intacto.
  ANTHROPIC_API_KEY:    z.string().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment variables:')
  console.error(parsed.error.flatten().fieldErrors)
  process.exit(1)
}

export const env = parsed.data
