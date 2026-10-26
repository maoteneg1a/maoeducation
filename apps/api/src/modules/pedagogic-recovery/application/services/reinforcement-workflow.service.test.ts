import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startReinforcementFromAlerts, saveReinforcementPlan } from './reinforcement-workflow.service'

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $executeRaw: vi.fn(),
  earlyAlert: { findMany: vi.fn(), updateMany: vi.fn() },
  courseAssignment: { findFirst: vi.fn() }, academicPeriod: { findFirst: vi.fn() },
  studentEnrollment: { findMany: vi.fn() },
  reinforcementPlan: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  reinforcementSession: { count: vi.fn() }, reinforcementReevaluation: { create: vi.fn() },
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
const teacher = { userId: 'teacher', roles: ['teacher'], permissions: ['grades:write:own'] }
const alert = { id: 'alert', institutionId: 'school', studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period', status: 'OPEN', reinforcementPlanId: null, currentScore: 5 }
const start = { alertIds: ['alert'], learningTarget: 'Fracciones equivalentes', objective: 'Resolver problemas', strategies: 'Práctica guiada', schedule: 'Martes a las 14:00' }
const save = { learningTarget: start.learningTarget, objective: start.objective, strategies: start.strategies }
beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async (fn) => fn(db))
  db.earlyAlert.findMany.mockResolvedValue([alert])
  db.courseAssignment.findFirst.mockResolvedValue({ id: 'assignment', teacherId: 'teacher', parallelId: 'parallel', academicYearId: 'year' })
  db.academicPeriod.findFirst.mockResolvedValue({ id: 'period', isClosed: false })
  db.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student' }])
  db.reinforcementPlan.findFirst.mockResolvedValue(null)
  db.reinforcementPlan.create.mockResolvedValue({ id: 'plan' })
})
describe('plan iniciado desde alertas', () => {
  it('crea el plan docente y vincula la alerta sin escribir calificaciones', async () => {
    await expect(startReinforcementFromAlerts('school', teacher, start)).resolves.toEqual({ id: 'plan', alreadyLinked: false })
    expect(db.reinforcementPlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ institutionId: 'school', caseStatus: 'PLANNED', proposalAuthority: 'TEACHER_DEFINED', reinforcementFrequency: start.schedule }) })
    expect(db.earlyAlert.updateMany).toHaveBeenCalledWith({ where: { institutionId: 'school', id: { in: ['alert'] } }, data: { reinforcementPlanId: 'plan' } })
  })
  it('reutiliza el plan vinculado y no duplica el seguimiento', async () => {
    db.earlyAlert.findMany.mockResolvedValue([{ ...alert, reinforcementPlanId: 'existing' }])
    await expect(startReinforcementFromAlerts('school', teacher, start)).resolves.toEqual({ id: 'existing', alreadyLinked: true })
    expect(db.reinforcementPlan.create).not.toHaveBeenCalled()
  })
  it('rechaza alertas ajenas, docentes de otra asignatura y períodos cerrados', async () => {
    db.earlyAlert.findMany.mockResolvedValue([])
    await expect(startReinforcementFromAlerts('school', teacher, start)).rejects.toThrow('institución')
    db.earlyAlert.findMany.mockResolvedValue([alert])
    await expect(startReinforcementFromAlerts('school', { ...teacher, userId: 'other' }, start)).rejects.toThrow('docente')
    db.academicPeriod.findFirst.mockResolvedValue({ id: 'period', isClosed: true })
    await expect(startReinforcementFromAlerts('school', teacher, start)).rejects.toThrow('cerrado')
  })
  it('admite varios estudiantes de la misma asignatura y rechaza mezclarlas', async () => {
    db.earlyAlert.findMany.mockResolvedValue([alert, { ...alert, id: 'second', studentId: 'student2' }])
    db.studentEnrollment.findMany.mockResolvedValue([{ studentId: 'student' }, { studentId: 'student2' }])
    await startReinforcementFromAlerts('school', teacher, { ...start, alertIds: ['alert', 'second'] })
    expect(db.reinforcementPlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ mode: 'GROUP', participants: { create: [{ studentId: 'student' }, { studentId: 'student2' }] } }) })
    db.earlyAlert.findMany.mockResolvedValue([alert, { ...alert, id: 'second', courseAssignmentId: 'other' }])
    await expect(startReinforcementFromAlerts('school', teacher, { ...start, alertIds: ['alert', 'second'] })).rejects.toThrow('misma asignatura')
  })
  it('exige matrícula activa y permiso de escritura', async () => {
    await expect(startReinforcementFromAlerts('school', { ...teacher, permissions: [] }, start)).rejects.toThrow()
    db.studentEnrollment.findMany.mockResolvedValue([])
    await expect(startReinforcementFromAlerts('school', teacher, start)).rejects.toThrow('matrícula activa')
  })
})
describe('seguimiento y decisión docente', () => {
  beforeEach(() => {
    db.reinforcementPlan.findFirst.mockResolvedValue({ id: 'plan', studentId: 'student', participants: [], caseStatus: 'IN_REINFORCEMENT', courseAssignment: { teacherId: 'teacher' } })
    db.reinforcementSession.count.mockResolvedValue(1)
  })
  it('guarda la planificación sin exigir una valoración final', async () => {
    await saveReinforcementPlan('school', teacher, 'plan', save)
    expect(db.reinforcementReevaluation.create).not.toHaveBeenCalled()
    expect(db.reinforcementPlan.update).toHaveBeenCalledWith({ where: { id: 'plan' }, data: expect.objectContaining({ caseStatus: 'IN_REINFORCEMENT' }) })
  })
  it('registra resultado por estudiante al continuar y al cerrar', async () => {
    const decision = { ...save, notes: 'Persisten dificultades; continuar acompañamiento', outcomes: [{ studentId: 'student', result: 'NOT_CONSOLIDATED' as const }] }
    await saveReinforcementPlan('school', teacher, 'plan', { ...decision, action: 'continue' })
    expect(db.reinforcementReevaluation.create).toHaveBeenCalledWith({ data: expect.objectContaining({ pedagogicalDecision: 'CONTINUE_REINFORCEMENT', persistentDifficulty: true }) })
    await saveReinforcementPlan('school', teacher, 'plan', { ...decision, action: 'close' })
    expect(db.reinforcementPlan.update).toHaveBeenLastCalledWith({ where: { id: 'plan' }, data: expect.objectContaining({ caseStatus: 'CLOSED', status: 'cerrado' }) })
  })
  it('no permite concluir sin actividades, sin todos los resultados o editar un caso cerrado', async () => {
    await expect(saveReinforcementPlan('school', teacher, 'plan', { ...save, action: 'close', notes: 'Conclusión final' })).rejects.toThrow('cada participante')
    db.reinforcementSession.count.mockResolvedValue(0)
    await expect(saveReinforcementPlan('school', teacher, 'plan', { ...save, action: 'close', notes: 'Conclusión final', outcomes: [{ studentId: 'student', result: 'CONSOLIDATED' }] })).rejects.toThrow('actividades')
    db.reinforcementPlan.findFirst.mockResolvedValue({ studentId: 'student', participants: [], caseStatus: 'CLOSED', courseAssignment: { teacherId: 'teacher' } })
    await expect(saveReinforcementPlan('school', teacher, 'plan', save)).rejects.toThrow('cerrado')
  })
})
