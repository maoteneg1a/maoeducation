import { FastifyInstance } from 'fastify'
import { PrismaMessageRepository } from '../infrastructure/repositories/prisma-message.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import type { CreateThreadDto, ReplyDto } from '../application/dtos/message.dto'
import { randomUUID } from 'crypto'
import path from 'path'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { sendPushToUser } from '../../../shared/infrastructure/services/push.service'
import { classRecipientIds, recipientGroups } from '../application/services/recipient-groups.service'
import { isPrivilegedStaff } from '../../../shared/infrastructure/services/teacher-scope.service'
import { ForbiddenError } from '../../../shared/domain/errors/app.errors'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'

const repo = new PrismaMessageRepository()

const profileSelect = {
  id: true,
  email: true,
  profile: { select: { firstName: true, lastName: true } },
  userRoles: { select: { role: { select: { name: true } } } },
}

function mapUser(u: { id: string; email: string; profile: { firstName: string; lastName: string } | null; userRoles: { role: { name: string } }[] }) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.profile ? `${u.profile.firstName} ${u.profile.lastName}` : u.email,
    roles: u.userRoles.map((r) => r.role.name),
  }
}

export default async function messageRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /messages/threads
  app.get('/messages/threads', async (req, reply) => {
    const result = await repo.listThreads(req.user.institutionId, req.user.sub)
    return reply.status(200).send(result)
  })

  // GET /messages/threads/:id
  app.get<{ Params: { id: string } }>('/messages/threads/:id', async (req, reply) => {
    const result = await repo.getThread(req.params.id, req.user.institutionId, req.user.sub)
    return reply.status(200).send(result)
  })

  // POST /messages/threads
  app.post<{ Body: CreateThreadDto }>('/messages/threads', {
    schema: { body: { type: 'object', required: ['subject', 'body', 'recipientIds'], properties: {
      subject: { type: 'string', minLength: 1, maxLength: 200 }, body: { type: 'string', minLength: 1 },
      recipientIds: { type: 'array', minItems: 1, maxItems: 5000, items: { type: 'string', minLength: 1 } },
    } } },
  }, async (req, reply) => {
    const recipientIds = [...new Set(req.body.recipientIds)]
    const allowedIds = req.user.roles.includes('teacher') && !isPrivilegedStaff(req.user.roles)
      ? await classRecipientIds(req.user)
      : undefined
    const targets = await prisma.user.count({ where: {
      institutionId: req.user.institutionId, isActive: true, id: { in: recipientIds, not: req.user.sub },
      ...(allowedIds && { AND: { id: { in: allowedIds } } }),
    } })
    if (!recipientIds.length || targets !== recipientIds.length) throw new ForbiddenError('Algunos destinatarios no están disponibles para este usuario')
    const result = await repo.createThread(req.user.institutionId, { ...req.body, recipientIds }, req.user.sub)
    void Promise.allSettled(
      req.body.recipientIds.map((id) =>
        sendPushToUser(id, { title: 'Nuevo mensaje — Auleka', body: req.body.subject, url: '/messages' }),
      ),
    )
    return reply.status(201).send(result)
  })

  // POST /messages/threads/:id/reply
  app.post<{ Params: { id: string }; Body: ReplyDto }>(
    '/messages/threads/:id/reply',
    async (req, reply) => {
      const result = await repo.reply(req.params.id, req.user.institutionId, req.body, req.user.sub)
      // Notificar a los destinatarios del mensaje (excepto quien responde)
      if (result?.recipients) {
        const ids = (result.recipients as Array<{ recipientId: string }>)
          .map((r) => r.recipientId)
          .filter((id) => id !== req.user.sub)
        void Promise.allSettled(
          ids.map((id) => sendPushToUser(id, { title: 'Respuesta en mensaje — Auleka', body: req.body.body?.slice(0, 80) ?? 'Nueva respuesta', url: '/messages' })),
        )
      }
      return reply.status(201).send(result)
    },
  )

  // GET /messages/unread-count
  app.get('/messages/unread-count', async (req, reply) => {
    const count = await repo.getUnreadCount(req.user.sub, req.user.institutionId)
    return reply.status(200).send({ count })
  })

  app.get('/messages/recipient-groups', async (req) => recipientGroups(req.user))

  // GET /messages/recipients?q=&parallelId=&audience=
  app.get<{ Querystring: { q?: string; parallelId?: string; audience?: 'all' | 'students' | 'guardians' } }>('/messages/recipients', {
    schema: { querystring: { type: 'object', properties: {
      q: { type: 'string', maxLength: 200 }, parallelId: { type: 'string', minLength: 1 }, audience: { type: 'string', enum: ['all', 'students', 'guardians'] },
    } } },
  }, async (req, reply) => {
    const q = req.query.q?.trim() ?? ''
    const { sub: userId, institutionId, roles: callerRoles } = req.user

    const isAdminRole = callerRoles.some((r) => ['admin', 'rector', 'inspector'].includes(r))
    const isTeacher = callerRoles.includes('teacher')
    const isDece = callerRoles.includes('dece')
    const isGuardian = callerRoles.includes('guardian')
    const isStudentOrGuardian = callerRoles.some((r) => r === 'student' || r === 'guardian')

    const nameFilter = q
      ? {
          OR: [
            { profile: { firstName: { contains: q, mode: 'insensitive' as const } } },
            { profile: { lastName: { contains: q, mode: 'insensitive' as const } } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}

    const audienceFilter = req.query.audience === 'students' || req.query.audience === 'guardians'
      ? { userRoles: { some: { role: { name: req.query.audience === 'students' ? 'student' : 'guardian' } } } }
      : {}
    let users: ReturnType<typeof mapUser>[] = []

    if (req.query.parallelId || (isTeacher && !isAdminRole && !isDece)) {
      const ids = await classRecipientIds(req.user, req.query.parallelId, req.query.audience)
      const found = await prisma.user.findMany({
        where: { institutionId, isActive: true, id: { in: ids, not: userId }, ...nameFilter },
        select: profileSelect,
        orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
      })
      users = found.map(mapUser)
    } else if (isAdminRole) {
      const found = await prisma.user.findMany({
        where: { institutionId, isActive: true, id: { not: userId }, ...nameFilter, ...audienceFilter },
        select: profileSelect,
        orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
      })
      users = found.map(mapUser)
    } else if (isDece) {
      // DECE puede coordinar con estudiantes, sus representantes y el personal
      // que participa en su acompañamiento, sin abrirle el directorio completo.
      const found = await prisma.user.findMany({
        where: {
          institutionId, isActive: true,
          id: { not: userId },
          ...nameFilter,
          userRoles: { some: { role: { name: { in: ['student', 'guardian', 'teacher', 'rector', 'inspector'] } } } },
          ...(Object.keys(audienceFilter).length ? { AND: audienceFilter } : {}),
        },
        select: profileSelect,
        orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
      })
      users = found.map(mapUser)
    } else if (isStudentOrGuardian) {
      // Student/guardian: teachers of their enrolled courses
      const studentId = isGuardian
        ? await resolveGuardianStudentId(userId)
        : userId

      const enrollments = await prisma.studentEnrollment.findMany({
        where: { institutionId, studentId },
        select: { parallelId: true, academicYearId: true },
      })

      const assignments = await prisma.courseAssignment.findMany({
        where: {
          institutionId,
          OR: enrollments.map((e) => ({
            parallelId: e.parallelId,
            academicYearId: e.academicYearId,
          })),
        },
        select: { teacherId: true },
      })
      const uniqueTeacherIds = [...new Set(assignments.map((a) => a.teacherId))]

      const found = await prisma.user.findMany({
        where: { id: { in: uniqueTeacherIds }, ...nameFilter },
        select: profileSelect,
        take: 20,
      })
      users = found.map(mapUser)
    }

    return reply.status(200).send(users)
  })

  // POST /messages/:messageId/attachments
  app.post<{ Params: { messageId: string } }>('/messages/:messageId/attachments', async (req, reply) => {
    const { messageId } = req.params
    const message = await prisma.message.findFirst({
      where: { id: messageId },
      select: { id: true, senderId: true },
    })
    if (!message) return reply.status(404).send({ message: 'Mensaje no encontrado' })
    if (message.senderId !== req.user.sub) return reply.status(403).send({ message: 'Sin permiso' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ message: 'No se recibió archivo' })

    const ext = path.extname(data.filename)
    const storedName = `${randomUUID()}${ext}`
    const buf = await data.toBuffer()
    await storage.save(`messages/${storedName}`, buf, data.mimetype)

    const attachment = await prisma.messageAttachment.create({
      data: {
        messageId,
        fileName: data.filename,
        storedName,
        mimeType: data.mimetype,
        fileSize: buf.length,
      },
    })

    return reply.status(201).send(attachment)
  })
}
