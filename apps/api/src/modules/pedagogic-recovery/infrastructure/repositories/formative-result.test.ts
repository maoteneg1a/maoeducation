import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computePeriodSummary } from '../../../../shared/domain/grade-math'
import { PrismaReinforcementDeskRepository, type FormativeResultDto } from './prisma-reinforcement-desk.repository'

const db = vi.hoisted(() => ({
  reinforcementPlan: { findFirst: vi.fn() }, studentEnrollment: { findFirst: vi.fn() },
  pedagogicRecovery: { findFirst: vi.fn() }, academicPeriod: { findFirst: vi.fn() },
  activity: { findMany: vi.fn() }, manualInsumoAverage: { count: vi.fn() },
  reinforcementSession: { findMany: vi.fn() }, courseAssignment: { findFirstOrThrow: vi.fn() },
  formativeReinforcementResult: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  $transaction: vi.fn(), $executeRaw: vi.fn(),
}))
const state = vi.hoisted(() => ({ config: { gradingScaleMax: 10, formativeReinforcement: { mode: 'activity_set' as string | null, reinforcementWeight: 50, cap: 7 } } }))
const summaries = vi.hoisted(() => vi.fn())
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/period-grades.service', () => ({ computePeriodGrades: summaries }))
vi.mock('../../../institution/infrastructure/repositories/prisma-institution.repository', () => ({ PrismaInstitutionRepository: class { async getGradingConfig() { return state.config } } }))
vi.mock('./prisma-pedagogic-recovery.repository', () => ({ PrismaPedagogicRecoveryRepository: class {} }))

const teacher = { userId: 'teacher', roles: ['teacher'], permissions: ['grades:write:own'] }
const dto = { studentId: 'student', activityIds: ['activity'], sessionIds: ['session'], reason: 'Aprendizajes alcanzados', expectedResultId: null }
const repo = new PrismaReinforcementDeskRepository()
async function applyWithPreview(input: FormativeResultDto = dto) {
  const preview = await repo.previewFormative('school', teacher, 'plan', input)
  return repo.applyFormative('school', teacher, 'plan', { ...input, expectedPreviewToken: preview.previewToken })
}
const base = computePeriodSummary([{ id: 'insumo', name: 'Tareas', activities: [{ id: 'activity', score: 4, maxScore: 10, kind: 'regular' }] }], 30)

beforeEach(() => {
  vi.clearAllMocks()
  state.config.formativeReinforcement = { mode: 'activity_set', reinforcementWeight: 50, cap: 7 }
  db.reinforcementPlan.findFirst.mockResolvedValue({ id: 'plan', studentId: 'student', createdBy: 'teacher', participants: [], courseAssignmentId: 'assignment', academicPeriodId: 'period', courseAssignment: { teacherId: 'teacher', parallelId: 'parallel', academicYearId: 'year', parallel: { tutorId: null } } })
  db.studentEnrollment.findFirst.mockResolvedValue({ id: 'enrollment' })
  db.pedagogicRecovery.findFirst.mockResolvedValue(null)
  db.academicPeriod.findFirst.mockResolvedValue({ isClosed: false })
  db.activity.findMany.mockResolvedValue([{ id: 'activity', insumoId: 'insumo', maxScore: 10, activityType: { code: 'task' }, grades: [{ score: 4 }] }])
  db.manualInsumoAverage.count.mockResolvedValue(0)
  db.reinforcementSession.findMany.mockResolvedValue([{ id: 'session', title: 'Fracciones', date: new Date('2026-10-24'), targetActivityId: null, attendances: [{ status: 'present', score: 8, appliedScore: null }] }])
  db.courseAssignment.findFirstOrThrow.mockResolvedValue({ examWeight: 30 })
  db.formativeReinforcementResult.findFirst.mockResolvedValue(null)
  db.formativeReinforcementResult.create.mockImplementation(async ({ data }) => ({ id: 'result', ...data }))
  db.$transaction.mockImplementation(async (fn) => fn(db))
  summaries.mockResolvedValue(new Map([['student:assignment:period', base]]))
})

describe('aplicación del resultado del plan', () => {
  it('previsualiza sin escribir y calcula desde la base original, sin acumular mejoras', async () => {
    const result = await repo.previewFormative('school', teacher, 'plan', dto)
    expect(result).toMatchObject({ initial: { formative: 4 }, adjusted: { formative: 6 } })
    expect(summaries).toHaveBeenCalledWith('school', expect.objectContaining({ ignoreFormativeApplications: true }))
    expect(db.formativeReinforcementResult.create).not.toHaveBeenCalled()
  })
  it('registra autor, motivo, configuración, evidencias y antes/después en una nueva versión', async () => {
    const result = await applyWithPreview()
    expect(result).toMatchObject({ institutionId: 'school', recordedBy: 'teacher', reason: dto.reason, payload: { mode: 'activity_set', reinforcementWeight: 50, cap: 7, score: 8, initialFormative: 4, adjustedFormative: 6, evidence: [{ sessionId: 'session', score: 8 }] } })
    expect(db.$executeRaw).toHaveBeenCalled()
  })
  it('rechaza estudiantes ajenos al plan y períodos cerrados', async () => {
    await expect(repo.previewFormative('school', teacher, 'plan', { ...dto, studentId: 'other' })).rejects.toThrow('no participa')
    db.academicPeriod.findFirst.mockResolvedValue({ isClosed: true })
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('cerrado')
  })
  it('exige matrícula activa y el permiso para escribir notas', async () => {
    await expect(repo.previewFormative('school', { ...teacher, permissions: [] }, 'plan', dto)).rejects.toThrow()
    db.studentEnrollment.findFirst.mockResolvedValue(null)
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('matrícula activa')
  })
  it('exige configuración institucional y rechaza sumativas seleccionadas', async () => {
    state.config.formativeReinforcement.mode = null
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('configurar')
    state.config.formativeReinforcement.mode = 'activity_set'
    db.activity.findMany.mockResolvedValue([{ id: 'activity', insumoId: 'insumo', maxScore: 10, activityType: { code: 'exam' }, grades: [{ score: 4 }] }])
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('formativas')
  })
  it('no duplica una sesión ya aplicada a una nota individual ni una recuperación trimestral', async () => {
    db.reinforcementSession.findMany.mockResolvedValue([{ id: 'session', title: 'Refuerzo', date: new Date(), targetActivityId: 'activity', attendances: [{ status: 'present', score: 8, appliedScore: 6 }] }])
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('ya modificó')
    db.pedagogicRecovery.findFirst.mockResolvedValue({ id: 'old' })
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('dos veces')
  })
  it('rechaza notas ausentes y promedios manuales incompatibles con el conjunto', async () => {
    db.reinforcementSession.findMany.mockResolvedValue([{ id: 'session', title: 'Refuerzo', date: new Date(), targetActivityId: null, attendances: [{ status: 'absent', score: null }] }])
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('asistencia y nota')
    db.manualInsumoAverage.count.mockResolvedValue(1)
    await expect(repo.previewFormative('school', teacher, 'plan', dto)).rejects.toThrow('promedios manuales')
  })
  it('rechaza una aplicación si otro docente ya guardó una versión más reciente', async () => {
    db.formativeReinforcementResult.findFirst.mockResolvedValue({ id: 'newer', createdAt: new Date() })
    await expect(applyWithPreview()).rejects.toThrow('resultado cambió')
    expect(db.formativeReinforcementResult.create).not.toHaveBeenCalled()
  })
  it('rechaza aplicar cuando la configuración cambió después de la vista previa', async () => {
    const preview = await repo.previewFormative('school', teacher, 'plan', dto)
    state.config.formativeReinforcement.reinforcementWeight = 25
    await expect(repo.applyFormative('school', teacher, 'plan', { ...dto, expectedPreviewToken: preview.previewToken })).rejects.toThrow('vista previa')
    expect(db.formativeReinforcementResult.create).not.toHaveBeenCalled()
  })
  it('permite retirar una aplicación mediante otra versión, sin borrar su historial', async () => {
    state.config.formativeReinforcement.mode = null
    db.reinforcementSession.findMany.mockResolvedValue([])
    const result = await applyWithPreview({ ...dto, activityIds: [], sessionIds: [], revoke: true })
    expect(result.payload).toMatchObject({ score: null, initialFormative: 4, adjustedFormative: 4 })
  })
})
