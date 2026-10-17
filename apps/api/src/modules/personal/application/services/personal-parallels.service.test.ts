import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  institution: { findUnique: vi.fn() },
  parallel: { findFirst: vi.fn(), deleteMany: vi.fn() },
  courseAssignment: { deleteMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import { deletePersonalParallel } from './personal-parallels.service'

const classroomCounts = { enrollments: 0, attendanceRecords: 0, interdisciplinaryProjects: 0, multigradeGroupMembers: 0 }
const assignmentCounts = {
  activities: 0, insumos: 0, attendance: 0, schedule: 0, tasks: 0, recoveries: 0,
  pedagogicRecoveries: 0, curriculumPlans: 0, reinforcementPlans: 0, interdisciplinaryContributions: 0,
}
const emptyParallel = () => ({
  _count: { ...classroomCounts },
  courseAssignments: [{ id: 'unused-assignment', _count: { ...assignmentCounts } }],
})

beforeEach(() => {
  vi.resetAllMocks()
  db.institution.findUnique.mockResolvedValue({ settings: { accountType: 'personal' } })
  db.parallel.findFirst.mockResolvedValue(emptyParallel())
  db.courseAssignment.deleteMany.mockResolvedValue({ count: 1 })
  db.parallel.deleteMany.mockResolvedValue({ count: 1 })
  db.$transaction.mockImplementation(async (operation) => operation(db))
})

describe('deleting unused personal parallels', () => {
  it('deletes unused assignments and the parallel in one transaction', async () => {
    await expect(deletePersonalParallel('personal', 'parallel')).resolves.toBeUndefined()
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'Serializable' })
    expect(db.courseAssignment.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({
      institutionId: 'personal', parallelId: 'parallel',
    }) })
    expect(db.parallel.deleteMany).toHaveBeenCalledWith({ where: expect.objectContaining({
      id: 'parallel', institutionId: 'personal', enrollments: { none: {} }, courseAssignments: { none: {} },
    }) })
  })

  it('also deletes a parallel without subject assignments', async () => {
    db.parallel.findFirst.mockResolvedValue({ _count: classroomCounts, courseAssignments: [] })
    db.courseAssignment.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deletePersonalParallel('personal', 'parallel')).resolves.toBeUndefined()
    expect(db.parallel.deleteMany).toHaveBeenCalledOnce()
  })

  it('rejects institutional accounts before performing any deletion', async () => {
    db.institution.findUnique.mockResolvedValue({ settings: {} })
    await expect(deletePersonalParallel('institution', 'parallel')).rejects.toMatchObject({ statusCode: 403 })
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it('does not allow deleting a parallel belonging to a different account', async () => {
    db.parallel.findFirst.mockResolvedValue(null)
    await expect(deletePersonalParallel('personal', 'foreign')).rejects.toMatchObject({ statusCode: 404 })
    expect(db.parallel.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'foreign', institutionId: 'personal' },
    }))
    expect(db.courseAssignment.deleteMany).not.toHaveBeenCalled()
    expect(db.parallel.deleteMany).not.toHaveBeenCalled()
  })

  it.each(Object.keys(classroomCounts))('protects parallels with %s', async (relation) => {
    db.parallel.findFirst.mockResolvedValue({ ...emptyParallel(), _count: { ...classroomCounts, [relation]: 1 } })
    await expect(deletePersonalParallel('personal', 'parallel')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.courseAssignment.deleteMany).not.toHaveBeenCalled()
    expect(db.parallel.deleteMany).not.toHaveBeenCalled()
  })

  it.each(Object.keys(assignmentCounts))('protects subject assignments with %s', async (relation) => {
    db.parallel.findFirst.mockResolvedValue({
      _count: classroomCounts,
      courseAssignments: [{ id: 'used-assignment', _count: { ...assignmentCounts, [relation]: 1 } }],
    })
    await expect(deletePersonalParallel('personal', 'parallel')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.courseAssignment.deleteMany).not.toHaveBeenCalled()
    expect(db.parallel.deleteMany).not.toHaveBeenCalled()
  })

  it('aborts if an assignment acquired dependent data before deletion', async () => {
    db.courseAssignment.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deletePersonalParallel('personal', 'parallel')).rejects.toMatchObject({ statusCode: 409 })
    expect(db.parallel.deleteMany).not.toHaveBeenCalled()
  })

  it('aborts the transaction if a new enrollment prevents deleting the parallel', async () => {
    db.parallel.deleteMany.mockResolvedValue({ count: 0 })
    await expect(deletePersonalParallel('personal', 'parallel')).rejects.toMatchObject({ statusCode: 409 })
  })

  it.each(['P2003', 'P2014', 'P2034'])('returns a conflict instead of an internal error for %s', async (code) => {
    db.$transaction.mockRejectedValue({ code })
    await expect(deletePersonalParallel('personal', 'parallel')).rejects.toMatchObject({ statusCode: 409 })
  })
})
