import { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
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

interface AcademicDailyCount {
  date: Date
  attendance: bigint
  grades: bigint
  activities: bigint
}

interface InstitutionActivityCount {
  institutionId: string
  name: string
  attendance: bigint
  grades: bigint
  activities: bigint
  total: bigint
}

function toSeries(rows: DailyCount[]) {
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), count: Number(r.count) }))
}

function toAcademicSeries(rows: AcademicDailyCount[]) {
  return rows.map((r) => ({
    date: r.date.toISOString().slice(0, 10),
    attendance: Number(r.attendance),
    grades: Number(r.grades),
    activities: Number(r.activities),
  }))
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
      attendance30d,
      grades30d,
      activities30d,
      activeInstitutions30d,
      academicSeries,
      topActiveInstitutions,
      uniqueVisitors30d,
      errors7d,
      errors30d,
      errorSeries,
      topErrorRoutes,
      recentErrors,
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
      prisma.attendanceRecord.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.grade.count({ where: { gradedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.activity.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(DISTINCT institution_id)::bigint AS count
        FROM (
          SELECT institution_id FROM attendance_records WHERE created_at >= now() - interval '30 days'
          UNION ALL
          SELECT institution_id FROM grades WHERE graded_at >= now() - interval '30 days'
          UNION ALL
          SELECT institution_id FROM activities WHERE created_at >= now() - interval '30 days'
        ) activity
      `,
      prisma.$queryRaw<AcademicDailyCount[]>`
        SELECT date,
               sum(attendance)::bigint AS attendance,
               sum(grades)::bigint AS grades,
               sum(activities)::bigint AS activities
        FROM (
          SELECT date_trunc('day', created_at) AS date, count(*) AS attendance, 0 AS grades, 0 AS activities
          FROM attendance_records WHERE created_at >= now() - interval '30 days' GROUP BY 1
          UNION ALL
          SELECT date_trunc('day', graded_at) AS date, 0, count(*), 0
          FROM grades WHERE graded_at >= now() - interval '30 days' GROUP BY 1
          UNION ALL
          SELECT date_trunc('day', created_at) AS date, 0, 0, count(*)
          FROM activities WHERE created_at >= now() - interval '30 days' GROUP BY 1
        ) daily_activity
        GROUP BY date ORDER BY date
      `,
      prisma.$queryRaw<InstitutionActivityCount[]>`
        SELECT i.id AS "institutionId", i.name,
               sum(activity.attendance)::bigint AS attendance,
               sum(activity.grades)::bigint AS grades,
               sum(activity.activities)::bigint AS activities,
               sum(activity.attendance + activity.grades + activity.activities)::bigint AS total
        FROM institutions i
        JOIN (
          SELECT institution_id, count(*) AS attendance, 0 AS grades, 0 AS activities
          FROM attendance_records WHERE created_at >= now() - interval '30 days' GROUP BY institution_id
          UNION ALL
          SELECT institution_id, 0, count(*), 0
          FROM grades WHERE graded_at >= now() - interval '30 days' GROUP BY institution_id
          UNION ALL
          SELECT institution_id, 0, 0, count(*)
          FROM activities WHERE created_at >= now() - interval '30 days' GROUP BY institution_id
        ) activity ON activity.institution_id = i.id
        GROUP BY i.id, i.name ORDER BY total DESC LIMIT 10
      `,
      prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(DISTINCT visitor_id)::bigint AS count
        FROM page_views
        WHERE created_at >= now() - interval '30 days' AND visitor_id IS NOT NULL
      `,
      prisma.platformError.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } }),
      prisma.platformError.count({ where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
      prisma.$queryRaw<DailyCount[]>`
        SELECT date_trunc('day', created_at) AS date, count(*)::bigint AS count
        FROM platform_errors
        WHERE created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 1
      `,
      prisma.platformError.groupBy({
        by: ['route'],
        _count: { _all: true },
        orderBy: { _count: { route: 'desc' } },
        take: 8,
        where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.platformError.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { institution: { select: { name: true } } },
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
      academicActivity: {
        periodDays: 30,
        attendance: attendance30d,
        grades: grades30d,
        activities: activities30d,
        total: attendance30d + grades30d + activities30d,
        activeInstitutions: Number(activeInstitutions30d[0]?.count ?? 0),
        series: toAcademicSeries(academicSeries),
        topInstitutions: topActiveInstitutions.map((i) => ({
          institutionId: i.institutionId,
          name: i.name,
          attendance: Number(i.attendance),
          grades: Number(i.grades),
          activities: Number(i.activities),
          total: Number(i.total),
        })),
      },
      pageViews: {
        total30d: pageViewsTotal,
        uniqueVisitors30d: Number(uniqueVisitors30d[0]?.count ?? 0),
        series: toSeries(pageViewSeries),
        topPages: topPages.map((p) => ({ path: p.path, count: p._count._all })),
      },
      errors: {
        total7d: errors7d,
        total30d: errors30d,
        series: toSeries(errorSeries),
        topRoutes: topErrorRoutes.map((item) => ({ route: item.route, count: item._count._all })),
        recent: recentErrors.map((item) => ({
          id: item.id,
          code: item.code,
          message: item.message,
          method: item.method,
          route: item.route,
          institutionName: item.institution?.name ?? null,
          createdAt: item.createdAt,
        })),
      },
    })
  })

  app.get<{ Querystring: { institutionId?: string; page?: number; limit?: number; search?: string } }>(
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
            institutionId: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const page = req.query.page ?? 1
      const limit = req.query.limit ?? 20
      const skip = (page - 1) * limit
      const search = req.query.search

      const where: Prisma.UserWhereInput = {
        institutionId: req.query.institutionId,
        ...(search ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { profile: { firstName: { contains: search, mode: 'insensitive' as const } } },
            { profile: { lastName: { contains: search, mode: 'insensitive' as const } } },
            { institution: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        } : {}),
      }

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
