import type { FastifyInstance } from 'fastify'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import { isPrivilegedStaff } from '../../../shared/infrastructure/services/teacher-scope.service'
import { sendPushToUser } from '../../../shared/infrastructure/services/push.service'

type Audience = 'all' | 'staff' | 'families' | 'parallels'

interface CreateAnnouncementBody {
  title: string
  body: string
  eventAt?: string | null
  location?: string | null
  priority?: 'normal' | 'important'
  audience?: Audience
  parallelIds?: string[]
  expiresAt?: string | null
}

const STAFF_ROLES = ['admin', 'rector', 'teacher', 'inspector', 'dece']

async function userParallelIds(userId: string, institutionId: string, roles: string[]) {
  if (roles.includes('student')) {
    const rows = await prisma.studentEnrollment.findMany({
      where: { institutionId, studentId: userId, status: 'active' },
      select: { parallelId: true },
    })
    return rows.map((row) => row.parallelId)
  }
  if (roles.includes('guardian')) {
    const links = await prisma.guardianStudent.findMany({
      where: { guardianId: userId },
      select: {
        student: {
          select: {
            studentEnrollments: {
              where: { institutionId, status: 'active' },
              select: { parallelId: true },
            },
          },
        },
      },
    })
    return links.flatMap((link) => link.student.studentEnrollments.map((row) => row.parallelId))
  }
  return []
}

async function recipientsFor(
  institutionId: string,
  audience: Audience,
  parallelIds: string[],
) {
  if (audience === 'all') {
    return prisma.user.findMany({ where: { institutionId, isActive: true }, select: { id: true } })
  }
  if (audience === 'staff') {
    return prisma.user.findMany({
      where: { institutionId, isActive: true, userRoles: { some: { role: { name: { in: STAFF_ROLES } } } } },
      select: { id: true },
    })
  }
  if (audience === 'families') {
    return prisma.user.findMany({
      where: { institutionId, isActive: true, userRoles: { some: { role: { name: { in: ['student', 'guardian'] } } } } },
      select: { id: true },
    })
  }
  const enrollments = await prisma.studentEnrollment.findMany({
    where: { institutionId, parallelId: { in: parallelIds }, status: 'active' },
    select: {
      studentId: true,
      student: { select: { studentGuardians: { select: { guardianId: true } } } },
    },
  })
  const ids = new Set(enrollments.flatMap((row) => [
    row.studentId,
    ...row.student.studentGuardians.map((link) => link.guardianId),
  ]))
  return [...ids].map((id) => ({ id }))
}

export default async function announcementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/announcements', async (req, reply) => {
    const { institutionId, sub, roles } = req.user
    const now = new Date()
    const rows = await prisma.announcement.findMany({
      where: {
        institutionId,
        publishedAt: { lte: now },
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      include: { creator: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    })
    rows.sort((a, b) => Number(b.priority === 'important') - Number(a.priority === 'important'))
    if (isPrivilegedStaff(roles)) return reply.send(rows)

    const parallels = await userParallelIds(sub, institutionId, roles)
    const visible = rows.filter((row) => {
      if (row.audience === 'all') return true
      if (row.audience === 'staff') return roles.some((role) => STAFF_ROLES.includes(role))
      if (row.audience === 'families') return roles.includes('student') || roles.includes('guardian')
      const targets = Array.isArray(row.parallelIds) ? row.parallelIds.filter((id): id is string => typeof id === 'string') : []
      return targets.some((id) => parallels.includes(id))
    })
    return reply.send(visible)
  })

  app.post<{ Body: CreateAnnouncementBody }>('/announcements', async (req, reply) => {
    const { institutionId, sub, roles } = req.user
    if (!isPrivilegedStaff(roles)) throw new ForbiddenError('Solo autoridades pueden publicar avisos')
    const title = req.body.title?.trim()
    const body = req.body.body?.trim()
    if (!title || !body) throw new BadRequestError('Título y descripción son obligatorios')
    const audience = req.body.audience ?? 'all'
    if (!['all', 'staff', 'families', 'parallels'].includes(audience)) throw new BadRequestError('Audiencia inválida')
    const parallelIds = [...new Set(req.body.parallelIds ?? [])]
    if (audience === 'parallels' && parallelIds.length === 0) throw new BadRequestError('Selecciona al menos un paralelo')
    if (parallelIds.length) {
      const count = await prisma.parallel.count({ where: { institutionId, id: { in: parallelIds } } })
      if (count !== parallelIds.length) throw new BadRequestError('Uno de los paralelos no pertenece a la institución')
    }
    const announcement = await prisma.announcement.create({
      data: {
        institutionId,
        createdBy: sub,
        title,
        body,
        eventAt: req.body.eventAt ? new Date(req.body.eventAt) : null,
        location: req.body.location?.trim() || null,
        priority: req.body.priority === 'important' ? 'important' : 'normal',
        audience,
        parallelIds,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      },
    })
    const recipients = await recipientsFor(institutionId, audience, parallelIds)
    await Promise.allSettled(recipients
      .filter((recipient) => recipient.id !== sub)
      .map((recipient) => sendPushToUser(recipient.id, {
        title: `${announcement.priority === 'important' ? 'Aviso importante' : 'Nuevo aviso'} — Auleka`,
        body: announcement.title,
        url: '/announcements',
      })))
    return reply.status(201).send(announcement)
  })

  app.delete<{ Params: { id: string } }>('/announcements/:id', async (req, reply) => {
    if (!isPrivilegedStaff(req.user.roles)) throw new ForbiddenError('Solo autoridades pueden eliminar avisos')
    const row = await prisma.announcement.findFirst({ where: { id: req.params.id, institutionId: req.user.institutionId } })
    if (!row) throw new NotFoundError('Aviso no encontrado')
    await prisma.announcement.delete({ where: { id: row.id } })
    return reply.status(204).send()
  })
}
