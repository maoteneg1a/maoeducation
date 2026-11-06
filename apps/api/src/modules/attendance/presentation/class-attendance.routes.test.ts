import Fastify from 'fastify'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

const { db, actor, stored, audits } = vi.hoisted(() => {
  const stored = new Map<string, any>()
  const audits: any[] = []
  const db: any = {
    courseAssignment: { findFirst: vi.fn(), findMany: vi.fn() },
    parallel: { findFirst: vi.fn(), findMany: vi.fn() },
    studentEnrollment: { count: vi.fn(), findMany: vi.fn() },
    attendanceRecord: { findMany: vi.fn(), upsert: vi.fn() },
    classAttendanceRecord: { findMany: vi.fn(), upsert: vi.fn(), groupBy: vi.fn() },
    auditLog: { create: vi.fn() }, $executeRaw: vi.fn(), $transaction: vi.fn(),
  }
  return { db, stored, audits, actor: { sub: 'teacher', institutionId: 'school', roles: ['teacher'] } }
})
vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({ authMiddleware: async (req: any) => { req.user = { ...actor } } }))
vi.mock('../../../shared/infrastructure/middleware/rbac.middleware', () => ({ requirePermission: () => async () => {} }))
vi.mock('../../../shared/infrastructure/services/push.service', () => ({ notifyGuardiansOfStudent: vi.fn(), notifyStudentAndGuardians: vi.fn() }))
import attendanceRoutes from './attendance.routes'
import { notifyStudentAndGuardians } from '../../../shared/infrastructure/services/push.service'

describe('daily attendance and individual class hours', () => {
  let app: ReturnType<typeof Fastify>
  const ca = { id: 'ca', teacherId: 'teacher', parallelId: 'parallel', academicYearId: 'year', parallel: { tutorId: 'tutor', academicYearId: 'year', level: { attendanceMode: 'daily' } } }
  const payload = { courseAssignmentId: 'ca', date: '2026-11-03', period: 2, records: [{ studentId: 'student', status: 'absent', notes: 'No asistió a esta hora' }] }
  beforeEach(async () => {
    vi.resetAllMocks(); stored.clear(); audits.length = 0
    actor.sub = 'teacher'; actor.roles = ['teacher']
    db.courseAssignment.findFirst.mockResolvedValue(ca)
    db.studentEnrollment.count.mockResolvedValue(1)
    db.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student', student: { id: 'student', profile: { firstName: 'Ana', lastName: 'Test' } } }])
    db.parallel.findFirst.mockResolvedValue({ id: 'parallel', academicYearId: 'year', tutorId: 'tutor' })
    db.attendanceRecord.findMany.mockResolvedValue([{ id: 'daily', studentId: 'student', status: 'present' }])
    db.classAttendanceRecord.findMany.mockImplementation(async ({ where }: any) => [...stored.values()].filter((r) => r.period === where.period))
    db.classAttendanceRecord.upsert.mockImplementation(async ({ create, update }: any) => {
      const key = `${create.courseAssignmentId}:${create.studentId}:${create.period}`
      const value = stored.has(key) ? { ...stored.get(key), ...update } : { id: key, ...create }
      stored.set(key, value); return value
    })
    db.auditLog.create.mockImplementation(async ({ data }: any) => { audits.push(data); return data })
    db.$transaction.mockImplementation(async (fn: any) => fn(db))
    app = Fastify(); await app.register(attendanceRoutes)
  })
  afterEach(async () => { await app.close() })

  it('keeps the daily record as reference and an untaken hour unrecorded', async () => {
    const res = await app.inject('/attendance/class-hour?courseAssignmentId=ca&date=2026-11-03&period=2')
    expect(res.statusCode).toBe(200)
    expect(res.json()[0]).toMatchObject({ record: null, dailyRecord: { status: 'present' } })
  })
  it('upserts one hour without overwriting daily attendance or notifying another daily absence', async () => {
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload: { ...payload, records: [{ studentId: 'student', status: 'late' }] } })).statusCode).toBe(200)
    expect(stored.size).toBe(1)
    expect([...stored.values()][0].status).toBe('late')
    expect(db.attendanceRecord.upsert).not.toHaveBeenCalled()
    expect(notifyStudentAndGuardians).not.toHaveBeenCalled()
    expect(audits[1]).toMatchObject({ userId: 'teacher', oldValue: [{ studentId: 'student', status: 'absent' }], newValue: { period: 2, date: '2026-11-03' } })
  })
  it('keeps two teaching hours on the same date separately', async () => {
    await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })
    await app.inject({ method: 'POST', url: '/attendance/class-hour', payload: { ...payload, period: 3 } })
    expect(stored.size).toBe(2)
  })
  it.each([0, 21, 1.5])('rejects invalid hour %s', async (period) => {
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload: { ...payload, period } })).statusCode).toBe(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects invalid calendar dates and duplicate student rows', async () => {
    for (const change of [{ date: '2026-02-30' }, { records: [payload.records[0], payload.records[0]] }]) {
      expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload: { ...payload, ...change } })).statusCode).toBe(400)
    }
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects students outside this parallel', async () => {
    db.studentEnrollment.count.mockResolvedValue(0)
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })).statusCode).toBe(400)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects writes to another teacher’s subject, even by the tutor', async () => {
    actor.sub = 'tutor'
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })).statusCode).toBe(403)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
  it('rejects reads of another teacher’s subject when the viewer is not tutor', async () => {
    actor.sub = 'unrelated-teacher'
    expect((await app.inject('/attendance/class-hour?courseAssignmentId=ca&date=2026-11-03&period=2')).statusCode).toBe(403)
    expect((await app.inject('/attendance/class-history?courseAssignmentId=ca')).statusCode).toBe(403)
    expect(db.classAttendanceRecord.findMany).not.toHaveBeenCalled()
  })
  it('rejects impossible dates when reading an hour', async () => {
    expect((await app.inject('/attendance/class-hour?courseAssignmentId=ca&date=2026-02-30&period=2')).statusCode).toBe(400)
  })
  it('rejects an assignment from another institution', async () => {
    db.courseAssignment.findFirst.mockResolvedValue(null)
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })).statusCode).toBe(404)
    expect(db.courseAssignment.findFirst.mock.calls[0][0].where.institutionId).toBe('school')
  })
  it('does not grant subject teachers permission to overwrite daily attendance', async () => {
    expect((await app.inject({ method: 'POST', url: '/attendance/bulk', payload: { parallelId: 'parallel', date: payload.date, records: payload.records } })).statusCode).toBe(403)
    expect(db.attendanceRecord.upsert).not.toHaveBeenCalled()
  })
  it('records per-subject levels by hour and notifies an official absence', async () => {
    db.courseAssignment.findFirst.mockResolvedValue({ ...ca, parallel: { ...ca.parallel, level: { attendanceMode: 'per_subject' } } })
    expect((await app.inject({ method: 'POST', url: '/attendance/class-hour', payload })).statusCode).toBe(200)
    expect(stored.size).toBe(1)
    await vi.waitFor(() => expect(notifyStudentAndGuardians).toHaveBeenCalledWith('student', expect.objectContaining({ title: 'Asistencia — Auleka' })))
  })
  it('allows a tutor to correct the daily attendance and audits the change', async () => {
    actor.sub = 'tutor'
    expect((await app.inject({ method: 'POST', url: '/attendance/bulk', payload: { parallelId: 'parallel', date: payload.date, records: [{ studentId: 'student', status: 'present' }] } })).statusCode).toBe(200)
    expect(audits[0]).toMatchObject({ userId: 'tutor', action: 'attendance.daily.save' })
    expect(db.classAttendanceRecord.upsert).not.toHaveBeenCalled()
  })
  it('scopes class history before querying and returns separate dates/hours', async () => {
    db.classAttendanceRecord.groupBy.mockResolvedValue([{ date: payload.date, period: 2, _count: { _all: 1 } }])
    const res = await app.inject('/attendance/class-history?courseAssignmentId=ca')
    expect(res.statusCode).toBe(200)
    expect(db.classAttendanceRecord.groupBy.mock.calls[0][0]).toMatchObject({ where: { institutionId: 'school', courseAssignmentId: 'ca' }, by: ['date', 'period'] })
  })
})
