import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  subject: { findFirst: vi.fn(), create: vi.fn() },
  level: { findFirst: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  parallel: { findMany: vi.fn(), deleteMany: vi.fn() },
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))

import { cleanupUnusedPersonalParallels, resolvePersonalLevel, resolvePersonalSubject } from './personal-structure.service'

beforeEach(() => vi.resetAllMocks())

describe('personal subjects outside the official curriculum', () => {
  it('creates a subject without any official curriculum or workload link', async () => {
    db.subject.findFirst.mockResolvedValue(null)
    db.subject.create.mockResolvedValue({ id: 'robotics' })
    await resolvePersonalSubject('personal', 'competencias', { gradeCode: '8B', customSubjectName: '  Robótica  ' })
    expect(db.subject.findFirst).toHaveBeenCalledWith({ where: {
      institutionId: 'personal', name: { equals: 'Robótica', mode: 'insensitive' }, curriculumAreaId: null, competencyAreaId: null,
    } })
    expect(db.subject.create).toHaveBeenCalledWith({ data: { institutionId: 'personal', name: 'Robótica' } })
  })

  it('reuses a custom subject across grades', async () => {
    const subject = { id: 'robotics', name: 'Robótica' }
    db.subject.findFirst.mockResolvedValue(subject)
    expect(await resolvePersonalSubject('personal', 'destrezas', { gradeCode: '9B', customSubjectName: 'Robótica' })).toEqual(subject)
    expect(db.subject.create).not.toHaveBeenCalled()
  })

  it('preserves an existing subject when saving after a planning model change', async () => {
    const subject = { id: 'existing', curriculumAreaId: 'area', competencyAreaId: null }
    db.subject.findFirst.mockResolvedValue(subject)
    expect(await resolvePersonalSubject('personal', 'competencias', { gradeCode: '8B', subjectId: 'existing' })).toEqual(subject)
    expect(db.subject.findFirst).toHaveBeenCalledWith({ where: { id: 'existing', institutionId: 'personal' } })
  })

  it('rejects subjects belonging to another account', async () => {
    db.subject.findFirst.mockResolvedValue(null)
    await expect(resolvePersonalSubject('personal', 'competencias', { gradeCode: '8B', subjectId: 'foreign' })).rejects.toThrow('Materia no encontrada')
    expect(db.subject.create).not.toHaveBeenCalled()
  })

  it('rejects blank names and missing selections', async () => {
    await expect(resolvePersonalSubject('personal', 'competencias', { gradeCode: '8B', customSubjectName: '   ' })).rejects.toThrow('entre 1 y 150')
    await expect(resolvePersonalSubject('personal', 'competencias', { gradeCode: '8B' })).rejects.toThrow('Selecciona una materia')
  })
})

describe('personal grades for other countries', () => {
  it('creates an independent grade without a MINEDUC sublevel', async () => {
    db.level.findFirst.mockResolvedValue(null)
    await resolvePersonalLevel('personal', { gradeCode: '__custom__', customGradeName: ' Grade 8 ' })
    expect(db.level.create).toHaveBeenCalledWith({ data: {
      institutionId: 'personal', name: 'Grade 8', code: expect.stringMatching(/^CUSTOM_[A-F0-9]{12}$/), sortOrder: 100,
    } })
  })

  it('reuses the saved custom grade and scopes it to the account', async () => {
    const level = { id: 'grade', code: 'CUSTOM_ABC', name: 'Grade 8' }
    db.level.findFirst.mockResolvedValue(level)
    expect(await resolvePersonalLevel('personal', { gradeCode: 'CUSTOM_ABC' })).toEqual(level)
    expect(db.level.findFirst).toHaveBeenCalledWith({ where: { institutionId: 'personal', code: 'CUSTOM_ABC' } })
    expect(db.level.create).not.toHaveBeenCalled()
  })
})


describe('saving personal classes with existing students', () => {
  const emptyCounts = { enrollments: 0, attendanceRecords: 0, interdisciplinaryProjects: 0, multigradeGroupMembers: 0 }

  it.each(Object.keys(emptyCounts))('keeps a parallel and its grade when it has %s', async (relation) => {
    db.parallel.findMany.mockResolvedValue([{
      id: 'existing-classroom', levelId: 'existing-grade', _count: { ...emptyCounts, [relation]: 1 },
    }])
    await expect(cleanupUnusedPersonalParallels('personal', 'year')).resolves.toBeUndefined()
    expect(db.parallel.deleteMany).not.toHaveBeenCalled()
    expect(db.level.deleteMany).not.toHaveBeenCalled()
  })

  it('still cleans up genuinely empty classrooms and unused grades', async () => {
    db.parallel.findMany.mockResolvedValue([{
      id: 'empty-classroom', levelId: 'empty-grade', _count: emptyCounts,
    }])
    db.parallel.deleteMany.mockResolvedValue({ count: 1 })
    await cleanupUnusedPersonalParallels('personal', 'year')
    expect(db.parallel.deleteMany).toHaveBeenCalledWith({ where: {
      id: 'empty-classroom', institutionId: 'personal', academicYearId: 'year',
      courseAssignments: { none: {} }, enrollments: { none: {} }, attendanceRecords: { none: {} },
      interdisciplinaryProjects: { none: {} }, multigradeGroupMembers: { none: {} },
    } })
    expect(db.level.deleteMany).toHaveBeenCalledWith({ where: {
      id: 'empty-grade', institutionId: 'personal', parallels: { none: {} },
    } })
  })

  it('keeps the grade if the classroom acquires dependent data before deletion', async () => {
    db.parallel.findMany.mockResolvedValue([{
      id: 'newly-enrolled-classroom', levelId: 'existing-grade', _count: emptyCounts,
    }])
    db.parallel.deleteMany.mockResolvedValue({ count: 0 })
    await cleanupUnusedPersonalParallels('personal', 'year')
    expect(db.level.deleteMany).not.toHaveBeenCalled()
  })
})
