import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ studentEnrollment: { findMany: vi.fn() } }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))

import { PrismaEnrollmentRepository } from './prisma-enrollment.repository'

describe('enrollment lists', () => {
  beforeEach(() => { db.studentEnrollment.findMany.mockReset().mockResolvedValue([]) })

  it('shows active enrollments by default and allows inactive ones for recovery', async () => {
    const repo = new PrismaEnrollmentRepository()
    await repo.list('school', 'parallel', 'year')
    expect(db.studentEnrollment.findMany.mock.calls[0][0].where).toMatchObject({ institutionId: 'school', status: 'active' })
    await repo.list('school', 'parallel', 'year', true)
    expect(db.studentEnrollment.findMany.mock.calls[1][0].where).not.toHaveProperty('status')
    await repo.listForTeacher('school', ['parallel'], 'year')
    expect(db.studentEnrollment.findMany.mock.calls[2][0].where).toMatchObject({ status: 'active', parallelId: { in: ['parallel'] } })
  })
})
