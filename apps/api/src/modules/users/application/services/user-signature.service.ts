import crypto from 'node:crypto'
import sharp from 'sharp'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, NotFoundError } from '../../../../shared/domain/errors/app.errors'

export interface DocumentSignature {
  userId: string
  name: string
  signedAt: string
  imageData: string
  sha256: string
  documentHash: string
}

/** Una previsualización solo necesita la imagen, sin atribuir un envío o acuse. */
export type DocumentSignatureImage = Pick<DocumentSignature, 'imageData'> & Partial<DocumentSignature>

export async function normalizeSignature(data: string): Promise<string> {
  if (typeof data !== 'string' || data.length > 3_000_000 || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data)) throw new BadRequestError('Sube una firma PNG, JPG o WebP de hasta 2 MB')
  const buffer = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')
  if (buffer.length > 2 * 1024 * 1024) throw new BadRequestError('La imagen de firma supera 2 MB')
  try {
    const input = sharp(buffer, { limitInputPixels: 10_000_000 })
    const metadata = await input.metadata()
    if (!['png', 'jpeg', 'webp'].includes(metadata.format ?? '')) throw new Error('Formato inválido')
    const output = await input.rotate().resize({ width: 640, height: 200, fit: 'inside', withoutEnlargement: true }).png({ palette: true, colours: 32, compressionLevel: 9 }).toBuffer()
    return `data:image/png;base64,${output.toString('base64')}`
  } catch { throw new BadRequestError('No se pudo leer la imagen de firma') }
}

export async function getOwnSignature(institutionId: string, userId: string) {
  const signature = await prisma.userSignature.findFirst({ where: { userId, user: { institutionId, isActive: true } } })
  return { imageData: signature?.imageData ?? null, updatedAt: signature?.updatedAt ?? null }
}

export async function saveOwnSignature(institutionId: string, userId: string, imageData: string) {
  const user = await prisma.user.findFirst({ where: { id: userId, institutionId, isActive: true }, select: { id: true } })
  if (!user) throw new NotFoundError('Usuario no encontrado')
  const normalized = await normalizeSignature(imageData)
  await prisma.userSignature.upsert({ where: { userId }, create: { userId, imageData: normalized, sha256: crypto.createHash('sha256').update(normalized).digest('hex') }, update: { imageData: normalized, sha256: crypto.createHash('sha256').update(normalized).digest('hex') } })
  return getOwnSignature(institutionId, userId)
}

export async function deleteOwnSignature(institutionId: string, userId: string) {
  await prisma.userSignature.deleteMany({ where: { userId, user: { institutionId } } })
}

export async function captureDocumentSignature(institutionId: string, userId: string, documentHash: string, signedAt = new Date()): Promise<DocumentSignature | undefined> {
  const signature = await prisma.userSignature.findFirst({ where: { userId, user: { institutionId, isActive: true } }, include: { user: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } } } })
  if (!signature) return undefined
  const p = signature.user.profile
  return { userId, name: p ? `${p.firstName} ${p.lastName}` : signature.user.email, signedAt: signedAt.toISOString(), imageData: signature.imageData, sha256: signature.sha256, documentHash }
}
