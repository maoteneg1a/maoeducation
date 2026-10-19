import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { platformAuthMiddleware, requirePlatformRole } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { BadRequestError, ConflictError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import { computeSubscriptionStatus } from '../../subscription/domain/subscription-state'

const DAY_MS = 86_400_000

/**
 * Consola de plataforma: ficha 360° por institución, notas de soporte, límites
 * de plan, equipo de plataforma, avisos a instituciones y alertas operativas.
 */
export default async function platformConsoleRoutes(app: FastifyInstance) {
  const auth = [platformAuthMiddleware]

  // ─── Ficha 360° de una institución ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>('/platform/institutions/:id/overview', { preHandler: auth }, async (req) => {
    const id = req.params.id
    const institution = await prisma.institution.findUnique({
      where: { id },
      select: { id: true, name: true, code: true, isActive: true, createdAt: true, settings: true },
    })
    if (!institution) throw new NotFoundError('Institución no encontrada')

    const since30 = new Date(Date.now() - 30 * DAY_MS)
    const [
      activeYear,
      students,
      teachers,
      totalUsers,
      activeUsers30d,
      lastLogin,
      parallels,
      grades30d,
      attendance30d,
      subscription,
      payments,
      admins,
      notes,
      recentAudit,
    ] = await Promise.all([
      prisma.academicYear.findFirst({ where: { institutionId: id, isActive: true }, select: { id: true, name: true } }),
      prisma.studentEnrollment.count({ where: { institutionId: id, status: 'active', academicYear: { isActive: true } } }),
      prisma.userRole.count({ where: { user: { institutionId: id, isActive: true }, role: { name: 'teacher', institutionId: id } } }),
      prisma.user.count({ where: { institutionId: id, isActive: true } }),
      prisma.user.count({ where: { institutionId: id, lastLoginAt: { gte: since30 } } }),
      prisma.user.findFirst({ where: { institutionId: id, lastLoginAt: { not: null } }, orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true } }),
      prisma.parallel.count({ where: { institutionId: id, academicYear: { isActive: true } } }),
      prisma.grade.count({ where: { institutionId: id, updatedAt: { gte: since30 } } }),
      prisma.attendanceRecord.count({ where: { institutionId: id, date: { gte: since30 } } }),
      prisma.subscription.findUnique({ where: { institutionId: id } }),
      prisma.subscriptionPayment.findMany({
        where: { institutionId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, status: true, amount: true, createdAt: true, reviewedAt: true, reviewNotes: true, reference: true },
      }),
      prisma.user.findMany({
        where: { institutionId: id, userRoles: { some: { role: { name: { in: ['admin', 'rector'] } } } } },
        select: { id: true, email: true, isActive: true, lastLoginAt: true, profile: { select: { firstName: true, lastName: true } } },
        take: 10,
      }),
      prisma.institutionNote.findMany({ where: { institutionId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.auditLog.findMany({
        where: { institutionId: id, NOT: { action: { startsWith: 'ai.' } } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, action: true, createdAt: true, userId: true, platformAdminId: true },
      }),
    ])

    const noteAuthors = await prisma.platformAdmin.findMany({
      where: { id: { in: [...new Set(notes.map((n) => n.platformAdminId))] } },
      select: { id: true, name: true, email: true },
    })
    const authorName = new Map(noteAuthors.map((a) => [a.id, a.name || a.email]))
    const settings = (institution.settings ?? {}) as { modules?: string[]; accountType?: string; isTestInstitution?: boolean }

    return {
      institution: {
        id: institution.id,
        name: institution.name,
        code: institution.code,
        isActive: institution.isActive,
        createdAt: institution.createdAt,
        accountType: settings.accountType === 'personal' ? 'personal' : 'school',
        isTestInstitution: settings.isTestInstitution ?? false,
        modules: settings.modules ?? null,
      },
      usage: {
        activeYear: activeYear?.name ?? null,
        students,
        teachers,
        totalUsers,
        activeUsers30d,
        lastActivityAt: lastLogin?.lastLoginAt ?? null,
        parallels,
        grades30d,
        attendance30d,
      },
      subscription: subscription
        ? {
            ...computeSubscriptionStatus(subscription),
            notes: subscription.notes,
            maxStudents: subscription.maxStudents,
            maxTeachers: subscription.maxTeachers,
          }
        : null,
      payments: payments.map((p) => ({ ...p, amount: p.amount == null ? null : Number(p.amount) })),
      admins: admins.map((a) => ({
        id: a.id,
        email: a.email,
        isActive: a.isActive,
        lastLoginAt: a.lastLoginAt,
        fullName: a.profile ? `${a.profile.firstName} ${a.profile.lastName}` : a.email,
      })),
      notes: notes.map((n) => ({ id: n.id, body: n.body, createdAt: n.createdAt, author: authorName.get(n.platformAdminId) ?? '—' })),
      recentActivity: recentAudit,
    }
  })

  // ─── Notas de soporte ──────────────────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: { body: string } }>(
    '/platform/institutions/:id/notes',
    {
      preHandler: [...auth, requirePlatformRole('support', 'billing')],
      schema: { body: { type: 'object', required: ['body'], properties: { body: { type: 'string', minLength: 1, maxLength: 5000 } } } },
    },
    async (req, reply) => {
      const exists = await prisma.institution.findUnique({ where: { id: req.params.id }, select: { id: true } })
      if (!exists) throw new NotFoundError('Institución no encontrada')
      const note = await prisma.institutionNote.create({
        data: { institutionId: req.params.id, platformAdminId: req.platformAdmin.sub, body: req.body.body.trim() },
      })
      return reply.status(201).send(note)
    },
  )

  app.delete<{ Params: { id: string; noteId: string } }>(
    '/platform/institutions/:id/notes/:noteId',
    { preHandler: [...auth, requirePlatformRole('support', 'billing')] },
    async (req, reply) => {
      const res = await prisma.institutionNote.deleteMany({ where: { id: req.params.noteId, institutionId: req.params.id } })
      if (res.count === 0) throw new NotFoundError('Nota no encontrada')
      return reply.status(204).send()
    },
  )

  // ─── Límites del plan ──────────────────────────────────────────────────────
  app.put<{ Params: { institutionId: string }; Body: { maxStudents: number | null; maxTeachers: number | null } }>(
    '/platform/subscriptions/:institutionId/limits',
    {
      preHandler: [...auth, requirePlatformRole('billing')],
      schema: {
        body: {
          type: 'object',
          required: ['maxStudents', 'maxTeachers'],
          properties: {
            maxStudents: { type: ['integer', 'null'], minimum: 1, maximum: 100000 },
            maxTeachers: { type: ['integer', 'null'], minimum: 1, maximum: 10000 },
          },
        },
      },
    },
    async (req) => {
      const sub = await prisma.subscription.findUnique({ where: { institutionId: req.params.institutionId }, select: { id: true } })
      if (!sub) throw new ConflictError('La institución no tiene suscripción gestionada: fija primero una vigencia')
      return prisma.subscription.update({
        where: { id: sub.id },
        data: { maxStudents: req.body.maxStudents, maxTeachers: req.body.maxTeachers },
        select: { maxStudents: true, maxTeachers: true },
      })
    },
  )

  // ─── Equipo de plataforma ─────────────────────────────────────────────────
  const ownerOnly = [...auth, requirePlatformRole()]
  app.get('/platform/team', { preHandler: auth }, async () =>
    prisma.platformAdmin.findMany({
      orderBy: { createdAt: 'asc' },
      select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
    }),
  )

  app.post<{ Body: { email: string; name: string; role: string; password: string } }>(
    '/platform/team',
    {
      preHandler: ownerOnly,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'name', 'role', 'password'],
          properties: {
            email: { type: 'string', format: 'email', maxLength: 255 },
            name: { type: 'string', minLength: 1, maxLength: 150 },
            role: { type: 'string', enum: ['owner', 'support', 'billing'] },
            password: { type: 'string', minLength: 10, maxLength: 100 },
          },
        },
      },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase()
      if (await prisma.platformAdmin.findUnique({ where: { email }, select: { id: true } })) {
        throw new ConflictError('Ya existe un miembro con ese correo')
      }
      const created = await prisma.platformAdmin.create({
        data: { email, name: req.body.name.trim(), role: req.body.role, passwordHash: await bcrypt.hash(req.body.password, 12) },
        select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
      })
      return reply.status(201).send(created)
    },
  )

  app.patch<{ Params: { id: string }; Body: { role?: string; isActive?: boolean; name?: string } }>(
    '/platform/team/:id',
    {
      preHandler: ownerOnly,
      schema: {
        body: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['owner', 'support', 'billing'] },
            isActive: { type: 'boolean' },
            name: { type: 'string', minLength: 1, maxLength: 150 },
          },
        },
      },
    },
    async (req) => {
      if (req.params.id === req.platformAdmin.sub && (req.body.isActive === false || (req.body.role && req.body.role !== 'owner'))) {
        throw new BadRequestError('No puedes desactivarte ni quitarte el rol de owner a ti mismo')
      }
      const target = await prisma.platformAdmin.findUnique({ where: { id: req.params.id }, select: { id: true, role: true } })
      if (!target) throw new NotFoundError('Miembro no encontrado')
      // Siempre debe quedar al menos un owner activo.
      if (target.role === 'owner' && (req.body.isActive === false || (req.body.role && req.body.role !== 'owner'))) {
        const owners = await prisma.platformAdmin.count({ where: { role: 'owner', isActive: true } })
        if (owners <= 1) throw new BadRequestError('Debe quedar al menos un owner activo')
      }
      return prisma.platformAdmin.update({
        where: { id: target.id },
        data: { role: req.body.role, isActive: req.body.isActive, name: req.body.name?.trim() },
        select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
      })
    },
  )

  // ─── Avisos de plataforma a las instituciones ──────────────────────────────
  app.get('/platform/announcements', { preHandler: auth }, async () =>
    prisma.platformAnnouncement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }),
  )

  app.post<{ Body: { title: string; body: string; level?: string; audience?: string; startsAt?: string; endsAt?: string | null } }>(
    '/platform/announcements',
    {
      preHandler: [...auth, requirePlatformRole('support')],
      schema: {
        body: {
          type: 'object',
          required: ['title', 'body'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 200 },
            body: { type: 'string', minLength: 1, maxLength: 5000 },
            level: { type: 'string', enum: ['info', 'warning', 'critical'] },
            audience: { type: 'string', enum: ['all', 'admins'] },
            startsAt: { type: 'string', format: 'date-time' },
            endsAt: { type: ['string', 'null'], format: 'date-time' },
          },
        },
      },
    },
    async (req, reply) => {
      const startsAt = req.body.startsAt ? new Date(req.body.startsAt) : new Date()
      const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null
      if (endsAt && endsAt <= startsAt) throw new BadRequestError('La fecha de fin debe ser posterior al inicio')
      const created = await prisma.platformAnnouncement.create({
        data: {
          title: req.body.title.trim(),
          body: req.body.body.trim(),
          level: req.body.level ?? 'info',
          audience: req.body.audience ?? 'all',
          startsAt,
          endsAt,
          createdBy: req.platformAdmin.sub,
        },
      })
      return reply.status(201).send(created)
    },
  )

  app.delete<{ Params: { id: string } }>(
    '/platform/announcements/:id',
    { preHandler: [...auth, requirePlatformRole('support')] },
    async (req, reply) => {
      await prisma.platformAnnouncement.deleteMany({ where: { id: req.params.id } })
      return reply.status(204).send()
    },
  )

  // Lo que ve la institución: avisos vigentes (banner en la app).
  app.get('/platform-announcements/active', { preHandler: [authMiddleware] }, async (req) => {
    const now = new Date()
    const isAdmin = req.user.roles.includes('admin') || req.user.roles.includes('rector')
    return prisma.platformAnnouncement.findMany({
      where: {
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        audience: { in: isAdmin ? ['all', 'admins'] : ['all'] },
      },
      orderBy: { startsAt: 'desc' },
      take: 3,
      select: { id: true, title: true, body: true, level: true, startsAt: true },
    })
  })

  // ─── Alertas operativas ────────────────────────────────────────────────────
  app.get('/platform/alerts', { preHandler: auth }, async () => {
    const now = new Date()
    const in14 = new Date(now.getTime() + 14 * DAY_MS)
    const since30 = new Date(now.getTime() - 30 * DAY_MS)
    const [expiring, pendingPayments, institutions, recentLogins, openLeads] = await Promise.all([
      prisma.subscription.findMany({
        where: { suspendedAt: null, expiresAt: { gte: now, lte: in14 } },
        orderBy: { expiresAt: 'asc' },
        select: { institutionId: true, expiresAt: true, plan: true, institution: { select: { name: true } } },
      }),
      prisma.subscriptionPayment.count({ where: { status: 'pending' } }),
      prisma.institution.findMany({ where: { isActive: true }, select: { id: true, name: true, createdAt: true, settings: true } }),
      prisma.user.groupBy({ by: ['institutionId'], where: { lastLoginAt: { gte: since30 } }, _count: { _all: true } }),
      prisma.lead.count({ where: { OR: [{ status: 'new' }, { nextFollowUpAt: { lte: now }, status: { notIn: ['closed_won', 'closed_lost'] } }] } }),
    ])
    const active = new Set(recentLogins.map((r) => r.institutionId))
    const inactive = institutions
      .filter((i) => !active.has(i.id) && (i.settings as { accountType?: string } | null)?.accountType !== 'personal')
      .filter((i) => i.createdAt < since30)
      .map((i) => ({ id: i.id, name: i.name }))
    return {
      expiringSoon: expiring.map((e) => ({ institutionId: e.institutionId, name: e.institution.name, expiresAt: e.expiresAt, plan: e.plan })),
      pendingPayments,
      inactiveInstitutions: inactive.slice(0, 20),
      inactiveCount: inactive.length,
      leadsToFollowUp: openLeads,
    }
  })
}
