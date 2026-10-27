import { beforeEach, describe, expect, it, vi } from 'vitest'
import { saveReinforcementRegister, type RegisterCell } from './reinforcement-grade-register.service'

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $executeRaw: vi.fn(),
  reinforcementPlan: { findFirst: vi.fn() }, academicPeriod: { findFirst: vi.fn() }, institution: { findUnique: vi.fn() },
  studentEnrollment: { findMany: vi.fn() }, reinforcementSession: { findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
  reinforcementSessionAttendance: { upsert: vi.fn() }, activity: { findMany: vi.fn() }, insumo: { findMany: vi.fn() }, courseAssignment: { findMany: vi.fn() },
  manualInsumoAverage: { count: vi.fn(), findMany: vi.fn() }, formativeReinforcementResult: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() }, pedagogicRecovery: { findFirst: vi.fn() },
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
const teacher = { userId: 'teacher', roles: ['teacher'], permissions: ['grades:write:own'] }
const assignment = { id: 'assignment', teacherId: 'teacher', parallelId: 'parallel', academicYearId: 'year', examWeight: 30, projectWeight: 0 }
const plan = { id: 'plan', studentId: 'student', participants: [], courseAssignmentId: 'assignment', academicPeriodId: 'period', courseAssignment: assignment, caseStatus: 'IN_REINFORCEMENT' }
const attendance = (score: number | null = null) => ({ studentId: 'student', status: 'present', score, scoreScaleMax: score == null ? null : 10, appliedScore: null })
let sessions: any[], results: any[], mode: 'period_formative' | 'activity_set', activities: any[]
const cell = (score: number | null, expected: number | null = null): RegisterCell => ({ studentId: 'student', sessionId: 'session', score, status: 'present', expected: { score: expected, status: 'present' } })
beforeEach(() => {
  vi.resetAllMocks()
  sessions = [{ id: 'session', planId: 'plan', title: 'Práctica', date: new Date('2026-10-26'), targetActivityId: null, attendances: [attendance()] }]
  results = []; mode = 'period_formative'
  activities = [{ id: 'original', insumoId: 'insumo', maxScore: 10, activityType: { code: 'task' }, grades: [{ studentId: 'student', score: 4 }] }]
  db.$transaction.mockImplementation(async (fn) => {
    const previousSessions = structuredClone(sessions), previousResults = structuredClone(results)
    try { return await fn(db) } catch (error) { sessions = previousSessions; results = previousResults; throw error }
  })
  db.reinforcementPlan.findFirst.mockResolvedValue(plan)
  db.academicPeriod.findFirst.mockResolvedValue({ isClosed: false })
  db.institution.findUnique.mockImplementation(async () => ({ settings: { gradingConfig: { formativeReinforcement: { mode, reinforcementWeight: 50, cap: 7 } } } }))
  db.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student' }])
  db.reinforcementSession.findMany.mockImplementation(async ({ where }) => sessions.filter((session) => !where.planId || session.planId === where.planId))
  db.reinforcementSessionAttendance.upsert.mockImplementation(async ({ create, update }) => {
    const session = sessions.find((session) => session.id === create.sessionId)
    const old = session.attendances.find((row: any) => row.studentId === create.studentId)
    if (old) Object.assign(old, update); else session.attendances.push(create)
  })
  db.reinforcementSession.delete.mockImplementation(async ({ where }) => { sessions = sessions.filter((session) => session.id !== where.id) })
  db.reinforcementSession.update.mockImplementation(async ({ where, data }) => Object.assign(sessions.find((session) => session.id === where.id), data))
  db.activity.findMany.mockImplementation(async ({ where }) => where.insumoId === null ? [] : activities)
  db.insumo.findMany.mockImplementation(async () => [{ id: 'insumo', name: 'Tareas', courseAssignmentId: 'assignment', academicPeriodId: 'period', activities }])
  db.courseAssignment.findMany.mockResolvedValue([assignment])
  db.manualInsumoAverage.findMany.mockResolvedValue([]); db.manualInsumoAverage.count.mockResolvedValue(0)
  db.pedagogicRecovery.findFirst.mockResolvedValue(null)
  db.formativeReinforcementResult.findFirst.mockImplementation(async () => results.at(-1) ?? null)
  db.formativeReinforcementResult.create.mockImplementation(async ({ data }) => { const result = { id: String(results.length + 1), ...data }; results.push(result); return result })
})
const save = (cells: RegisterCell[]) => saveReinforcementRegister('school', teacher, 'plan', cells)
const latest = () => results.at(-1).payload

describe('guardado automático del registro de refuerzo', () => {
  it('guarda la nota y aplica el promedio en la misma transacción; repetir no duplica el historial', async () => {
    await save([cell(10)])
    expect(latest()).toMatchObject({ score: 10, initialFormative: 4, adjustedFormative: 7, source: 'grade_register' })
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), { timeout: 60000 })
    await save([cell(10, 10)])
    expect(results).toHaveLength(1)
  })
  it('corregir recalcula desde la nota original y borrar la última nota retira el efecto', async () => {
    await save([cell(10)]); await save([cell(6, 10)])
    expect(latest().adjustedFormative).toBe(5)
    await save([cell(null, 6)])
    expect(latest()).toMatchObject({ score: null, adjustedFormative: 4 })
    expect(results).toHaveLength(3)
    expect(latest().changes[0]).toMatchObject({ before: { score: 6 }, after: { score: null } })
  })
  it('incluye evidencias de otros planes sin volver a promediar un resultado aplicado', async () => {
    sessions.push({ ...sessions[0], id: 'other-session', planId: 'other-plan', attendances: [attendance(6)] })
    await save([cell(10)])
    expect(latest()).toMatchObject({ score: 8, adjustedFormative: 6 })
    expect(latest().evidence).toHaveLength(2)
    await save([])
    expect(latest().adjustedFormative).toBe(6)
    expect(results).toHaveLength(1)
  })
  it('eliminar una columna recalcula y conserva su evidencia en el historial anterior', async () => {
    await save([cell(10)])
    await saveReinforcementRegister('school', teacher, 'plan', [], { sessionId: 'session', remove: true })
    expect(latest()).toMatchObject({ score: null, adjustedFormative: 4 })
    expect(results[0].payload.evidence[0].score).toBe(10)
  })
  it('la modalidad por actividades afecta solo el conjunto vinculado', async () => {
    mode = 'activity_set'; sessions[0].targetActivityId = 'original'
    activities.push({ ...activities[0], id: 'second', grades: [{ studentId: 'student', score: 8 }] })
    await save([cell(10)])
    expect(latest()).toMatchObject({ activityIds: ['original'], initialFormative: 6, adjustedFormative: 7.5 })
  })
  it('exige vínculo y nota de origen al calificar por actividades', async () => {
    mode = 'activity_set'
    await expect(save([cell(10)])).rejects.toThrow('Selecciona la actividad original')
    sessions[0].targetActivityId = 'original'; activities[0].grades = []
    await expect(save([cell(10)])).rejects.toThrow('Registra primero')
    expect(results).toHaveLength(0)
  })
  it('parte de la mejora individual vigente sin consumirla ni bloquear el plan', async () => {
    activities[0].grades[0] = { studentId: 'student', score: 6, baseScore: 2, reinforcementScore: 10, reinforcementMode: 'agreement_formative' }
    await save([cell(10)])
    expect(latest()).toMatchObject({ initialFormative: 6, adjustedFormative: 7 })
  })
  it('rechaza un cambio concurrente y revierte el lote completo', async () => {
    sessions.push({ ...sessions[0], id: 'second', attendances: [attendance(8)] })
    await expect(save([cell(10), { ...cell(5), sessionId: 'second' }])).rejects.toThrow('Otra persona')
    expect(sessions[0].attendances[0].score).toBeNull()
    expect(results).toHaveLength(0)
  })
  it('rechaza usuarios ajenos, estudiantes sin matrícula y períodos cerrados', async () => {
    await expect(saveReinforcementRegister('school', { ...teacher, userId: 'other' }, 'plan', [cell(10)])).rejects.toThrow()
    db.studentEnrollment.findMany.mockResolvedValue([])
    await expect(save([cell(10)])).rejects.toThrow('matrícula activa')
    db.academicPeriod.findFirst.mockResolvedValue({ isClosed: true })
    await expect(save([])).rejects.toThrow('cerrado')
    expect(results).toHaveLength(0)
  })
  it('consulta el plan dentro de la institución y rechaza un identificador ajeno', async () => {
    db.reinforcementPlan.findFirst.mockResolvedValue(null)
    await expect(save([cell(10)])).rejects.toThrow('no encontrado')
    expect(db.reinforcementPlan.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'plan', institutionId: 'school', planType: 'academico' } }))
  })
  it('excluye notas individuales y evita cruzar recuperación del total con refuerzo formativo', async () => {
    sessions[0].attendances[0].appliedScore = 7
    await expect(save([cell(10)])).rejects.toThrow('mejora individual')
    sessions[0].attendances[0].appliedScore = null
    db.pedagogicRecovery.findFirst.mockResolvedValue({ id: 'legacy' })
    await expect(save([cell(10)])).rejects.toThrow('recuperación aplicada')
    expect(results).toHaveLength(0)
  })
  it('cambiar la actividad original recalcula el conjunto y conserva el historial', async () => {
    mode = 'activity_set'; sessions[0].targetActivityId = 'original'
    activities.push({ ...activities[0], id: 'second', grades: [{ studentId: 'student', score: 8 }] })
    await save([cell(10)])
    await saveReinforcementRegister('school', teacher, 'plan', [], { sessionId: 'session', data: { targetActivityId: 'second' } })
    expect(latest()).toMatchObject({ activityIds: ['second'], adjustedFormative: 6 })
    expect(results[0].payload.activityIds).toEqual(['original'])
  })
  it('rechaza el cruce con promedios manuales y restaura las notas del lote', async () => {
    mode = 'activity_set'; sessions[0].targetActivityId = 'original'
    db.manualInsumoAverage.count.mockResolvedValue(1)
    await expect(save([cell(10)])).rejects.toThrow('promedios manuales')
    expect(sessions[0].attendances[0].score).toBeNull()
    expect(results).toHaveLength(0)
  })
  it('no vuelve a aplicar una evidencia sumativa dentro del plan formativo', async () => {
    sessions.push({ ...sessions[0], id: 'exam-session', targetActivityId: 'exam', attendances: [attendance(0)] })
    activities.push({ ...activities[0], id: 'exam', activityType: { code: 'exam' }, grades: [{ studentId: 'student', score: 9 }] })
    await save([cell(10)])
    expect(latest()).toMatchObject({ score: 10, adjustedFormative: 7, adjustedTotal: 7.6 })
    expect(latest().evidence).toHaveLength(1)
  })
  it('una ausencia no admite nota y el cero no se transforma en vacío', async () => {
    await expect(save([{ ...cell(10), status: 'absent' }])).rejects.toThrow('ausencia')
    await save([cell(0)])
    expect(latest()).toMatchObject({ score: 0, adjustedFormative: 4 })
  })
})
