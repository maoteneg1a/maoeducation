import { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { platformAuthMiddleware } from '../../shared/infrastructure/middleware/platform-auth.middleware'
import { ForbiddenError } from '../../shared/domain/errors/app.errors'

interface AuditQuery {
  page?: number
  pageSize?: number
  action?: string
  resourceType?: string
  userId?: string
  institutionId?: string
  from?: string
  to?: string
}

const querySchema = {
  type: 'object',
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
    action: { type: 'string', maxLength: 100 },
    resourceType: { type: 'string', maxLength: 100 },
    userId: { type: 'string' },
    institutionId: { type: 'string' },
    from: { type: 'string', format: 'date' },
    to: { type: 'string', format: 'date' },
  },
} as const

function buildWhere(q: AuditQuery, institutionId?: string): Prisma.AuditLogWhereInput {
  return {
    ...(institutionId ? { institutionId } : q.institutionId ? { institutionId: q.institutionId } : {}),
    ...(q.action ? { action: { contains: q.action, mode: 'insensitive' } } : {}),
    ...(q.resourceType ? { resourceType: q.resourceType } : {}),
    ...(q.userId ? { userId: q.userId } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(`${q.from}T00:00:00`) } : {}),
            ...(q.to ? { lte: new Date(`${q.to}T23:59:59.999`) } : {}),
          },
        }
      : {}),
  }
}

async function list(q: AuditQuery, institutionId?: string) {
  const page = q.page ?? 1
  const pageSize = q.pageSize ?? 25
  const where = buildWhere(q, institutionId)
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { institution: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ])

  // Nombres legibles de los actores (no hay relación FK en audit_logs a propósito).
  const userIds = [...new Set(rows.flatMap((r) => (r.userId ? [r.userId] : [])))]
  const adminIds = [...new Set(rows.flatMap((r) => [r.platformAdminId, r.impersonatorId].filter((x): x is string => !!x)))]
  const [users, admins] = await Promise.all([
    userIds.length
      ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, profile: { select: { firstName: true, lastName: true } } } })
      : [],
    adminIds.length ? prisma.platformAdmin.findMany({ where: { id: { in: adminIds } }, select: { id: true, email: true } }) : [],
  ])
  const userName = new Map(users.map((u) => [u.id, u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email]))
  const adminName = new Map(admins.map((a) => [a.id, a.email]))

  return {
    data: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      action: r.action,
      resourceType: r.resourceType,
      resourceId: r.resourceId,
      institutionId: r.institutionId,
      institutionName: r.institution?.name ?? null,
      actor: r.userId ? userName.get(r.userId) ?? r.userId : r.platformAdminId ? `Superadmin · ${adminName.get(r.platformAdminId) ?? ''}` : 'Sistema',
      impersonatedBy: r.impersonatorId ? adminName.get(r.impersonatorId) ?? r.impersonatorId : null,
      oldValue: r.oldValue,
      newValue: r.newValue,
      ipAddress: r.ipAddress,
    })),
    total,
    page,
    pageSize,
  }
}

export default async function auditRoutes(app: FastifyInstance) {
  // Bitácora de la institución: solo administración (admin/rector).
  app.get<{ Querystring: AuditQuery }>(
    '/audit-logs',
    { preHandler: [authMiddleware], schema: { querystring: querySchema } },
    async (req) => {
      const { roles, institutionId } = req.user
      if (!roles.includes('admin') && !roles.includes('rector')) throw new ForbiddenError()
      return list(req.query, institutionId)
    },
  )

  // Bitácora global para el superadmin (filtrable por institución).
  app.get<{ Querystring: AuditQuery }>(
    '/platform/audit-logs',
    { preHandler: [platformAuthMiddleware], schema: { querystring: querySchema } },
    async (req) => list(req.query),
  )
}
