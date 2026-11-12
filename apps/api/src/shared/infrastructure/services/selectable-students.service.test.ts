import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ user: { findMany: vi.fn() } }))
vi.mock('../database/prisma', () => ({ prisma: db }))
import { listSelectableStudents } from './selectable-students.service'

describe('student form directory', () => {
  beforeEach(() => { vi.resetAllMocks(); db.user.findMany.mockResolvedValue([]) })
  it('limits teachers to active enrollments in taught or tutored courses', async () => {
    await listSelectableStudents('school', { userId: 'teacher', roles: ['teacher'] })
    const args = db.user.findMany.mock.calls[0][0]
    expect(args.where).toMatchObject({ institutionId: 'school', isActive: true, userRoles: { some: { role: { name: 'student' } } } })
    const enrollment = args.where.studentEnrollments.some
    expect(enrollment).toMatchObject({ institutionId: 'school', status: 'active', parallel: { isActive: true, OR: [{ tutorId: 'teacher' }, { courseAssignments: { some: { institutionId: 'school', teacherId: 'teacher', isActive: true } } }] } })
    expect(args.select.studentEnrollments.where).toEqual(enrollment)
    expect(args.take).toBeUndefined()
  })
  it('returns documents and course labels for students who share a name', async () => {
    db.user.findMany.mockResolvedValue([{ id: 'student', profile: { firstName: 'ANA', lastName: 'PÉREZ', dni: 'E009114170' }, studentEnrollments: [{ parallel: { id: '2AM', name: 'A-M', level: { name: 'Segundo' }, academicYear: { name: '2026-2027' } } }] }])
    expect(await listSelectableStudents('school', { userId: 'teacher', roles: ['teacher'] })).toEqual([{ id: 'student', fullName: 'PÉREZ ANA', dni: 'E009114170', groups: [{ id: '2AM', name: 'A-M', levelName: 'Segundo', yearName: '2026-2027' }] }])
  })
  it.each(['admin', 'rector', 'inspector', 'dece'])('preserves institution-wide student access for %s', async (role) => {
    await listSelectableStudents('school', { userId: 'staff', roles: [role] })
    const args = db.user.findMany.mock.calls[0][0]
    expect(args.where.institutionId).toBe('school')
    expect(args.where.studentEnrollments).toBeUndefined()
    expect(args.select.studentEnrollments.where.parallel.OR).toBeUndefined()
  })
  it('rejects non-staff directory access before querying students', async () => {
    await expect(listSelectableStudents('school', { userId: 'student', roles: ['student'] })).rejects.toThrow()
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
