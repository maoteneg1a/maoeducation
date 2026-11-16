import Fastify from 'fastify'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  actor: { sub: 'invited', institutionId: 'school', roles: ['teacher'] },
  announcement: { findMany: vi.fn(), findFirst: vi.fn() },
  announcementRead: { count: vi.fn(), upsert: vi.fn() },
  announcementRsvp: { count: vi.fn(), upsert: vi.fn() },
  user: { findMany: vi.fn() },
  studentEnrollment: { findMany: vi.fn() },
  guardianStudent: { findMany: vi.fn() },
}))
vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: mocks }))
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({ authMiddleware: async (req: { user: unknown }) => { req.user = mocks.actor } }))
vi.mock('../../../shared/infrastructure/services/push.service', () => ({ sendPushToUser: vi.fn() }))
vi.mock('../../../shared/infrastructure/services/storage.service', () => ({ storage: { getStream: vi.fn(async () => Readable.from(Buffer.from('%PDF-1.4'))) } }))
import routes from './announcement.routes'
import { storage } from '../../../shared/infrastructure/services/storage.service'

let app: ReturnType<typeof Fastify>
const notice = () => ({ id: 'notice', institutionId: 'school', audience: 'selected_users', parallelIds: [], recipientIds: ['invited'], createdBy: 'tutor',
  title: 'Convocatoria', body: 'Junta', communicationType: 'convocation', reads: [], rsvps: [],
  attachmentStoredName: 'private.pdf', attachmentName: 'convocatoria.pdf', attachmentMimeType: 'application/pdf' })
beforeEach(async () => {
  vi.resetAllMocks()
  mocks.actor = { sub: 'invited', institutionId: 'school', roles: ['teacher'] }
  mocks.announcement.findMany.mockResolvedValue([notice()])
  mocks.announcement.findFirst.mockResolvedValue(notice())
  mocks.user.findMany.mockResolvedValue([])
  mocks.studentEnrollment.findMany.mockResolvedValue([])
  mocks.guardianStudent.findMany.mockResolvedValue([])
  mocks.announcementRead.count.mockResolvedValue(0)
  mocks.announcementRsvp.count.mockResolvedValue(0)
  mocks.announcementRsvp.upsert.mockResolvedValue({ response: 'confirmed' })
  vi.mocked(storage.getStream).mockResolvedValue(Readable.from(Buffer.from('%PDF-1.4')))
  app = Fastify(); await app.register(routes)
})
afterEach(async () => { await app.close() })

describe('course-board notices', () => {
  it('shows the invitation and its PDF to an invited teacher', async () => {
    const list = await app.inject({ method: 'GET', url: '/announcements' })
    expect(list.json()).toEqual([expect.objectContaining({ id: 'notice', canRespond: true, canTrack: false })])
    expect((await app.inject({ method: 'GET', url: '/announcements/notice/attachment' })).statusCode).toBe(200)
    const rsvp = await app.inject({ method: 'POST', url: '/announcements/notice/rsvp', payload: { response: 'confirmed' } })
    expect(rsvp.statusCode).toBe(200)
    expect(mocks.announcementRsvp.upsert).toHaveBeenCalled()
  })
  it.each([['unrelated', ['teacher']], ['student', ['student']], ['guardian', ['guardian']]])('excludes %s from the notice and attachment', async (sub, roles) => {
    mocks.actor = { sub: sub as string, institutionId: 'school', roles: roles as string[] }
    const list = await app.inject({ method: 'GET', url: '/announcements' })
    expect(list.json()).toEqual([])
    expect((await app.inject({ method: 'GET', url: '/announcements/notice/attachment' })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/announcements/notice/rsvp', payload: { response: 'confirmed' } })).statusCode).toBe(403)
    expect(mocks.announcementRsvp.upsert).not.toHaveBeenCalled()
  })
  it('allows the tutor who published to track responses without granting general publishing privileges', async () => {
    mocks.actor.sub = 'tutor'
    const list = await app.inject({ method: 'GET', url: '/announcements' })
    expect(list.json()[0]).toEqual(expect.objectContaining({ canRespond: false, canTrack: true }))
    expect((await app.inject({ method: 'GET', url: '/announcements/notice/tracking' })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/announcements', payload: { title: 'Unrelated' } })).statusCode).toBe(403)
  })
  it('lets authorities review but only invited authorities can confirm attendance', async () => {
    mocks.actor = { sub: 'rector', institutionId: 'school', roles: ['rector'] }
    expect((await app.inject({ method: 'GET', url: '/announcements' })).json()[0].canRespond).toBe(false)
    expect((await app.inject({ method: 'POST', url: '/announcements/notice/rsvp', payload: { response: 'confirmed' } })).statusCode).toBe(403)
  })
})
