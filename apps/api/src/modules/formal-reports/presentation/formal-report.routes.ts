import { FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { actorOf } from '../../../shared/infrastructure/services/actor'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { BadRequestError } from '../../../shared/domain/errors/app.errors'
import type { ReportTypeConfig } from '../../../shared/domain/reports-flow'
import { PrismaFormalReportRepository, personName } from '../infrastructure/repositories/prisma-formal-report.repository'
import { buildFormalReportPdf, type FormalReportPdfData } from '../application/services/formal-report-pdf.service'
import { buildOriginalAnnexDocx } from '../application/services/original-annex-document.service'
import { buildDossier } from '../application/services/dossier.service'
import { uploadDossierFile, dossierFileForDownload, deleteDossierFile, setDossierApplicability } from '../application/services/dossier-files.service'
import type { DossierContext } from '../application/services/dossier-access.service'
import type {
  AttendReportDto,
  CopyCaseAttachmentsDto,
  CreateFormalReportDto,
  DeriveReportDto,
  ListFormalReportsQuery,
  ReturnReportDto,
  UpdateFormalReportDto,
} from '../application/dtos/formal-report.dto'

export default async function formalReportRoutes(app: FastifyInstance) {
  const repo = new PrismaFormalReportRepository()
  app.addHook('preHandler', authMiddleware)
  const read = { preHandler: [requirePermission('formal_reports', 'read')] }
  const write = { preHandler: [requirePermission('formal_reports', 'write')] }

  app.get<{ Querystring: ListFormalReportsQuery }>('/formal-reports', read, async (req, reply) =>
    reply.send(await repo.list(req.user.institutionId, actorOf(req.user), req.query)))

  app.get('/formal-reports/counts', read, async (req, reply) =>
    reply.send(await repo.counts(req.user.institutionId, actorOf(req.user))))

  // Expediente de respaldo por estudiante y año (checklist configurable)
  const dossierRead = { preHandler: [requirePermission('student_folder', 'read')] }
  app.get<{ Querystring: DossierContext }>(
    '/formal-reports/dossier',
    { preHandler: [requirePermission('student_folder', 'read')] },
    async (req, reply) => {
      if (!req.query.studentId || !req.query.academicYearId) throw new BadRequestError('Se requiere estudiante y año lectivo')
      return reply.send(await buildDossier(req.user.institutionId, actorOf(req.user), req.query.studentId, req.query.academicYearId, req.query.courseAssignmentId))
    },
  )

  app.post<{ Querystring: DossierContext & { itemKey: string; isSigned?: string; observation?: string } }>('/formal-reports/dossier/files', dossierRead, async (req, reply) => {
    if (!req.query.studentId || !req.query.academicYearId || !req.query.itemKey) throw new BadRequestError('Se requiere estudiante, año y documento del checklist')
    const file = await req.file()
    if (!file) throw new BadRequestError('Selecciona el archivo PDF o escaneado')
    const buffer = await file.toBuffer()
    return reply.code(201).send(await uploadDossierFile(req.user.institutionId, actorOf(req.user), { ...req.query, isSigned: req.query.isSigned === 'true' }, { filename: file.filename, mimetype: file.mimetype, buffer }))
  })

  app.get<{ Params: { id: string } }>('/formal-reports/dossier/files/:id', dossierRead, async (req, reply) => {
    const file = await dossierFileForDownload(req.user.institutionId, actorOf(req.user), req.params.id)
    const stream = await storage.getStream(file.storedName)
    if (!stream) return reply.code(404).send({ message: 'Archivo no encontrado' })
    return reply.header('Content-Type', file.mimeType).header('Content-Disposition', `attachment; filename="${encodeURIComponent(file.fileName)}"`).send(stream)
  })
  app.delete<{ Params: { id: string } }>('/formal-reports/dossier/files/:id', dossierRead, async (req, reply) => {
    await deleteDossierFile(req.user.institutionId, actorOf(req.user), req.params.id)
    return reply.code(204).send()
  })
  app.put<{ Body: DossierContext & { itemKey: string; notApplicable: boolean; reason?: string } }>('/formal-reports/dossier/applicability', dossierRead, async (req, reply) => {
    if (!req.body?.studentId || !req.body.academicYearId || !req.body.itemKey || typeof req.body.notApplicable !== 'boolean') throw new BadRequestError('Datos de aplicabilidad incompletos')
    await setDossierApplicability(req.user.institutionId, actorOf(req.user), req.body)
    return reply.code(204).send()
  })

  app.post<{ Body: CreateFormalReportDto }>('/formal-reports', write, async (req, reply) =>
    reply.code(201).send(await repo.create(req.user.institutionId, actorOf(req.user), req.body)))

  app.get<{ Params: { id: string } }>('/formal-reports/:id', read, async (req, reply) =>
    reply.send(await repo.get(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.patch<{ Params: { id: string }; Body: UpdateFormalReportDto }>('/formal-reports/:id', write, async (req, reply) =>
    reply.send(await repo.update(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.content ?? {})))

  app.delete<{ Params: { id: string } }>('/formal-reports/:id', write, async (req, reply) => {
    await repo.remove(req.user.institutionId, actorOf(req.user), req.params.id)
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/formal-reports/:id/snapshot-preview', write, async (req, reply) =>
    reply.send(await repo.previewSnapshot(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.post<{ Params: { id: string } }>('/formal-reports/:id/send', write, async (req, reply) =>
    reply.send(await repo.send(req.user.institutionId, actorOf(req.user), req.params.id)))

  // Acciones del destinatario (incluye representantes: acuse en el portal)
  app.post<{ Params: { id: string } }>('/formal-reports/:id/receive', read, async (req, reply) =>
    reply.send(await repo.receive(req.user.institutionId, actorOf(req.user), req.params.id)))

  app.post<{ Params: { id: string }; Body: ReturnReportDto }>('/formal-reports/:id/return', write, async (req, reply) =>
    reply.send(await repo.returnReport(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.note)))

  app.post<{ Params: { id: string }; Body: AttendReportDto }>('/formal-reports/:id/attend', write, async (req, reply) =>
    reply.send(await repo.attend(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.note)))

  app.post<{ Params: { id: string }; Body: DeriveReportDto }>('/formal-reports/:id/derive', write, async (req, reply) =>
    reply.code(201).send(await repo.derive(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.typeKey)))

  app.post<{ Params: { id: string } }>('/formal-reports/:id/new-version', write, async (req, reply) =>
    reply.code(201).send(await repo.newVersion(req.user.institutionId, actorOf(req.user), req.params.id)))

  // ─── Anexos (solo personal; nunca el representante) ───────────────────────
  app.post<{ Params: { id: string }; Querystring: { category?: string } }>('/formal-reports/:id/attachments', write, async (req, reply) => {
    const data = await req.file()
    if (!data) throw new BadRequestError('No se recibió ningún archivo')
    const buffer = await data.toBuffer()
    return reply.send(await repo.addAttachment(
      req.user.institutionId, actorOf(req.user), req.params.id,
      { filename: data.filename, mimetype: data.mimetype, buffer },
      req.query.category ?? 'otro',
    ))
  })

  app.post<{ Params: { id: string }; Body: CopyCaseAttachmentsDto }>('/formal-reports/:id/attachments/from-case', write, async (req, reply) =>
    reply.send(await repo.copyCaseAttachments(req.user.institutionId, actorOf(req.user), req.params.id, req.body?.attachmentIds ?? [])))

  app.delete<{ Params: { id: string; attachmentId: string } }>('/formal-reports/:id/attachments/:attachmentId', write, async (req, reply) =>
    reply.send(await repo.removeAttachment(req.user.institutionId, actorOf(req.user), req.params.id, req.params.attachmentId)))

  app.get<{ Params: { id: string; attachmentId: string } }>('/formal-reports/:id/attachments/:attachmentId', read, async (req, reply) => {
    const a = await repo.attachmentForDownload(req.user.institutionId, actorOf(req.user), req.params.id, req.params.attachmentId)
    const stream = await storage.getStream(a.storedName)
    if (!stream) return reply.code(404).send({ message: 'Archivo no encontrado' })
    return reply
      .header('Content-Type', a.mimeType)
      .header('Content-Disposition', `attachment; filename="${encodeURIComponent(a.fileName)}"`)
      .send(stream)
  })

  async function exportDocument(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, format: 'pdf' | 'docx') {
    const { report: r, institution, receivedByName, snapshot } = await repo.forPdf(req.user.institutionId, actorOf(req.user), req.params.id)
    const t = r.typeConfig as unknown as ReportTypeConfig
    const settings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }
    const data: FormalReportPdfData = {
      institutionName: institution?.name ?? '',
      logoUrl: settings.branding?.logoUrl ?? null,
      title: t.pdfTitle || r.typeLabel.toUpperCase(),
      pdfTemplate: t.pdfTemplate,
      footer: t.pdfFooter ?? null,
      folio: r.folio,
      status: r.status,
      typeLabel: r.typeLabel,
      authorName: personName(r.author),
      recipientLabel: r.recipientInstanceLabel,
      recipientNames: r.recipients.map((x) => personName(x.user)),
      sentAt: r.sentAt,
      receivedAt: r.receivedAt,
      receivedByName,
      fields: t.fields ?? [],
      content: (r.content ?? {}) as Record<string, string>,
      snapshot,
      attachments: r.attachments.map((a) => a.fileName),
      signatures: t.signatures ?? [],
      returnNote: r.returnNote,
      responseNote: r.responseNote,
    }
    const buffer = format === 'docx' ? await buildOriginalAnnexDocx(data) : await buildFormalReportPdf(data)
    return reply
      .header('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', `attachment; filename="${r.folio ?? 'borrador'}-${r.typeKey}.${format}"`)
      .send(buffer)
  }
  app.get<{ Params: { id: string } }>('/formal-reports/:id/pdf', read, (req, reply) => exportDocument(req, reply, 'pdf'))
  app.get<{ Params: { id: string } }>('/formal-reports/:id/docx', read, (req, reply) => exportDocument(req, reply, 'docx'))
}
