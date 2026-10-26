import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computePeriodGrades } from './period-grades.service'

const db = vi.hoisted(() => ({
  courseAssignment: { findMany: vi.fn() }, insumo: { findMany: vi.fn() }, activity: { findMany: vi.fn() },
  manualInsumoAverage: { findMany: vi.fn() }, formativeReinforcementResult: { findMany: vi.fn() },
}))
vi.mock('../database/prisma', () => ({ prisma: db }))
const params = { assignmentIds: ['assignment'], periodIds: ['period'], studentIds: ['student'], gradingScaleMax: 10 }
const key = 'student:assignment:period'
const application = { mode: 'period_formative', reinforcementWeight: 50, cap: 7, score: 8, activityIds: [], gradingScaleMax: 10 }
const row = (payload = application) => ({ studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period', payload })
beforeEach(() => {
  vi.clearAllMocks()
  db.courseAssignment.findMany.mockResolvedValue([{ id: 'assignment', examWeight: 30, projectWeight: 0 }])
  const activity = (id: string, score: number, code = 'task') => ({ id, maxScore: 10, activityType: { code }, grades: [{ studentId: 'student', score }] })
  db.insumo.findMany.mockResolvedValue([
    { id: 'a', name: 'Tareas', courseAssignmentId: 'assignment', academicPeriodId: 'period', activities: [activity('a1', 4), activity('a2', 8)] },
    { id: 'b', name: 'Clase', courseAssignmentId: 'assignment', academicPeriodId: 'period', activities: [activity('b1', 5), activity('exam', 9, 'exam')] },
  ])
  db.activity.findMany.mockResolvedValue([])
  db.manualInsumoAverage.findMany.mockResolvedValue([])
  db.formativeReinforcementResult.findMany.mockResolvedValue([])
})

describe('resumen único del período con refuerzo', () => {
  it('conserva los resultados anteriores sin ninguna aplicación', async () => {
    const summary = (await computePeriodGrades('school', params)).get(key)!
    expect(summary.insumosBase).toBe(5.5)
    expect(summary.total).toBeCloseTo(6.55)
    expect(summary.formativeReinforcement).toBeUndefined()
  })
  it('usa la última aplicación y sus pesos guardados', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([row(), row({ ...application, reinforcementWeight: 25 })])
    const summary = (await computePeriodGrades('school', params)).get(key)!
    expect(summary.insumosBase).toBe(6.75)
    expect(summary.total).toBeCloseTo(7.425)
    expect(summary.formativeReinforcement).toMatchObject({ initial: 5.5, adjusted: 6.75 })
    expect(db.formativeReinforcementResult.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { institutionId: 'school', courseAssignmentId: { in: ['assignment'] }, academicPeriodId: { in: ['period'] }, studentId: { in: ['student'] } } }))
  })
  it('retirar una aplicación no reactiva una versión anterior', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([row({ ...application, score: null } as unknown as typeof application), row()])
    expect((await computePeriodGrades('school', params)).get(key)!.insumosBase).toBe(5.5)
  })
  it('una previsualización parte de las notas iniciales aunque exista una aplicación', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([row()])
    expect((await computePeriodGrades('school', { ...params, ignoreFormativeApplications: true })).get(key)!.insumosBase).toBe(5.5)
    expect(db.formativeReinforcementResult.findMany).not.toHaveBeenCalled()
  })
  it('conserva el peso por insumo cuando el conjunto cruza categorías', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([row({ ...application, mode: 'activity_set', activityIds: ['a1', 'b1'] } as unknown as typeof application)])
    expect((await computePeriodGrades('school', params)).get(key)!.insumosBase).toBeCloseTo(6.75)
  })
  it('incluye promedios manuales de insumos que aún no tienen actividades', async () => {
    db.manualInsumoAverage.findMany.mockResolvedValue([{ studentId: 'student', insumoId: 'manual', score: 8, insumo: { courseAssignmentId: 'assignment', academicPeriodId: 'period', name: 'Manual' } }])
    db.formativeReinforcementResult.findMany.mockResolvedValue([row()])
    const result = (await computePeriodGrades('school', params)).get(key)!
    expect(result.insumoAvgs).toContainEqual({ id: 'manual', name: 'Manual', avg: 8 })
    expect(result.formativeReinforcement?.initial).toBeCloseTo((6 + 5 + 8) / 3)
    expect(result.insumosBase).toBe(7)
  })
  it('normaliza el resultado histórico cuando la institución cambia su escala', async () => {
    db.formativeReinforcementResult.findMany.mockResolvedValue([row()])
    const result = (await computePeriodGrades('school', { ...params, gradingScaleMax: 5 })).get(key)!
    expect(result.insumosBase).toBeCloseTo(3.375)
    expect(result.total).toBeCloseTo(3.7125)
  })
})
