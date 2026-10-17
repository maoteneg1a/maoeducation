import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  institution: { findUnique: vi.fn(), update: vi.fn() },
  courseAssignment: { updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import { PrismaInstitutionRepository } from './prisma-institution.repository'

beforeEach(() => {
  vi.resetAllMocks()
  db.institution.findUnique.mockResolvedValue({ settings: { accountType: 'personal', gradingConfig: { defaultExamWeight: 30 } } })
  db.institution.update.mockImplementation(async ({ data }) => ({ settings: data.settings }))
  db.$transaction.mockImplementation(async (operation) => operation(db))
})

const repo = new PrismaInstitutionRepository()

describe('administrator period grading percentages', () => {
  it('returns the previous 50/50 split for settings saved before project weights existed', async () => {
    const config = await repo.getGradingConfig('school')
    expect(config.defaultExamWeight).toBe(30)
    expect(config.defaultProjectWeight).toBe(15)
  })

  it('applies changed percentages to existing courses in this account and preserves unrelated settings', async () => {
    const config = await repo.updateGradingConfig('school', { defaultExamWeight: 30, defaultProjectWeight: 10 })
    expect(config.defaultProjectWeight).toBe(10)
    expect(db.courseAssignment.updateMany).toHaveBeenCalledWith({
      where: { institutionId: 'school' }, data: { examWeight: 30, projectWeight: 10 },
    })
    expect(db.institution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { settings: expect.objectContaining({ accountType: 'personal' }) },
    }))
  })

  it('keeps per-course overrides when saving unrelated configuration', async () => {
    await repo.updateGradingConfig('school', { educarEcuadorExportEnabled: false })
    expect(db.courseAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('preserves the project percentage when an older client resends the same combined weight', async () => {
    db.institution.findUnique.mockResolvedValue({ settings: { gradingConfig: { defaultExamWeight: 30, defaultProjectWeight: 10 } } })
    const config = await repo.updateGradingConfig('school', { defaultExamWeight: 30 })
    expect(config.defaultProjectWeight).toBe(10)
    expect(db.courseAssignment.updateMany).not.toHaveBeenCalled()
  })

  it('rejects invalid project percentages before writing configuration or recalculating courses', async () => {
    await expect(repo.updateGradingConfig('school', { defaultExamWeight: 30, defaultProjectWeight: 40 })).rejects.toMatchObject({ statusCode: 400 })
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.courseAssignment.updateMany).not.toHaveBeenCalled()
    expect(db.institution.update).not.toHaveBeenCalled()
  })
})
