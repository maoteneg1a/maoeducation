import type { Prisma } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { assertReinforcementGradesOpen, closedReinforcementPlans } from './reinforcement-grade-lock.service'
const db = { reinforcementPlan: { findMany: vi.fn() }, $executeRaw: vi.fn() }
const tx = db as unknown as Prisma.TransactionClient
const scope = { studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period' }
beforeEach(() => {
  vi.clearAllMocks()
  db.reinforcementPlan.findMany.mockResolvedValue([{ id: 'closed', updatedAt: new Date('2026-10-26'), ...scope, participants: [] }])
})
describe('notas protegidas después de finalizar un refuerzo', () => {
  it('bloquea cambios de las notas que existían al finalizar, dentro de la institución', async () => {
    await expect(assertReinforcementGradesOpen(tx, 'school', [{ ...scope, recordedAt: new Date('2026-10-25') }])).rejects.toThrow('Corregir notas')
    expect(db.reinforcementPlan.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ institutionId: 'school', caseStatus: 'CLOSED' }) }))
    expect(db.$executeRaw).toHaveBeenCalled()
  })
  it('permite las nuevas actividades posteriores sin obligar a reabrir un plan anterior', async () => {
    await expect(assertReinforcementGradesOpen(tx, 'school', [{ ...scope, recordedAt: new Date('2026-10-27') }])).resolves.toBeUndefined()
  })
  it('permite corregir después de la reapertura registrada', async () => {
    db.reinforcementPlan.findMany.mockResolvedValue([])
    await expect(assertReinforcementGradesOpen(tx, 'school', [scope])).resolves.toBeUndefined()
  })
  it('incluye a los participantes de planes grupales y no estudiantes ajenos', async () => {
    db.reinforcementPlan.findMany.mockResolvedValue([{ id: 'closed', ...scope, studentId: 'owner', updatedAt: new Date('2026-10-26'), participants: [{ studentId: 'student' }] }])
    expect(await closedReinforcementPlans(tx, 'school', [scope])).toHaveLength(1)
    expect(await closedReinforcementPlans(tx, 'school', [{ ...scope, studentId: 'other' }])).toHaveLength(0)
  })
})
