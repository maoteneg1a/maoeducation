import type { FastifyInstance } from 'fastify'
import crypto from 'node:crypto'
import path from 'node:path'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import { isPrivilegedStaff } from '../../../shared/infrastructure/services/teacher-scope.service'
import { sendPushToUser } from '../../../shared/infrastructure/services/push.service'
import { storage } from '../../../shared/infrastructure/services/storage.service'

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
const FLYER_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])
const MAX_FLYER_BYTES = 8 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

function targetParallelIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
}

function isVisibleToUser(
  row: { audience: string; parallelIds: unknown },
  roles: string[],
  parallels: string[],
) {
  if (row.audience === 'all') return true
  if (row.audience === 'staff') return roles.some((role) => STAFF_ROLES.includes(role))
  if (row.audience === 'families') return roles.includes('student') || roles.includes('guardian')
  return targetParallelIds(row.parallelIds).some((id) => parallels.includes(id))
}

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
      include: {
        creator: { select: { profile: { select: { firstName: true, lastName: true } } } },
        reads: { where: { userId: sub }, select: { readAt: true } },
      },
      orderBy: { publishedAt: 'desc' },
      take: 100,
    })
    rows.sort((a, b) => Number(b.priority === 'important') - Number(a.priority === 'important'))
    const parallels = await userParallelIds(sub, institutionId, roles)
    const visible = isPrivilegedStaff(roles) ? rows : rows.filter((row) => isVisibleToUser(row, roles, parallels))
    return reply.send(visible.map((row) => {
      const { reads, flyerStoredName: _flyerStoredName, attachmentStoredName: _attachmentStoredName, ...announcement } = row
      void _flyerStoredName
      void _attachmentStoredName
      return {
        ...announcement,
        isRead: reads.length > 0,
        readAt: reads[0]?.readAt ?? null,
        flyerUrl: row.flyerStoredName ? `/announcements/${row.id}/flyer` : null,
        attachmentUrl: row.attachmentStoredName ? `/announcements/${row.id}/attachment` : null,
      }
    }))
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
        url: `/announcements?notice=${announcement.id}`,
      })))
    return reply.status(201).send(announcement)
  })

  app.post<{ Params: { id: string } }>('/announcements/:id/read', async (req, reply) => {
    const row = await prisma.announcement.findFirst({
      where: { id: req.params.id, institutionId: req.user.institutionId },
    })
    if (!row) throw new NotFoundError('Aviso no encontrado')
    const parallels = await userParallelIds(req.user.sub, req.user.institutionId, req.user.roles)
    if (!isPrivilegedStaff(req.user.roles) && !isVisibleToUser(row, req.user.roles, parallels)) {
      throw new ForbiddenError('No tienes acceso a este aviso')
    }
    const read = await prisma.announcementRead.upsert({
      where: { announcementId_userId: { announcementId: row.id, userId: req.user.sub } },
      create: { announcementId: row.id, userId: req.user.sub },
      update: {},
    })
    return reply.send(read)
  })

  app.post<{ Params: { id: string; kind: 'flyer' | 'attachment' } }>(
    '/announcements/:id/files/:kind',
    async (req, reply) => {
      if (!isPrivilegedStaff(req.user.roles)) throw new ForbiddenError('Solo autoridades pueden adjuntar archivos')
      const row = await prisma.announcement.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
      })
      if (!row) throw new NotFoundError('Aviso no encontrado')
      const kind = req.params.kind
      if (kind !== 'flyer' && kind !== 'attachment') throw new BadRequestError('Tipo de archivo inválido')
      const data = await req.file()
      if (!data) throw new BadRequestError('No se recibió ningún archivo')
      const allowed = kind === 'flyer' ? FLYER_MIME_TYPES : DOCUMENT_MIME_TYPES
      if (!allowed.has(data.mimetype)) {
        throw new BadRequestError(kind === 'flyer' ? 'El flyer debe ser JPG, PNG o WebP' : 'El documento debe ser PDF, Word o Excel')
      }
      const buffer = await data.toBuffer()
      const maxBytes = kind === 'flyer' ? MAX_FLYER_BYTES : MAX_DOCUMENT_BYTES
      if (buffer.length > maxBytes) throw new BadRequestError(`El archivo supera el máximo de ${maxBytes / 1024 / 1024} MB`)
      const storedName = `${crypto.randomUUID()}${path.extname(data.filename).toLowerCase()}`
      await storage.save(`announcements/${storedName}`, buffer, data.mimetype)

      if (kind === 'flyer') {
        if (row.flyerStoredName) await storage.remove(`announcements/${row.flyerStoredName}`)
        await prisma.announcement.update({
          where: { id: row.id },
          data: { flyerName: data.filename, flyerStoredName: storedName, flyerMimeType: data.mimetype },
        })
      } else {
        if (row.attachmentStoredName) await storage.remove(`announcements/${row.attachmentStoredName}`)
        await prisma.announcement.update({
          where: { id: row.id },
          data: {
            attachmentName: data.filename,
            attachmentStoredName: storedName,
            attachmentMimeType: data.mimetype,
            attachmentSize: buffer.length,
          },
        })
      }
      return reply.status(201).send({ ok: true })
    },
  )

  app.get<{ Params: { id: string; kind: 'flyer' | 'attachment' } }>(
    '/announcements/:id/:kind',
    async (req, reply) => {
      const row = await prisma.announcement.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
      })
      if (!row) throw new NotFoundError('Aviso no encontrado')
      if (req.params.kind !== 'flyer' && req.params.kind !== 'attachment') throw new BadRequestError('Tipo de archivo inválido')
      const parallels = await userParallelIds(req.user.sub, req.user.institutionId, req.user.roles)
      if (!isPrivilegedStaff(req.user.roles) && !isVisibleToUser(row, req.user.roles, parallels)) {
        throw new ForbiddenError('No tienes acceso a este aviso')
      }
      const isFlyer = req.params.kind === 'flyer'
      const storedName = isFlyer ? row.flyerStoredName : row.attachmentStoredName
      const mimeType = isFlyer ? row.flyerMimeType : row.attachmentMimeType
      const originalName = isFlyer ? row.flyerName : row.attachmentName
      if (!storedName || !mimeType || !originalName) throw new NotFoundError('Archivo no encontrado')
      const stream = await storage.getStream(`announcements/${storedName}`)
      if (!stream) throw new NotFoundError('Archivo no encontrado')
      return reply
        .header('Content-Type', mimeType)
        .header('Content-Disposition', `${isFlyer ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(originalName)}`)
        .send(stream)
    },
  )

  app.delete<{ Params: { id: string } }>('/announcements/:id', async (req, reply) => {
    if (!isPrivilegedStaff(req.user.roles)) throw new ForbiddenError('Solo autoridades pueden eliminar avisos')
    const row = await prisma.announcement.findFirst({ where: { id: req.params.id, institutionId: req.user.institutionId } })
    if (!row) throw new NotFoundError('Aviso no encontrado')
    if (row.flyerStoredName) await storage.remove(`announcements/${row.flyerStoredName}`)
    if (row.attachmentStoredName) await storage.remove(`announcements/${row.attachmentStoredName}`)
    await prisma.announcement.delete({ where: { id: row.id } })
    return reply.status(204).send()
  })
}
