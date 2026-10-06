import path from 'path'
import crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { PrismaTaskRepository } from '../infrastructure/repositories/prisma-task.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { NotFoundError } from '../../../shared/domain/errors/app.errors'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'
import { notifyGuardiansOfCourseAssignment } from '../../../shared/infrastructure/services/push.service'
import type { CreateTaskDto, UpdateTaskDto, ListTasksQueryDto } from '../application/dtos/task.dto'

export default async function taskRoutes(app: FastifyInstance) {
  const repo = new PrismaTaskRepository()

  app.addHook('preHandler', authMiddleware)

  // GET /tasks — list (behavior differs by role)
  app.get<{ Querystring: ListTasksQueryDto }>(
    '/tasks',
    { preHandler: [requirePermission('tasks', 'read', 'own')] },
    async (req, reply) => {
      const { institutionId, sub: userId, roles } = req.user
      const isAdmin = roles.includes('admin') || roles.includes('inspector')
      const isTeacher = roles.includes('teacher')

      let tasks
      if (isAdmin) {
        tasks = await repo.listAll(institutionId, req.query)
      } else if (isTeacher) {
        tasks = await repo.listForTeacher(institutionId, userId, req.query)
      } else {
        const studentId = roles.includes('guardian')
          ? await resolveGuardianStudentId(userId, (req.query as { studentId?: string }).studentId)
          : userId
        tasks = await repo.listForStudent(institutionId, studentId, req.query)
      }
      return reply.send(tasks)
    },
  )

  // GET /tasks/:id
  app.get<{ Params: { id: string } }>(
    '/tasks/:id',
    { preHandler: [requirePermission('tasks', 'read', 'own')] },
    async (req, reply) => {
      const task = await repo.getById(req.params.id, req.user.institutionId)
      return reply.send(task)
    },
  )

  // POST /tasks — teacher creates
  app.post<{ Body: CreateTaskDto }>(
    '/tasks',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      const task = await repo.create(req.user.institutionId, req.body, req.user.sub)
      return reply.status(201).send(task)
    },
  )

  // PUT /tasks/:id — teacher updates
  app.put<{ Params: { id: string }; Body: UpdateTaskDto }>(
    '/tasks/:id',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      const task = await repo.update(req.params.id, req.user.institutionId, req.body)
      return reply.send(task)
    },
  )

  // POST /tasks/:id/publish — publish to students
  app.post<{ Params: { id: string } }>(
    '/tasks/:id/publish',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      const previousTask = await repo.getById(req.params.id, req.user.institutionId)
      const task = await repo.publish(req.params.id, req.user.institutionId)
      if (!previousTask.isPublished) {
        void notifyGuardiansOfCourseAssignment(task.courseAssignmentId, {
          title: 'Nueva tarea — Auleka',
          body: task.title,
          url: '/tasks',
        })
      }
      return reply.send(task)
    },
  )

  // DELETE /tasks/:id
  app.delete<{ Params: { id: string } }>(
    '/tasks/:id',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      await repo.delete(req.params.id, req.user.institutionId)
      return reply.status(204).send()
    },
  )

  // ─── Attachments ──────────────────────────────────────────────────────────

  // POST /tasks/:id/attachments — upload file
  app.post<{ Params: { id: string } }>(
    '/tasks/:id/attachments',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      const task = await prisma.task.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
      })
      if (!task) throw new NotFoundError('Tarea no encontrada')

      const data = await req.file()
      if (!data) return reply.status(400).send({ message: 'No se recibió ningún archivo' })

      // Sanitize & store (disco en dev, R2/S3 en prod — ver storage.service)
      const ext = path.extname(data.filename).toLowerCase()
      const storedName = `${crypto.randomUUID()}${ext}`
      const buf = await data.toBuffer()
      await storage.save(`tasks/${storedName}`, buf, data.mimetype)

      const attachment = await prisma.taskAttachment.create({
        data: {
          taskId: task.id,
          institutionId: req.user.institutionId,
          fileName: data.filename,
          storedName,
          mimeType: data.mimetype,
          fileSize: buf.length,
          uploadedBy: req.user.sub,
        },
        include: { uploader: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
      })
      return reply.status(201).send(attachment)
    },
  )

  // DELETE /tasks/:taskId/attachments/:attachmentId
  app.delete<{ Params: { id: string; attachmentId: string } }>(
    '/tasks/:id/attachments/:attachmentId',
    { preHandler: [requirePermission('tasks', 'write', 'own')] },
    async (req, reply) => {
      const attachment = await prisma.taskAttachment.findFirst({
        where: { id: req.params.attachmentId, institutionId: req.user.institutionId },
      })
      if (!attachment) throw new NotFoundError('Adjunto no encontrado')

      await storage.remove(`tasks/${attachment.storedName}`)
      await prisma.taskAttachment.delete({ where: { id: attachment.id } })
      return reply.status(204).send()
    },
  )
}
