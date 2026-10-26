import crypto from 'node:crypto'
import path from 'node:path'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'
import { storage } from '../../../../shared/infrastructure/services/storage.service'
import { dossierAccess, type DossierContext } from './dossier-access.service'

export async function uploadDossierFile(institutionId: string, actor: Actor, ctx: DossierContext & { itemKey: string; isSigned?: boolean; observation?: string }, file: { filename: string; mimetype: string; buffer: Buffer }) {
  const access = await dossierAccess(institutionId, actor, ctx)
  if (!access.canUpload) throw new ForbiddenError('Tu rol no puede adjuntar documentos al expediente')
  const item = access.item(ctx.itemKey)
  const headers: Record<string, boolean> = {
    'application/pdf': file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')),
    'image/jpeg': file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/png': file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP',
  }
  if (!headers[file.mimetype] || !access.flow.attachments.allowedMime.includes(file.mimetype)) throw new BadRequestError('Sube un PDF o una imagen escaneada válida de los tipos permitidos')
  if (!file.buffer.length || file.buffer.length > access.flow.attachments.maxSizeMb * 1024 * 1024) throw new BadRequestError(`El archivo supera ${access.flow.attachments.maxSizeMb} MB o está vacío`)
  const courseAssignmentId = item.perSubject ? ctx.courseAssignmentId! : null
  const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const storedName = `dossier/${crypto.randomUUID()}.${extensions[file.mimetype]}`
  await storage.save(storedName, file.buffer, file.mimetype)
  try {
    return await prisma.dossierFile.create({ data: {
      institutionId, studentId: ctx.studentId, academicYearId: ctx.academicYearId,
      courseAssignmentId, scopeKey: courseAssignmentId || 'general', itemKey: item.key,
      fileName: path.basename(file.filename.replace(/\\/g, '/')).slice(0, 255), storedName, mimeType: file.mimetype, fileSize: file.buffer.length,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'), isSigned: ctx.isSigned === true,
      confidential: access.flow.reportTypes.find((t) => t.key === item.reportType)?.confidential === true,
      observation: ctx.observation?.trim().slice(0, 2000) || null, uploadedBy: actor.userId,
    }, select: { id: true } })
  } catch (error) {
    await storage.remove(storedName)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictError('Este archivo ya está adjunto a ese documento del expediente')
    throw error
  }
}

export async function dossierFileForDownload(institutionId: string, actor: Actor, id: string) {
  const file = await prisma.dossierFile.findFirst({ where: { id, institutionId } })
  if (!file) throw new NotFoundError('Documento de respaldo no encontrado')
  const access = await dossierAccess(institutionId, actor, { studentId: file.studentId, academicYearId: file.academicYearId, courseAssignmentId: file.courseAssignmentId || undefined })
  const item = access.flow.dossier.items.find((i) => i.key === file.itemKey)
  const confidential = access.flow.reportTypes.find((t) => t.key === item?.reportType)?.confidential
  if ((file.confidential || confidential) && file.uploadedBy !== actor.userId && !isAuthority(actor) && !actor.roles.includes('dece')) throw new ForbiddenError('Documento reservado: solo quien lo subió, DECE y la autoridad pueden descargarlo')
  return file
}

export async function deleteDossierFile(institutionId: string, actor: Actor, id: string) {
  const file = await dossierFileForDownload(institutionId, actor, id)
  if (file.uploadedBy !== actor.userId && !isAuthority(actor)) throw new ForbiddenError('Solo quien adjuntó el documento o la autoridad puede retirarlo')
  await prisma.dossierFile.delete({ where: { id } })
  await storage.remove(file.storedName)
}

export async function setDossierApplicability(institutionId: string, actor: Actor, ctx: DossierContext & { itemKey: string; notApplicable: boolean; reason?: string }) {
  const access = await dossierAccess(institutionId, actor, ctx)
  if (!access.canUpload) throw new ForbiddenError()
  const item = access.item(ctx.itemKey)
  if (!item.optional) throw new BadRequestError('Este documento es obligatorio y no se puede marcar como no aplicable')
  const courseAssignmentId = item.perSubject ? ctx.courseAssignmentId! : null
  const key = { institutionId, studentId: ctx.studentId, academicYearId: ctx.academicYearId, itemKey: item.key, scopeKey: courseAssignmentId || 'general' }
  if (!ctx.notApplicable) { await prisma.dossierException.deleteMany({ where: key }); return }
  const reason = ctx.reason?.trim()
  if (!reason || reason.length < 5 || reason.length > 2000) throw new BadRequestError('Escribe el motivo por el que este documento no aplica (5–2000 caracteres)')
  await prisma.dossierException.upsert({
    where: { institutionId_studentId_academicYearId_itemKey_scopeKey: key },
    create: { ...key, courseAssignmentId, reason, createdBy: actor.userId },
    update: { reason, createdBy: actor.userId, createdAt: new Date() },
  })
}
