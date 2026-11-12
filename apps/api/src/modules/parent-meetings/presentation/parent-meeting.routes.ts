import crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { PrismaParentMeetingRepository } from '../infrastructure/repositories/prisma-parent-meeting.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { buildActaAtencionPdf } from '../application/services/acta-atencion-pdf.service'
import type {
  CreateParentMeetingDto,
  ListParentMeetingsQuery,
  SaveSignatureDto,
  UpdateParentMeetingDto,
} from '../application/dtos/parent-meeting.dto'

const repo = new PrismaParentMeetingRepository()

function personName(
  p: { profile: { firstName: string; lastName: string } | null } | null,
  fallback = '',
): string {
  if (!p?.profile) return fallback
  return `${p.profile.lastName} ${p.profile.firstName}`.trim()
}

/** Lee un archivo del storage y lo devuelve como Buffer (o null si no existe). */
async function readBuffer(key: string): Promise<Buffer | null> {
  const stream = await storage.getStream(key)
  if (!stream) return null
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks)
}

export default async function parentMeetingRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Estudiantes que el actor puede asociar (para el selector del formulario)
  app.get(
    '/parent-meetings/students',
    { preHandler: [requirePermission('parent_meetings', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.listSelectableStudents(req.user.institutionId, {
          userId: req.user.sub,
          roles: req.user.roles,
        }),
      ),
  )

  // ─── Bitácora de atenciones ───────────────────────────────────────────────
  app.get<{ Querystring: ListParentMeetingsQuery }>(
    '/parent-meetings',
    { preHandler: [requirePermission('parent_meetings', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.list(req.user.institutionId, req.query, {
          userId: req.user.sub,
          roles: req.user.roles,
          permissions: req.user.permissions,
        }),
      ),
  )

  app.post<{ Body: CreateParentMeetingDto }>(
    '/parent-meetings',
    { preHandler: [requirePermission('parent_meetings', 'write')] },
    async (req, reply) =>
      reply.code(201).send(await repo.create(req.user.institutionId, req.body, req.user.sub)),
  )

  app.get<{ Params: { id: string } }>(
    '/parent-meetings/:id',
    { preHandler: [requirePermission('parent_meetings', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.getById(req.params.id, req.user.institutionId, {
          userId: req.user.sub,
          roles: req.user.roles,
          permissions: req.user.permissions,
        }),
      ),
  )

  app.patch<{ Params: { id: string }; Body: UpdateParentMeetingDto }>(
    '/parent-meetings/:id',
    { preHandler: [requirePermission('parent_meetings', 'write')] },
    async (req, reply) =>
      reply.send(await repo.update(req.params.id, req.user.institutionId, req.body)),
  )

  app.delete<{ Params: { id: string } }>(
    '/parent-meetings/:id',
    { preHandler: [requirePermission('parent_meetings', 'write')] },
    async (req, reply) => {
      const meeting = await repo.getById(req.params.id, req.user.institutionId)
      if (meeting.signatureKey) await storage.remove(meeting.signatureKey)
      await repo.delete(req.params.id, req.user.institutionId)
      return reply.status(204).send()
    },
  )

  // ─── Firma del visitante (rúbrica) ─────────────────────────────────────────
  app.post<{ Params: { id: string }; Body: SaveSignatureDto }>(
    '/parent-meetings/:id/signature',
    { preHandler: [requirePermission('parent_meetings', 'write')] },
    async (req, reply) => {
      const meeting = await repo.getById(req.params.id, req.user.institutionId)

      const match = /^data:image\/png;base64,(.+)$/.exec(req.body.signature ?? '')
      if (!match) {
        return reply.status(400).send({ message: 'Firma inválida (se espera PNG en base64)' })
      }
      const buf = Buffer.from(match[1], 'base64')

      // Reemplaza la firma anterior si la hubiera
      if (meeting.signatureKey) await storage.remove(meeting.signatureKey)

      const key = `parent-meetings/${crypto.randomUUID()}.png`
      await storage.save(key, buf, 'image/png')
      return reply.send(await repo.setSignature(req.params.id, req.user.institutionId, key))
    },
  )

  // ─── Acta en PDF ───────────────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/parent-meetings/:id/acta.pdf',
    { preHandler: [requirePermission('parent_meetings', 'read')] },
    async (req, reply) => {
      const m = await repo.getForActaPdf(req.params.id, req.user.institutionId)
      const signature = m.signatureKey ? await readBuffer(m.signatureKey) : null

      const instSettings = (m.institution.settings ?? {}) as { branding?: { logoUrl?: string | null } }
      const pdf = await buildActaAtencionPdf({
        institutionName: m.institution.name,
        logoUrl: instSettings.branding?.logoUrl ?? null,
        meetingDate: m.meetingDate,
        meetingTime: m.meetingTime,
        visitorName: m.visitorName,
        visitorRelation: m.visitorRelation,
        studentName: m.student ? personName(m.student) : null,
        studentDni: m.student?.profile?.dni ?? null,
        subject: m.subject,
        details: m.details,
        agreements: m.agreements,
        recorderName: personName(m.recorder, 'Funcionario'),
        signature,
      })
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="acta-atencion-${m.id}.pdf"`)
        .send(pdf)
    },
  )
}
