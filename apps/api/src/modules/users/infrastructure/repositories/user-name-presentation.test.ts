import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ user: { findMany: vi.fn(), count: vi.fn() } }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import { PrismaUserRepository } from './prisma-user.repository'

describe('user directory names', () => {
  beforeEach(() => vi.resetAllMocks())

  it('orders before pagination and preserves compound names for editing', async () => {
    db.user.count.mockResolvedValue(30)
    db.user.findMany.mockResolvedValue([{
      id: 'user', email: 'ana@example.test', isActive: true,
      createdAt: new Date('2026-01-01'), userRoles: [],
      profile: { firstName: 'Ana María', lastName: 'De la Cruz Pérez', dni: '0012345678', phone: '0991234567', avatarUrl: null },
    }])

    const result = await new PrismaUserRepository().list('school', { page: 2, limit: 10 })

    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { institutionId: 'school' }, skip: 10, take: 10,
      orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { id: 'asc' }],
    }))
    expect(result.data[0]).toMatchObject({
      fullName: 'De la Cruz Pérez Ana María',
      firstName: 'Ana María', lastName: 'De la Cruz Pérez', dni: '0012345678', phone: '0991234567',
    })
    expect(result.total).toBe(30)
  })

  it('keeps the email fallback when a user has no profile', async () => {
    db.user.count.mockResolvedValue(1)
    db.user.findMany.mockResolvedValue([{
      id: 'user', email: 'ana@example.test', isActive: true,
      createdAt: new Date('2026-01-01'), userRoles: [], profile: null,
    }])
    const result = await new PrismaUserRepository().list('school', {})
    expect(result.data[0]).toMatchObject({ fullName: 'ana@example.test', firstName: '', lastName: '' })
  })
})
