import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isValidStudentDocument, normalizeStudentDocument } from '../../../../shared/domain/student-document'

const db = vi.hoisted(() => ({
  role: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
  user: { create: vi.fn() },
  userRole: { create: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn().mockResolvedValue('password-hash') } }))
import { PrismaEnrollmentRepository } from './prisma-enrollment.repository'

describe('student documents in enrollment imports', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.role.findFirst.mockResolvedValue({ id: 'student-role' })
    db.profile.findFirst.mockResolvedValue(null)
    db.user.create.mockResolvedValue({ id: 'student' })
    db.$transaction.mockImplementation((callback) => callback(db))
  })

  it('preserves foreign codes and leading zeroes in both the profile and login identifier', async () => {
    const result = await new PrismaEnrollmentRepository().bulkCreateStudents('school', {
      students: [' e123456789 ', 'DA123456', '0123456789'].map((dni) => ({ dni, firstName: 'Ana', lastName: 'Pérez' })),
    })
    expect(result.created).toBe(3)
    for (const [index, dni] of ['E123456789', 'DA123456', '0123456789'].entries()) {
      expect(db.user.create.mock.calls[index][0].data).toMatchObject({
        institutionId: 'school', email: dni, profile: { create: { dni } },
      })
    }
  })

  it('detects the same foreign code twice after normalizing case and surrounding spaces', async () => {
    const result = await new PrismaEnrollmentRepository().bulkCreateStudents('school', {
      students: ['E123456789', ' e123456789 '].map((dni) => ({ dni, firstName: 'Ana', lastName: 'Pérez' })),
    })
    expect(result).toMatchObject({ created: 1, skipped: 1 })
    expect(db.user.create).toHaveBeenCalledTimes(1)
  })

  it('keeps ambiguous numeric lengths and malformed codes out of writes', async () => {
    const result = await new PrismaEnrollmentRepository().bulkCreateStudents('school', {
      students: ['123456789', '123456789012', 'E123-456789', 'E123 456789', 'ABCDEFGHIJ', 'A1', 'A'.repeat(20)+'1'].map((dni) => ({ dni, firstName: 'Ana', lastName: 'Pérez' })),
    })
    expect(result).toMatchObject({ created: 0, skipped: 7 })
    expect(db.user.create).not.toHaveBeenCalled()
    expect(normalizeStudentDocument(' E123-456789 ')).toBe('E123-456789')
    expect(isValidStudentDocument('0000000001')).toBe(true)
  })
})
