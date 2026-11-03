import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ user: { count: vi.fn(), findMany: vi.fn() }, $transaction: vi.fn() }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/teacher-scope.service', () => ({ isPrivilegedStaff: (roles: string[]) => roles.includes('admin'), getTeacherParallelIds: async () => ['own'] }))
import { PrismaStudentFolderRepository } from './prisma-student-folder.repository'
const repo = new PrismaStudentFolderRepository()
const actor = { userId: 'teacher', roles: ['teacher'], permissions: [] }
beforeEach(() => { vi.resetAllMocks(); db.user.count.mockResolvedValue(0); db.user.findMany.mockResolvedValue([]); db.$transaction.mockImplementation((ops) => Promise.all(ops)) })
describe('folder directory search and course filters', () => {
  it('matches multiple first/last name terms without dropping teacher scope', async () => {
    await repo.listAccessibleStudents('school', actor, { search: '  Ana Perez ', parallelId: 'own' })
    const query = db.user.findMany.mock.calls[0][0]
    expect(query.where.institutionId).toBe('school')
    expect(query.where.studentEnrollments.some.parallelId.in).toEqual(['own'])
    expect(query.where.AND).toHaveLength(2)
    expect(query.where.AND[0].OR[0]).toEqual({ profile: { firstName: { contains: 'Ana', mode: 'insensitive' } } })
    expect(query.where.AND[1].OR[1]).toEqual({ profile: { lastName: { contains: 'Perez', mode: 'insensitive' } } })
    expect(query.select.studentEnrollments.where).toEqual({ institutionId: 'school', parallelId: { in: ['own'] } })
  })
  it('cannot escape scope by requesting a different parallel', async () => {
    expect((await repo.listAccessibleStudents('school', actor, { parallelId: 'foreign' })).data).toEqual([])
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
  it('preserves server pagination across the whole student directory', async () => {
    await repo.listAccessibleStudents('school', actor, { page: '2', pageSize: '20', search: 'E009114170' })
    expect(db.user.findMany.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20 })
  })
})
