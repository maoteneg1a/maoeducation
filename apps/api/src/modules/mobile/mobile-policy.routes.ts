import type { FastifyInstance } from 'fastify'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { nativePushEnabled } from './native-push'

type Platform = 'android' | 'ios'
type Release = { build: number; url: string }

function buildNumber(value: string | undefined) {
  if (!value || !/^[1-9]\d*$/.test(value)) return 0
  const number = Number(value)
  return Number.isSafeInteger(number) ? number : 0
}

function getRelease(platform: Platform, build: number, url: string | undefined): Release | null {
  if (!build || !url) return null
  try {
    const store = new URL(url)
    const host = platform === 'android' ? 'play.google.com' : 'apps.apple.com'
    if (store.protocol !== 'https:' || store.host !== host || store.username || store.password) return null
    return { build, url: store.href }
  } catch {
    return null
  }
}

export function resolveMobilePolicy(
  platform: Platform,
  clientBuild: number,
  env: Record<string, string | undefined> = process.env,
) {
  const key = `MOBILE_${platform.toUpperCase()}_`
  const published = getRelease(platform, buildNumber(env[key + 'PUBLISHED_BUILD']), env[key + 'STORE_URL'])
  const minimum = buildNumber(env[key + 'MIN_BUILD'])
  const validMinimum = published && minimum <= published.build ? minimum : 0
  const maintenance = env[key + 'MAINTENANCE'] === 'true'
  const features = { nativePush: false }
  if (maintenance) return { status: 'maintenance', release: null, features } as const
  if (published && clientBuild < validMinimum) return { status: 'update_required', release: published, features } as const
  if (published && clientBuild < published.build) return { status: 'update_available', release: published, features } as const
  return { status: 'ready', release: null, features } as const
}

export default async function mobilePolicyRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { platform?: string; build?: string } }>('/mobile/policy', async (req, reply) => {
    reply.header('Cache-Control', 'no-store')
    const { platform, build } = req.query
    const number = buildNumber(build)
    if ((platform !== 'android' && platform !== 'ios') || !number) {
      return reply.code(400).send({ message: 'Plataforma o compilación inválida' })
    }
    return resolveMobilePolicy(platform, number)
  })
  app.get('/mobile/features', { preHandler: authMiddleware }, async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store')
    const institution = await prisma.institution.findUnique({
      where: { id: req.user.institutionId },
      select: { settings: true },
    })
    const family = req.user.roles.some(role => role === 'guardian' || role === 'student')
    return { nativePush: family && nativePushEnabled(institution?.settings) && !!process.env.FCM_SERVICE_ACCOUNT_JSON }
  })
  const deviceBody = {
    type: 'object', required: ['token'], additionalProperties: false,
    properties: { token: { type: 'string', minLength: 20, maxLength: 2048, pattern: '^[A-Za-z0-9_:-]+$' } },
  }
  app.post<{ Body: { token: string } }>('/mobile/push/register', {
    preHandler: authMiddleware, schema: { body: deviceBody },
  }, async (req, reply) => {
    const institution = await prisma.institution.findUnique({ where: { id: req.user.institutionId }, select: { settings: true } })
    if (!nativePushEnabled(institution?.settings) || !process.env.FCM_SERVICE_ACCOUNT_JSON ||
        !req.user.roles.some(role => role === 'guardian' || role === 'student')) return reply.code(403).send()
    const token = req.body.token
    const userId = req.user.sub
    await prisma.nativePushDevice.upsert({ where: { token }, update: { userId }, create: { token, userId } })
    return reply.code(204).send()
  })
  app.post<{ Body: { token: string } }>('/mobile/push/unregister', {
    preHandler: authMiddleware, schema: { body: deviceBody },
  }, async (req, reply) => {
    await prisma.nativePushDevice.deleteMany({ where: { token: req.body.token, userId: req.user.sub } })
    return reply.code(204).send()
  })
  app.patch<{ Body: { nativePush: boolean } }>('/mobile/features', {
    preHandler: [authMiddleware, requirePermission('institution_config', 'manage')],
    schema: {
      body: {
        type: 'object',
        required: ['nativePush'],
        additionalProperties: false,
        properties: { nativePush: { type: 'boolean' } },
      },
    },
  }, async (req, reply) => {
    const mobile = JSON.stringify({ nativePush: req.body.nativePush })
    await prisma.$executeRaw`
      UPDATE institutions
      SET settings = jsonb_set(
        settings,
        '{mobile}',
        COALESCE(settings->'mobile', '{}'::jsonb) || ${mobile}::jsonb
      )
      WHERE id = ${req.user.institutionId}
    `
    return reply.header('Cache-Control', 'no-store').send({ nativePush: req.body.nativePush })
  })
}
