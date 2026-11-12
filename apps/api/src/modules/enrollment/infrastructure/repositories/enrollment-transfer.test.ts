import { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  parallel: { findFirst: vi.fn() },
  studentEnrollment: { findMany: vi.fn(), count: vi.fn(), updateMany: vi.fn() },
  auditLog: { createMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import { PrismaEnrollmentRepository } from './prisma-enrollment.repository'

const source = { id: 'morning', name: 'A-M', institutionId: 'school', academicYearId: 'year', levelId: 'level', isActive: true, capacity: null, educationOffer: null }
const destination = { ...source, id: 'afternoon', name: 'A-V', capacity: 30 }
const input = { sourceParallelId: 'morning', targetParallelId: 'afternoon', enrollmentIds: ['e1', 'e2'], reason: ' Solicitud del representante ' }
const actor = { userId: 'admin', impersonatorId: 'platform', ipAddress: '127.0.0.1', userAgent: 'test' }
const repo = new PrismaEnrollmentRepository()

beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation((callback) => callback(db))
  db.parallel.findFirst.mockImplementation(async ({ where }) => where.id === source.id ? source : destination)
  db.studentEnrollment.findMany.mockResolvedValue([{ id: 'e1', studentId: 's1' }, { id: 'e2', studentId: 's2' }])
  db.studentEnrollment.count.mockResolvedValue(28)
  db.studentEnrollment.updateMany.mockResolvedValue({ count: 2 })
  db.auditLog.createMany.mockResolvedValue({ count: 2 })
})

describe('internal enrollment transfers', () => {
  it('moves the existing active enrollments atomically, preserving all other fields and recording each move', async () => {
    expect(await repo.transfer('school', input, actor)).toEqual({ transferred: 2, sourceParallelId: 'morning', targetParallelId: 'afternoon' })
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(db.parallel.findFirst.mock.calls.map(([args]) => args.where)).toEqual([
      { id: 'morning', institutionId: 'school' }, { id: 'afternoon', institutionId: 'school' },
    ])
    expect(db.studentEnrollment.updateMany).toHaveBeenCalledWith({
      where: { institutionId: 'school', id: { in: ['e1', 'e2'] }, parallelId: 'morning', academicYearId: 'year', status: 'active' },
      data: { parallelId: 'afternoon' },
    })
    const logs = db.auditLog.createMany.mock.calls[0][0].data
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({
      institutionId: 'school', userId: 'admin', impersonatorId: 'platform', resourceId: 'e1',
      action: 'enrollment.parallel_transfer',
      oldValue: { parallelId: 'morning', parallelName: 'A-M' },
      newValue: { parallelId: 'afternoon', parallelName: 'A-V', studentId: 's1', academicYearId: 'year', reason: 'Solicitud del representante' },
    })
  })

  it.each([
    { ...input, enrollmentIds: [] },
    { ...input, enrollmentIds: ['e1', 'e1'] },
    { ...input, enrollmentIds: Array.from({ length: 501 }, (_, i) => String(i)) },
    { ...input, targetParallelId: 'morning' },
  ])('rejects an invalid selection before opening a transaction', async (dto) => {
    await expect(repo.transfer('school', dto, actor)).rejects.toMatchObject({ statusCode: 400 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it.each([
    { isActive: false }, { academicYearId: 'other-year' }, { levelId: 'other-level' }, { educationOffer: 'BACHILLERATO_TECNICO' },
  ])('rejects incompatible or inactive destinations: %j', async (changes) => {
    db.parallel.findFirst.mockImplementation(async ({ where }) => where.id === source.id ? source : { ...destination, ...changes })
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 400 })
    expect(db.studentEnrollment.updateMany).not.toHaveBeenCalled()
  })

  it.each(['morning', 'afternoon'])('rejects a missing or foreign-school parallel: %s', async (missingId) => {
    db.parallel.findFirst.mockImplementation(async ({ where }) => where.id === missingId ? null : destination)
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 404 })
    expect(db.studentEnrollment.updateMany).not.toHaveBeenCalled()
  })

  it('rejects the entire selection if one enrollment is withdrawn, outside the source, or has already moved', async () => {
    db.studentEnrollment.findMany.mockResolvedValue([{ id: 'e1', studentId: 's1' }])
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.studentEnrollment.findMany.mock.calls[0][0].where).toMatchObject({ institutionId: 'school', parallelId: 'morning', status: 'active', academicYearId: 'year' })
    expect(db.studentEnrollment.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a destination without enough capacity for the complete selection', async () => {
    db.studentEnrollment.count.mockResolvedValue(29)
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.studentEnrollment.updateMany).not.toHaveBeenCalled()
    expect(db.auditLog.createMany).not.toHaveBeenCalled()
  })

  it('allows destinations without a configured capacity', async () => {
    db.parallel.findFirst.mockImplementation(async ({ where }) => where.id === source.id ? source : { ...destination, capacity: null })
    await expect(repo.transfer('school', input, actor)).resolves.toMatchObject({ transferred: 2 })
    expect(db.studentEnrollment.count).not.toHaveBeenCalled()
  })

  it('aborts when the selected rows change before the update', async () => {
    db.studentEnrollment.updateMany.mockResolvedValue({ count: 1 })
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.auditLog.createMany).not.toHaveBeenCalled()
  })

  it('fails the transaction if the transfer history cannot be recorded', async () => {
    db.auditLog.createMany.mockRejectedValue(new Error('audit unavailable'))
    await expect(repo.transfer('school', input, actor)).rejects.toThrow('audit unavailable')
    expect(db.$transaction).toHaveBeenCalledTimes(1)
  })

  it('retries serialization conflicts and revalidates against current enrollment data', async () => {
    db.$transaction.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }))
    await expect(repo.transfer('school', input, actor)).resolves.toMatchObject({ transferred: 2 })
    expect(db.$transaction).toHaveBeenCalledTimes(2)
  })

  it('returns a conflict after three unsuccessful serialization attempts', async () => {
    db.$transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('conflict', { code: 'P2034', clientVersion: 'test' }))
    await expect(repo.transfer('school', input, actor)).rejects.toMatchObject({ statusCode: 409 })
    expect(db.$transaction).toHaveBeenCalledTimes(3)
  })
})
