import { FastifyInstance } from 'fastify'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { platformAuthMiddleware, requirePlatformRole } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import { PrismaAuthUserRepository } from '../../auth/infrastructure/repositories/prisma-auth-user.repository'
import { ImpersonateUserUseCase, IMPERSONATION_TTL } from '../application/use-cases/impersonate-user.use-case'
import { audit } from '../../../shared/infrastructure/services/audit.service'

interface DailyCount {
  date: Date
  count: bigint
}

function toSeries(rows: DailyCount[]) {
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), count: Number(r.count) }))
}

const impersonateUseCase = new ImpersonateUserUseCase(new PrismaAuthUserRepository(), tokenService)

const REFRESH_COOKIE = 'refresh_token'
const REFRESH_COOKIE_PATH = '/api/v1/auth'

export default async function platformStatsRoutes(app: FastifyInstance) {
  const protectedOpts = { preHandler: [platformAuthMiddleware] }

  app.get('/platform/stats/overview', protectedOpts, async (_req, reply) => {
    const [
      totalInstitutions,
      totalPersonalAccounts,
      totalUsers,
      totalLeads,
      leadsByStatus,
      institutionSignups,
      userSignups,
      pageViewsTotal,
      pageViewSeries,
      topPages,
    ] = await Promise.all([
      prisma.institution.count(),
      prisma.institution.count({ where: { settings: { path: ['accountType'], equals: 'personal' } } }),
      prisma.user.count(),
      prisma.lead.count(),
      prisma.lead.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.$queryRaw<DailyCount[]>`
        SELECT date_trunc('day', created_at) AS date, count(*)::bigint AS count
        FROM institutions
        WHERE created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      `,
      prisma.$queryRaw<DailyCount[]>`
        SELECT date_trunc('day', created_at) AS date, count(*)::bigint AS count
        FROM users
        WHERE created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      `,
      prisma.pageView.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.$queryRaw<DailyCount[]>`
        SELECT date_trunc('day', created_at) AS date, count(*)::bigint AS count
        FROM page_views
        WHERE created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      `,
      prisma.pageView.groupBy({
        by: ['path'],
        _count: { _all: true },
        orderBy: { _count: { path: 'desc' } },
        take: 10,
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
    ])

    return reply.send({
      institutions: { total: totalInstitutions, personal: totalPersonalAccounts, schools: totalInstitutions - totalPersonalAccounts },
      users: { total: totalUsers },
      leads: {
        total: totalLeads,
        byStatus: leadsByStatus.map((l) => ({ status: l.status, count: l._count._all })),
      },
      signups: {
        institutions: toSeries(institutionSignups),
        users: toSeries(userSignups),
      },
      pageViews: {
        total30d: pageViewsTotal,
        series: toSeries(pageViewSeries),
        topPages: topPages.map((p) => ({ path: p.path, count: p._count._all })),
      },
    })
  })

  app.get<{ Querystring: { page?: number; limit?: number; search?: string } }>(
    '/platform/users',
    {
      ...protectedOpts,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page: { type: 'integer', minimum: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200 },
            search: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const page = req.query.page ?? 1
      const limit = req.query.limit ?? 20
      const skip = (page - 1) * limit
      const search = req.query.search

      const where = search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { profile: { firstName: { contains: search, mode: 'insensitive' as const } } },
              { profile: { lastName: { contains: search, mode: 'insensitive' as const } } },
              { institution: { name: { contains: search, mode: 'insensitive' as const } } },
            ],
          }
        : {}

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            profile: true,
            institution: { select: { id: true, name: true, settings: true } },
            userRoles: { include: { role: true } },
          },
        }),
        prisma.user.count({ where }),
      ])

      return reply.send({
        data: users.map((u) => ({
          id: u.id,
          email: u.email,
          isActive: u.isActive,
          fullName: u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email,
          roles: u.userRoles.map((ur) => ur.role.name),
          institutionId: u.institution.id,
          institutionName: u.institution.name,
          accountType: (u.institution.settings as Record<string, unknown>)?.accountType === 'personal' ? 'personal' : 'school',
          createdAt: u.createdAt,
        })),
        total,
      })
    },
  )

  app.post<{ Params: { id: string } }>(
    '/platform/users/:id/impersonate',
    { preHandler: [platformAuthMiddleware, requirePlatformRole('support')] },
    async (req, reply) => {
      const result = await impersonateUseCase.execute(req.params.id, req.platformAdmin.sub)
      await audit(req, {
        action: 'platform.impersonate',
        resourceType: 'user',
        resourceId: req.params.id,
        institutionId: result.user.institutionId,
        newValue: { email: result.user.email, roles: result.user.roles },
      })
      // Sin refresh token: se borra cualquier cookie previa del tenant para que,
      // al vencer el token de suplantación, no se "reviva" otra sesión.
      reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH })
      return reply.send({ accessToken: result.accessToken, user: result.user, impersonation: { expiresIn: IMPERSONATION_TTL } })
    },
  )
}
