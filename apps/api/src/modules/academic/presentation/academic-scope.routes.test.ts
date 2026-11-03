import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { db, actor } = vi.hoisted(() => ({
  actor: { sub: 'teacher-a', institutionId: 'school-a', roles: ['teacher'] },
  db: {
    level: { findMany: vi.fn() },
    subject: { findMany: vi.fn() },
    parallel: { findMany: vi.fn() },
    courseAssignment: { findMany: vi.fn(), findFirst: vi.fn() },
    curricularWorkload: { findMany: vi.fn() },
  },
}))
vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({
  authMiddleware: async (req: { user: unknown }) => { req.user = { ...actor } },
}))
vi.mock('../../../shared/infrastructure/middleware/rbac.middleware', () => ({ requirePermission: () => async () => {} }))
vi.mock('../../../shared/infrastructure/services/audit.service', () => ({ audit: vi.fn() }))

import academicRoutes from './academic.routes'

describe('academic selectors respect the authenticated teacher', () => {
  let app: ReturnType<typeof Fastify>
  beforeEach(async () => {
    vi.resetAllMocks()
    actor.sub = 'teacher-a'; actor.institutionId = 'school-a'; actor.roles = ['teacher']
    for (const model of [db.level, db.subject, db.parallel, db.courseAssignment, db.curricularWorkload]) model.findMany.mockResolvedValue([])
    app = Fastify()
    await app.register(academicRoutes)
  })
  afterEach(async () => { await app.close() })

  it('scopes assignments without relying on a teacherId sent by the browser', async () => {
    const response = await app.inject({ method: 'GET', url: '/academic/course-assignments' })
    expect(response.statusCode).toBe(200)
    expect(db.courseAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { institutionId: 'school-a', teacherId: 'teacher-a', isActive: true, parallel: { isActive: true } },
    }))
  })

  it('cannot select another teacher by changing the query string', async () => {
    const response = await app.inject({ method: 'GET', url: '/academic/course-assignments?teacherId=teacher-b' })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
    expect(db.courseAssignment.findMany).not.toHaveBeenCalled()
  })

  it('combines year and parallel filters with ownership instead of replacing it', async () => {
    await app.inject({ method: 'GET', url: '/academic/course-assignments?parallelId=other-parallel&yearId=year&teacherId=teacher-a' })
    expect(db.courseAssignment.findMany.mock.calls[0][0].where).toEqual({
      institutionId: 'school-a', teacherId: 'teacher-a', parallelId: 'other-parallel', academicYearId: 'year', isActive: true, parallel: { isActive: true },
    })
  })

  it('only lists the teacher’s subjects, regardless of being tutor of other subjects', async () => {
    await app.inject({ method: 'GET', url: '/academic/subjects' })
    expect(db.subject.findMany.mock.calls[0][0].where).toEqual({
      institutionId: 'school-a', isActive: true, courseAssignments: { some: {
        institutionId: 'school-a', teacherId: 'teacher-a', isActive: true, parallel: { isActive: true },
      } },
    })
  })

  it('includes taught or tutored parallels within the requested institution and year', async () => {
    await app.inject({ method: 'GET', url: '/academic/parallels?yearId=year' })
    expect(db.parallel.findMany.mock.calls[0][0].where).toEqual({
      institutionId: 'school-a', academicYearId: 'year', isActive: true,
      OR: [{ tutorId: 'teacher-a' }, { courseAssignments: { some: { institutionId: 'school-a', teacherId: 'teacher-a', isActive: true } } }],
    })
  })

  it('does not expose grades without any taught or tutored parallel', async () => {
    await app.inject({ method: 'GET', url: '/academic/levels' })
    expect(db.level.findMany.mock.calls[0][0].where).toEqual({
      institutionId: 'school-a', isActive: true, parallels: { some: {
        institutionId: 'school-a', isActive: true,
        OR: [{ tutorId: 'teacher-a' }, { courseAssignments: { some: { institutionId: 'school-a', teacherId: 'teacher-a', isActive: true } } }],
      } },
    })
  })

  it.each(['admin', 'rector', 'inspector', 'dece'])('preserves institution-wide visibility for %s, including mixed teacher roles', async (role) => {
    actor.roles = [role, 'teacher']
    await app.inject({ method: 'GET', url: '/academic/course-assignments?teacherId=teacher-b' })
    expect(db.courseAssignment.findMany.mock.calls[0][0].where).toEqual({ institutionId: 'school-a', teacherId: 'teacher-b' })
    await app.inject({ method: 'GET', url: '/academic/parallels?yearId=year' })
    expect(db.parallel.findMany.mock.calls[0][0].where).toEqual({ institutionId: 'school-a', academicYearId: 'year' })
  })

  it('denies unrecognized non-teacher roles even if they have a catalog read permission', async () => {
    actor.roles = ['viewer']
    const response = await app.inject({ method: 'GET', url: '/academic/course-assignments' })
    expect(response.statusCode).toBe(403)
    expect(db.courseAssignment.findMany).not.toHaveBeenCalled()
  })

  it('denies access to a foreign teacher’s workload by direct URL', async () => {
    db.courseAssignment.findFirst.mockResolvedValue({ parallelId: 'other', academicYearId: 'year', teacherId: 'teacher-b', parallel: { tutorId: 'teacher-b' } })
    const response = await app.inject({ method: 'GET', url: '/academic/course-assignments/foreign/workload' })
    expect(response.statusCode).toBe(403)
    expect(db.courseAssignment.findFirst).toHaveBeenCalledTimes(1)
    expect(db.courseAssignment.findFirst.mock.calls[0][0].where).toEqual({ id: 'foreign', institutionId: 'school-a' })
    expect(db.curricularWorkload.findMany).not.toHaveBeenCalled()
  })

  it('does not reveal whether an assignment from another institution exists', async () => {
    db.courseAssignment.findFirst.mockResolvedValue(null)
    const response = await app.inject({ method: 'GET', url: '/academic/course-assignments/other-school/workload' })
    expect(response.statusCode).toBe(404)
    expect(db.curricularWorkload.findMany).not.toHaveBeenCalled()
  })
})
