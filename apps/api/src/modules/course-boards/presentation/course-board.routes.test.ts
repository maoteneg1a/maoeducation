import Fastify from 'fastify'
import multipart from '@fastify/multipart'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: { sub: 'teacher', institutionId: 'school', roles: ['teacher'], permissions: ['reports:read:own'] },
  previewInvitation: vi.fn(), publishInvitation: vi.fn(), updateMeeting: vi.fn(), emitMeetingDocument: vi.fn(), boardOptions: vi.fn(), updateBoardConfig: vi.fn(), createBoard: vi.fn(), boardDetail: vi.fn(), emitConsolidated: vi.fn(),
  emitBoardReport: vi.fn(), closeBoard: vi.fn(), reopenBoard: vi.fn(), assignBoardChair: vi.fn(), uploadBoardEvidence: vi.fn(), boardFile: vi.fn(),
}))
vi.mock('../application/course-board.service', () => mocks)
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({ authMiddleware: async (req: { user: unknown }) => { req.user = { ...mocks.actor } } }))
vi.mock('../../../shared/infrastructure/services/storage.service', () => ({ storage: { getStream: vi.fn(async () => Readable.from(Buffer.from('%PDF-1.4\nexample'))) } }))
import routes from './course-board.routes'
import { storage } from '../../../shared/infrastructure/services/storage.service'

let app: ReturnType<typeof Fastify>
beforeEach(async () => {
  vi.resetAllMocks()
  mocks.actor.permissions = ['reports:read:own']
  mocks.boardOptions.mockResolvedValue({ years: [], parallels: [], periods: [] })
  mocks.createBoard.mockResolvedValue({ id: 'board' })
  mocks.closeBoard.mockResolvedValue({ id: 'file' })
  vi.mocked(storage.getStream).mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4\nexample')))
  app = Fastify()
  await app.register(multipart)
  await app.register(routes)
})
afterEach(async () => { await app.close() })

describe('authenticated course board endpoints', () => {
  it.each(['/course-boards/options', '/course-boards/board', '/course-board-evidence/file'])('requires report access for %s', async (url) => {
    mocks.actor.permissions = []
    const response = await app.inject({ method: 'GET', url })
    expect(response.statusCode).toBe(403)
    expect(mocks.boardOptions).not.toHaveBeenCalled()
    expect(mocks.boardDetail).not.toHaveBeenCalled()
    expect(mocks.boardFile).not.toHaveBeenCalled()
  })
  it('validates the requested document type and uses the authenticated course scope', async () => {
    mocks.emitMeetingDocument.mockResolvedValue({ id: 'file' })
    const valid = await app.inject({ method: 'POST', url: '/course-boards/board/documents/CALL' })
    expect(valid.statusCode).toBe(200)
    expect(mocks.emitMeetingDocument).toHaveBeenCalledWith('school', expect.objectContaining({ userId: 'teacher' }), 'board', 'CALL')
    const invalid = await app.inject({ method: 'POST', url: '/course-boards/board/documents/OTHER' })
    expect(invalid.statusCode).toBe(400)
    expect(mocks.emitMeetingDocument).toHaveBeenCalledTimes(1)
  })
  it('uses the authenticated school and actor when creating the course folder', async () => {
    const response = await app.inject({ method: 'POST', url: '/course-boards', payload: { parallelId: 'parallel', periodId: 'period', institutionId: 'forged' } })
    expect(response.statusCode).toBe(201)
    expect(mocks.createBoard).toHaveBeenCalledWith('school', expect.objectContaining({ userId: 'teacher' }), 'parallel', 'period')
  })
  it.each([{}, { conclusions: 'Acuerdos' }, { conclusions: 'abc', revision: 0 }, { conclusions: 'Acuerdos', revision: -1 }])('rejects incomplete or invalid closing requests', async (payload) => {
    const response = await app.inject({ method: 'POST', url: '/course-boards/board/close', payload })
    expect(response.statusCode).toBe(400)
    expect(mocks.closeBoard).not.toHaveBeenCalled()
  })
  it('passes the reviewed revision to the closing operation', async () => {
    const response = await app.inject({ method: 'POST', url: '/course-boards/board/close', payload: { conclusions: 'Acuerdos de la junta', revision: 4, matrixHash: 'a'.repeat(64) } })
    expect(response.statusCode).toBe(200)
    expect(mocks.closeBoard).toHaveBeenCalledWith('school', expect.objectContaining({ userId: 'teacher' }), 'board', 'Acuerdos de la junta', 4, 'a'.repeat(64))
  })
  it('publishes only the previewed revision using authenticated scope', async () => {
    mocks.publishInvitation.mockResolvedValue({ id: 'notice' })
    const invalid = await app.inject({ method: 'POST', url: '/course-boards/board/invitation', payload: {} })
    expect(invalid.statusCode).toBe(400)
    const response = await app.inject({ method: 'POST', url: '/course-boards/board/invitation', payload: { revision: 3 } })
    expect(response.statusCode).toBe(200)
    expect(mocks.publishInvitation).toHaveBeenCalledWith('school', expect.objectContaining({ userId: 'teacher' }), 'board', 3)
  })
  it('serves private files with safe headers and no cache', async () => {
    mocks.boardFile.mockResolvedValue({ storedName: 'course-boards/private.pdf', mimeType: 'application/pdf', fileName: 'Acta de junta.pdf' })
    const response = await app.inject({ method: 'GET', url: '/course-board-evidence/file' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(response.headers['content-disposition']).toContain('Acta%20de%20junta.pdf')
    expect(mocks.boardFile).toHaveBeenCalledWith('school', expect.objectContaining({ userId: 'teacher' }), 'file')
  })
})
