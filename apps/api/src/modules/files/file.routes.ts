import path from 'path'
import { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { storage, CONTENT_TYPES } from '../../shared/infrastructure/services/storage.service'
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors/app.errors'

/**
 * Descarga autenticada de adjuntos privados (tareas, mensajes, incidentes).
 * Reemplaza al antiguo /uploads/* público: cada carpeta valida que el archivo
 * pertenezca a la institución del usuario y, en mensajes, que sea participante.
 */
export default async function fileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Params: { folder: string; storedName: string } }>(
    '/files/:folder/:storedName',
    async (req, reply) => {
      const { folder, storedName } = req.params
      const { institutionId, sub: userId } = req.user

      if (storedName.includes('/') || storedName.includes('..')) throw new NotFoundError()

      let allowed = false
      if (folder === 'tasks') {
        const att = await prisma.taskAttachment.findFirst({
          where: { storedName, institutionId },
          select: { id: true },
        })
        allowed = !!att
      } else if (folder === 'incidents') {
        const att = await prisma.incidentAttachment.findFirst({
          where: { storedName, institutionId },
          select: { id: true },
        })
        allowed = !!att
      } else if (folder === 'messages') {
        const att = await prisma.messageAttachment.findFirst({
          where: {
            storedName,
            message: {
              thread: { institutionId },
              OR: [{ senderId: userId }, { recipients: { some: { recipientId: userId } } }],
            },
          },
          select: { id: true },
        })
        allowed = !!att
      } else {
        throw new NotFoundError('Archivo no encontrado')
      }
      if (!allowed) throw new ForbiddenError()

      const key = `${folder}/${storedName}`
      const stream = await storage.getStream(key)
      if (!stream) throw new NotFoundError('Archivo no encontrado')
      reply.header('Content-Type', CONTENT_TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream')
      reply.header('Cache-Control', 'private, no-store')
      reply.header('X-Content-Type-Options', 'nosniff')
      return reply.send(stream)
    },
  )
}
