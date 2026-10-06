import path from 'path'
import crypto from 'crypto'
import { FastifyInstance } from 'fastify'
import { PrismaIncidentRepository } from '../infrastructure/repositories/prisma-incident.repository'
import { PrismaMessageRepository } from '../../messaging/infrastructure/repositories/prisma-message.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { buildActaPdf } from '../application/services/acta-pdf.service'
import { notifyGuardiansOfStudent, sendPushToUser } from '../../../shared/infrastructure/services/push.service'
import type {
  AddEventDto,
  AssignDeceDto,
  ChangeStateDto,
  CreateCommitmentDto,
  CreateIncidentDto,
  CreateIncidentTypeDto,
  ListIncidentsQuery,
  UpdateIncidentDto,
  UpdateIncidentTypeDto,
} from '../application/dtos/incident.dto'

const repo = new PrismaIncidentRepository()
const messageRepo = new PrismaMessageRepository()


function personName(p: { profile: { firstName: string; lastName: string } | null } | null): string {
  if (!p?.profile) return 'estudiante'
  return `${p.profile.firstName} ${p.profile.lastName}`
}

export default async function incidentRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── Tipos de falta (catálogo) ──────────────────────────────────────────
  app.get(
    '/incident-types',
    { preHandler: [requirePermission('incident_types', 'read')] },
    async (req, reply) => reply.send(await repo.listTypes(req.user.institutionId)),
  )

  app.post<{ Body: CreateIncidentTypeDto }>(
    '/incident-types',
    { preHandler: [requirePermission('incident_types', 'manage')] },
    async (req, reply) => reply.status(201).send(await repo.createType(req.user.institutionId, req.body)),
  )

  app.put<{ Params: { id: string }; Body: UpdateIncidentTypeDto }>(
    '/incident-types/:id',
    { preHandler: [requirePermission('incident_types', 'manage')] },
    async (req, reply) => reply.send(await repo.updateType(req.params.id, req.user.institutionId, req.body)),
  )

  app.patch<{ Params: { id: string } }>(
    '/incident-types/:id/toggle',
    { preHandler: [requirePermission('incident_types', 'manage')] },
    async (req, reply) => reply.send(await repo.toggleType(req.params.id, req.user.institutionId)),
  )

  // Estudiantes que el actor puede reportar (para el selector del formulario)
  app.get(
    '/incidents/students',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.listReportableStudents(req.user.institutionId, {
          userId: req.user.sub,
          roles: req.user.roles,
        }),
      ),
  )

  // ─── Incidentes (caso) ──────────────────────────────────────────────────
  app.get<{ Querystring: ListIncidentsQuery }>(
    '/incidents',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.list(req.user.institutionId, req.query, {
          userId: req.user.sub,
          roles: req.user.roles,
          permissions: req.user.permissions,
        }),
      ),
  )

  app.post<{ Body: CreateIncidentDto }>(
    '/incidents',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) => {
      const incident = await repo.create(req.user.institutionId, req.body, req.user.sub)
      void notifyGuardiansOfStudent(req.body.studentId, {
        title: 'Incidente registrado — Auleka',
        body: 'Se ha registrado un incidente para tu representado. Ingresa para ver el detalle.',
        url: '/incidents',
      })
      return reply.code(201).send(incident)
    },
  )

  app.get<{ Params: { id: string } }>(
    '/incidents/:id',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.getById(req.params.id, req.user.institutionId, {
          userId: req.user.sub,
          roles: req.user.roles,
          permissions: req.user.permissions,
        }),
      ),
  )

  app.patch<{ Params: { id: string }; Body: UpdateIncidentDto }>(
    '/incidents/:id',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) =>
      reply.send(await repo.update(req.params.id, req.user.institutionId, req.body)),
  )

  // Avanzar estado del debido proceso
  app.patch<{ Params: { id: string }; Body: ChangeStateDto }>(
    '/incidents/:id/state',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) =>
      reply.send(await repo.changeState(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  // Derivar al DECE (autoridad/admin)
  app.post<{ Params: { id: string }; Body: AssignDeceDto }>(
    '/incidents/:id/assign-dece',
    { preHandler: [requirePermission('incidents', 'manage')] },
    async (req, reply) =>
      reply.send(await repo.assignDece(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  // Bitácora
  app.get<{ Params: { id: string } }>(
    '/incidents/:id/events',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) => reply.send(await repo.listEvents(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string }; Body: AddEventDto }>(
    '/incidents/:id/events',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(await repo.addEvent(req.params.id, req.user.institutionId, req.user.sub, req.body)),
  )

  // Notificar al representante (vía mensajería)
  app.post<{ Params: { id: string } }>(
    '/incidents/:id/notify-guardian',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) => {
      const incident = await repo.getById(req.params.id, req.user.institutionId)
      const guardianIds = await repo.getStudentGuardianIds(incident.studentId)
      if (guardianIds.length === 0) {
        return reply.status(400).send({ message: 'El estudiante no tiene representantes registrados' })
      }
      const studentName = personName(incident.student)
      const subject = `Incidente disciplinario de ${studentName}`
      const body =
        `Estimado representante, se ha registrado un incidente de ${studentName} ` +
        `(${incident.incidentType?.name ?? incident.category}). ` +
        `Por favor comuníquese con la institución para dar seguimiento.`
      await messageRepo.createThread(
        req.user.institutionId,
        { subject, body, recipientIds: guardianIds },
        req.user.sub,
      )
      await repo.markGuardianNotified(
        req.params.id,
        req.user.institutionId,
        req.user.sub,
        `Representante(s) notificado(s): ${guardianIds.length}`,
      )
      void Promise.allSettled(
        guardianIds.map((guardianId) =>
          sendPushToUser(guardianId, {
            title: 'Nuevo mensaje — Auleka',
            body: subject,
            url: '/messages',
          }),
        ),
      )
      return reply.send({ notified: guardianIds.length })
    },
  )

  // ─── Actas de compromiso ────────────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/incidents/:id/commitments',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) => reply.send(await repo.listCommitments(req.params.id, req.user.institutionId)),
  )

  app.post<{ Params: { id: string }; Body: CreateCommitmentDto }>(
    '/incidents/:id/commitments',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) =>
      reply
        .status(201)
        .send(
          await repo.createCommitment(req.params.id, req.user.institutionId, req.user.sub, req.body),
        ),
  )

  // PDF del acta
  app.get<{ Params: { id: string; cid: string } }>(
    '/incidents/:id/commitments/:cid/pdf',
    { preHandler: [requirePermission('incidents', 'read')] },
    async (req, reply) => {
      const c = await repo.getCommitmentForPdf(req.params.id, req.params.cid, req.user.institutionId)
      const instSettings = (c.institution.settings ?? {}) as { branding?: { logoUrl?: string | null } }
      const pdf = await buildActaPdf({
        institutionName: c.institution.name,
        logoUrl: instSettings.branding?.logoUrl ?? null,
        studentName: personName(c.incident.student),
        studentDni: c.incident.student.profile?.dni ?? null,
        incidentTypeName: c.incident.incidentType?.name ?? c.incident.category,
        severity: c.incident.incidentType?.severity ?? c.incident.severity,
        terms: c.terms,
        followUpDate: c.followUpDate,
        createdAt: c.createdAt,
        signatories: (c.signatories ?? {}) as Record<string, unknown>,
      })
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="acta-${c.id}.pdf"`)
        .send(pdf)
    },
  )

  // ─── Evidencias ─────────────────────────────────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/incidents/:id/attachments',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) => {
      await repo.getById(req.params.id, req.user.institutionId) // valida existencia + tenant
      const data = await req.file()
      if (!data) return reply.status(400).send({ message: 'No se recibió ningún archivo' })

      const ext = path.extname(data.filename).toLowerCase()
      const storedName = `${crypto.randomUUID()}${ext}`
      const buf = await data.toBuffer()
      await storage.save(`incidents/${storedName}`, buf, data.mimetype)

      const attachment = await repo.addAttachment(req.params.id, req.user.institutionId, req.user.sub, {
        fileName: data.filename,
        storedName,
        mimeType: data.mimetype,
        fileSize: buf.length,
      })
      return reply.status(201).send({ ...attachment, url: `/uploads/incidents/${storedName}` })
    },
  )

  app.delete<{ Params: { id: string; attachmentId: string } }>(
    '/incidents/:id/attachments/:attachmentId',
    { preHandler: [requirePermission('incidents', 'write')] },
    async (req, reply) => {
      const attachment = await repo.findAttachment(req.params.attachmentId, req.user.institutionId)
      if (!attachment) return reply.status(404).send({ message: 'Adjunto no encontrado' })
      await storage.remove(`incidents/${attachment.storedName}`)
      await repo.deleteAttachment(attachment.id)
      return reply.status(204).send()
    },
  )
}
