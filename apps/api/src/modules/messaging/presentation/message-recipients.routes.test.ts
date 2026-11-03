import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const { actor, db, sendPush } = vi.hoisted(() => ({
  actor: { sub: 'teacher', institutionId: 'school', roles: ['teacher'] },
  sendPush: vi.fn(),
  db: { parallel: { findMany: vi.fn() }, studentEnrollment: { findMany: vi.fn() }, user: { findMany: vi.fn(), count: vi.fn() } },
}))
vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({ authMiddleware: async (req: any) => { req.user = { ...actor } } }))
vi.mock('../../../shared/infrastructure/services/storage.service', () => ({ storage: {} }))
vi.mock('../../../shared/infrastructure/services/push.service', () => ({ sendPushToUser: sendPush }))
import messageRoutes from './message.routes'

describe('message recipient courses and complete rosters', () => {
  let app: ReturnType<typeof Fastify>
  const groups = [
    { id: '2AM', name: 'A-M', academicYearId: 'year', academicYear: { name: '2026-2027' }, level: { name: 'Segundo' } },
    { id: '5BM', name: 'B-M', academicYearId: 'year', academicYear: { name: '2026-2027' }, level: { name: 'Quinto' } },
  ]
  beforeEach(async () => {
    vi.resetAllMocks(); actor.roles = ['teacher']; actor.sub = 'teacher'
    db.parallel.findMany.mockResolvedValue(groups)
    db.studentEnrollment.findMany.mockResolvedValue(Array.from({ length: 45 }, (_, i) => ({ studentId: `student-${i}`, student: { studentGuardians: [{ guardianId: 'shared-guardian' }] } })))
    db.user.findMany.mockImplementation(async ({ where }: any) => (where.id.in ?? []).map((id: string) => ({ id, email: id, profile: { firstName: id, lastName: 'Test' }, userRoles: [{ role: { name: id.startsWith('student') ? 'student' : 'guardian' } }] })))
    app = Fastify(); await app.register(messageRoutes)
  })
  afterEach(async () => { await app.close() })
  it('offers each parallel once using parallel scope, with active subjects OR tutor and active year', async () => {
    const response = await app.inject('/messages/recipient-groups')
    expect(response.statusCode).toBe(200); expect(response.json()).toHaveLength(2)
    expect(db.parallel.findMany.mock.calls[0][0].where).toEqual({ institutionId: 'school', isActive: true, academicYear: { isActive: true }, OR: [{ tutorId: 'teacher' }, { courseAssignments: { some: { institutionId: 'school', teacherId: 'teacher', isActive: true } } }] })
  })
  it('returns all 45 students and one shared guardian instead of truncating to 30', async () => {
    const response = await app.inject('/messages/recipients')
    expect(response.statusCode).toBe(200); expect(response.json()).toHaveLength(46)
    expect(db.user.findMany.mock.calls[0][0].take).toBeUndefined()
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({ institutionId: 'school', isActive: true })
    expect(db.studentEnrollment.findMany.mock.calls[0][0].where).toEqual({ institutionId: 'school', status: 'active', OR: [{ parallelId: '2AM', academicYearId: 'year' }, { parallelId: '5BM', academicYearId: 'year' }] })
  })
  it('filters a complete roster by course, not subject', async () => {
    db.parallel.findMany.mockResolvedValue([groups[0]])
    const response = await app.inject('/messages/recipients?parallelId=2AM&audience=students')
    expect(response.json()).toHaveLength(45)
    expect(db.parallel.findMany.mock.calls[0][0].where.id).toBe('2AM')
    expect(db.studentEnrollment.findMany.mock.calls[0][0].where.OR).toEqual([{ parallelId: '2AM', academicYearId: 'year' }])
  })
  it('deduplicates representatives across siblings and courses', async () => {
    const response = await app.inject('/messages/recipients?audience=guardians')
    expect(response.json()).toHaveLength(1); expect(response.json()[0].id).toBe('shared-guardian')
  })
  it('retains course scope while searching by name', async () => {
    await app.inject('/messages/recipients?parallelId=2AM&q=Ana')
    const where = db.user.findMany.mock.calls[0][0].where
    expect(where.id.in).toHaveLength(46)
    expect(where.OR[0]).toEqual({ profile: { firstName: { contains: 'Ana', mode: 'insensitive' } } })
  })
  it('rejects an unrelated or foreign course even when requested by ID', async () => {
    db.parallel.findMany.mockResolvedValue([])
    expect((await app.inject('/messages/recipients?parallelId=foreign')).statusCode).toBe(403)
    expect(db.studentEnrollment.findMany).not.toHaveBeenCalled()
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
  it('returns no recipients when the teacher has no courses', async () => {
    db.parallel.findMany.mockResolvedValue([])
    const response = await app.inject('/messages/recipients')
    expect(response.json()).toEqual([])
    expect(db.studentEnrollment.findMany).not.toHaveBeenCalled()
  })
  it('does not allow students to browse course rosters', async () => {
    actor.roles = ['student']
    expect((await app.inject('/messages/recipient-groups')).statusCode).toBe(403)
    expect((await app.inject('/messages/recipients?parallelId=2AM')).statusCode).toBe(403)
  })
  it('allows privileged staff to filter a course and keeps the institution restriction', async () => {
    actor.roles = ['admin']
    await app.inject('/messages/recipients?parallelId=2AM&audience=guardians')
    expect(db.parallel.findMany.mock.calls[0][0].where).toEqual({ institutionId: 'school', isActive: true, academicYear: { isActive: true }, id: '2AM' })
  })
  it('validates recipient IDs again on submission and does not send to forbidden targets', async () => {
    db.user.count.mockResolvedValue(0)
    const response = await app.inject({ method: 'POST', url: '/messages/threads', payload: { subject: 'Test', body: 'Test', recipientIds: ['foreign-user'] } })
    expect(response.statusCode).toBe(403)
    expect(db.user.count.mock.calls[0][0].where).toMatchObject({ institutionId: 'school', isActive: true, id: { in: ['foreign-user'] } })
    expect(sendPush).not.toHaveBeenCalled()
  })
})
