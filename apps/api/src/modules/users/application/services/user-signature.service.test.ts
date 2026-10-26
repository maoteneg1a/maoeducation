import { beforeEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { captureDocumentSignature, getOwnSignature, normalizeSignature, saveOwnSignature } from './user-signature.service'

const db = vi.hoisted(() => ({ user: { findFirst: vi.fn() }, userSignature: { findFirst: vi.fn(), upsert: vi.fn() } }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
beforeEach(() => vi.clearAllMocks())
async function image() {
  const buffer = await sharp({ create: { width: 800, height: 240, channels: 4, background: '#112233' } }).png().toBuffer()
  return `data:image/png;base64,${buffer.toString('base64')}`
}
describe('firma personal', () => {
  it('normaliza la imagen a PNG acotado y rechaza contenido que no es una imagen', async () => {
    const normalized = await normalizeSignature(await image())
    const metadata = await sharp(Buffer.from(normalized.split(',')[1], 'base64')).metadata()
    expect(metadata).toMatchObject({ format: 'png', width: 640, height: 192 })
    await expect(normalizeSignature('data:image/png;base64,SG9sYQ==')).rejects.toThrow('leer la imagen')
    await expect(normalizeSignature('data:text/html;base64,SG9sYQ==')).rejects.toThrow('PNG')
    await expect(normalizeSignature('x'.repeat(3_000_001))).rejects.toThrow('2 MB')
  })
  it('solo guarda la firma del usuario activo dentro de su institución', async () => {
    db.user.findFirst.mockResolvedValue(null)
    await expect(saveOwnSignature('school', 'user', await image())).rejects.toThrow('Usuario')
    expect(db.userSignature.upsert).not.toHaveBeenCalled()
    db.user.findFirst.mockResolvedValue({ id: 'user' })
    db.userSignature.findFirst.mockResolvedValue({ imageData: 'stored', updatedAt: new Date() })
    await saveOwnSignature('school', 'user', await image())
    expect(db.userSignature.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user' }, create: expect.objectContaining({ userId: 'user', sha256: expect.any(String) }) }))
    expect(db.userSignature.findFirst).toHaveBeenCalledWith({ where: { userId: 'user', user: { institutionId: 'school', isActive: true } } })
  })
  it('la copia del documento conserva identidad, fecha y hash aunque cambie la firma del perfil', async () => {
    db.userSignature.findFirst.mockResolvedValue({ imageData: 'original', sha256: 'hash', user: { email: 'user', profile: { firstName: 'Hilda', lastName: 'Zhangallimbay' } } })
    const copy = await captureDocumentSignature('school', 'user', 'document-hash', new Date('2026-10-26T17:00:00Z'))
    db.userSignature.findFirst.mockResolvedValue({ imageData: 'new', updatedAt: new Date() })
    await getOwnSignature('school', 'user')
    expect(copy).toEqual({ userId: 'user', name: 'Hilda Zhangallimbay', imageData: 'original', sha256: 'hash', documentHash: 'document-hash', signedAt: '2026-10-26T17:00:00.000Z' })
  })
})
