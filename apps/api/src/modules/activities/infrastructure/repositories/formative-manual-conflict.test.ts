vi.mock('../../../../shared/infrastructure/services/period-grades.service', () => ({ computePeriodGrades: vi.fn().mockResolvedValue(new Map()) }))
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaActivityRepository } from './prisma-activity.repository'

const db = vi.hoisted(() => ({
  reinforcementPlan: { findMany: vi.fn() }, $executeRaw: vi.fn(),
  insumo: { findMany: vi.fn() }, studentEnrollment: { findMany: vi.fn() }, institution: { findUnique: vi.fn() },
  formativeReinforcementResult: { findMany: vi.fn() }, manualInsumoAverage: { upsert: vi.fn() }, $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
const repo = new PrismaActivityRepository()
const dto = { items: [{ studentId: 'student', insumoId: 'insumo', score: 6, reason: 'Promedio verificado' }] }
beforeEach(() => {
  vi.clearAllMocks()
  db.reinforcementPlan.findMany.mockResolvedValue([])
  db.insumo.findMany.mockResolvedValue([{ id: 'insumo', courseAssignmentId: 'assignment', academicPeriodId: 'period', academicPeriod: { isClosed: false }, courseAssignment: { teacherId: 'teacher', parallelId: 'parallel', academicYearId: 'year' } }])
  db.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student', parallelId: 'parallel', academicYearId: 'year' }])
  db.institution.findUnique.mockResolvedValue({ settings: {} })
  db.manualInsumoAverage.upsert.mockResolvedValue({ id: 'manual' })
  db.$transaction.mockImplementation(async (items) => typeof items === 'function' ? items(db) : Promise.all(items))
})
const result = (mode: string, score: number | null) => ({ studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period', payload: { mode, score } })

describe('compatibilidad entre promedios manuales y refuerzo', () => {
  it('impide invalidar un refuerzo activo por conjunto al ingresar un promedio manual', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([result('activity_set', 8)])
    await expect(repo.bulkUpsertManualInsumoAverages('school', dto, 'teacher', ['teacher'])).rejects.toThrow('Retira su aplicación')
    expect(db.manualInsumoAverage.upsert).not.toHaveBeenCalled()
  })
  it('admite promedios manuales con la modalidad integral', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([result('period_formative', 8)])
    await expect(repo.bulkUpsertManualInsumoAverages('school', dto, 'teacher', ['teacher'])).resolves.toEqual([{ id: 'manual' }])
  })
  it('admite promedios manuales después de retirar la aplicación por conjunto', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([result('activity_set', null), result('activity_set', 8)])
    await expect(repo.bulkUpsertManualInsumoAverages('school', dto, 'teacher', ['teacher'])).resolves.toEqual([{ id: 'manual' }])
  })
})
