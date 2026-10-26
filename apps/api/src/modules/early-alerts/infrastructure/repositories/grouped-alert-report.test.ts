import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REPORTS_FLOW } from '../../../../shared/domain/reports-flow'
import { PrismaEarlyAlertRepository } from './prisma-early-alert.repository'

const db = vi.hoisted(() => ({
  earlyAlert: { findMany: vi.fn() },
  formalReport: { findMany: vi.fn() },
  reinforcementPlan: { findMany: vi.fn() },
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/agreement.service', () => ({ institutionSettings: async () => ({ reportsFlow: DEFAULT_REPORTS_FLOW }) }))

const actor = { userId: 'teacher', roles: ['teacher'], permissions: ['formal_reports:read:own'] }
const repo = new PrismaEarlyAlertRepository()
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(repo as any, 'period').mockResolvedValue({ id: 'period', academicYearId: 'year', isClosed: false })
  vi.spyOn(repo as any, 'scan').mockResolvedValue(undefined)
  vi.spyOn(repo as any, 'scopedAssignments').mockResolvedValue([{
    id: 'assignment', teacherId: 'teacher', subject: { name: 'Ciencias' }, teacher: { email: 'teacher', profile: null },
    parallel: { id: 'parallel', name: 'B', tutorId: null, level: { name: 'Sexto' } },
  }])
  db.reinforcementPlan.findMany.mockResolvedValue([])
  db.earlyAlert.findMany.mockResolvedValue(['pepito', 'juanito'].map((studentId) => ({
    id: `alert-${studentId}`, studentId, courseAssignmentId: 'assignment', status: 'OPEN',
    scoreAtDetection: 6, currentScore: 6, detectedAt: new Date(), reinforcementPlanId: null,
    student: { email: studentId, profile: { firstName: studentId, lastName: 'Pérez', dni: null } },
  })))
  db.formalReport.findMany.mockImplementation(async (q) => q.select.snapshot ? [{
    id: 'shared', typeKey: 'acta_entrega_alertas', authorId: 'teacher', courseAssignmentId: 'assignment', parallelId: 'parallel',
    status: 'SENT', snapshot: { alertRoster: [{ studentId: 'pepito' }] },
  }] : [])
})

describe('alertas conectadas al informe agrupado', () => {
  it('ambas alertas abren el mismo informe y solo la nómina enviada cuenta como entregada', async () => {
    const result = await repo.list('school', actor, { periodId: 'period' })
    const reports = result.items.map((a) => a.reports.find((r) => r.grouped))
    expect(reports[0]).toMatchObject({ reportId: 'shared', sent: 1 })
    expect(reports[1]).toMatchObject({ reportId: 'shared', sent: 0, needsAmendment: true })
    expect(db.formalReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      institutionId: 'school', academicYearId: 'year', academicPeriodId: 'period', courseAssignmentId: { in: ['assignment'] },
      OR: [{ authorId: 'teacher' }, { status: { not: 'DRAFT' }, recipients: { some: { userId: 'teacher' } } }],
    }) }))
  })
  it('no ofrece enlaces agrupados al usuario sin permiso para leer informes', async () => {
    const result = await repo.list('school', { ...actor, permissions: [] }, { periodId: 'period' })
    expect(result.items.every((a) => a.reports.filter((r) => r.grouped).every((r) => r.reportId === null))).toBe(true)
    expect(db.formalReport.findMany).toHaveBeenCalledTimes(1)
  })
  it('la autoridad recibe solo documentos enviados de terceros y respeta la confidencialidad', async () => {
    await repo.list('school', { userId: 'rector', roles: ['rector'], permissions: [] }, { periodId: 'period' })
    expect(db.formalReport.findMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: expect.objectContaining({
      OR: [{ authorId: 'rector' }, { status: { not: 'DRAFT' }, OR: [{ confidential: false }, { recipients: { some: { userId: 'rector' } } }] }],
    }) }))
  })
})
