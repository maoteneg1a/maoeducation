import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSnapshot, type SnapshotContext } from './report-snapshot.service'

const db = vi.hoisted(() => ({
  user: { findFirst: vi.fn() }, parallel: { findFirst: vi.fn() }, courseAssignment: { findFirst: vi.fn() },
  academicPeriod: { findFirst: vi.fn() }, academicYear: { findFirst: vi.fn() },
  earlyAlert: { findMany: vi.fn() }, reinforcementPlan: { findFirst: vi.fn() }, reinforcementSession: { findMany: vi.fn() },
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/agreement.service', () => ({ institutionSettings: async () => ({ normativeProfile: { framework: 'MINEDEC-2026-00082-A', frameworkByYear: { year: 'LEGACY' } } }) }))
vi.mock('../../../../shared/infrastructure/services/period-grades.service', () => ({ computePeriodGrades: vi.fn() }))

const context: SnapshotContext = { institutionId: 'school', studentId: 'student', parallelId: 'parallel', courseAssignmentId: 'subject', academicPeriodId: 'period', academicYearId: 'year', alertId: null, reinforcementPlanId: 'plan' }

beforeEach(() => {
  vi.resetAllMocks()
  db.courseAssignment.findFirst.mockResolvedValue({ id: 'subject', subject: { name: 'Matemática' }, teacher: { email: 'docente', profile: null } })
  db.academicYear.findFirst.mockResolvedValue({ name: '2026–2027' })
  db.academicPeriod.findFirst.mockResolvedValue({ name: 'Primer trimestre' })
})

describe('datos de los anexos', () => {
  it('congela el año y su excepción normativa, con nómina limitada a escuela, asignatura, matrícula y periodo', async () => {
    db.earlyAlert.findMany.mockResolvedValue([
      { studentId: 'other-student', student: { email: 'otro', profile: { firstName: 'Luis', lastName: 'López' } }, currentScore: 6.25, qualitativeCode: null },
      { studentId: 'student', student: { email: 'ejemplo', profile: { firstName: 'Ana', lastName: 'Pérez' } }, currentScore: 5.5, qualitativeCode: null },
    ])
    const snap = await buildSnapshot('early_alerts', context)
    expect(snap.framework).toBe('LEGACY')
    expect(snap.academicYear).toEqual({ name: '2026–2027' })
    expect(snap.alertRoster).toEqual([{ studentId: 'student', student: 'Ana Pérez', result: '5.50' }, { studentId: 'other-student', student: 'Luis López', result: '6.25' }])
    expect(db.earlyAlert.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      institutionId: 'school', academicYearId: 'year', academicPeriodId: 'period', courseAssignmentId: 'subject',
      student: { studentEnrollments: { some: { institutionId: 'school', academicYearId: 'year', parallelId: 'parallel' } } },
    }) }))
  })

  it('rechaza un acta con asignatura ajena al paralelo o al año', async () => {
    db.courseAssignment.findFirst.mockResolvedValue(null)
    await expect(buildSnapshot('early_alerts', context)).rejects.toThrow('no corresponde')
    expect(db.earlyAlert.findMany).not.toHaveBeenCalled()
  })

  it('filtra la asistencia cuando se prepara un informe individual para la familia', async () => {
    db.reinforcementSession.findMany.mockResolvedValue([])
    await buildSnapshot('reinforcement_sessions', context)
    expect(db.reinforcementSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { planId: 'plan', institutionId: 'school' },
      include: { attendances: expect.objectContaining({ where: { studentId: 'student' } }) },
    }))
  })

  it('usa el resultado individual del participante sin atribuirle el resultado grupal', async () => {
    const plan = { studentId: null, communications: [], commitments: [], followUps: [], units: [], sessions: [],
      detectionInitialResult: 'Resultado del grupo',
      reevaluations: [{ date: null, evaluation: 'Actividad', initialResult: 'Inicial grupal', subsequentResult: 'Posterior grupal', outcomes: [{ studentId: 'student', assessmentValue: '6.75', result: 'NOT_CONSOLIDATED' }] }],
    }
    db.reinforcementPlan.findFirst.mockResolvedValue(plan)
    const snap = await buildSnapshot('reinforcement_case', context)
    const rc = snap.reinforcementCase as { detection: { initialResult: string | null }; reevaluations: Array<{ initialResult: string | null; subsequentResult: string | null }> }
    expect(rc.detection.initialResult).toBeNull()
    expect(rc.reevaluations[0]).toMatchObject({ initialResult: null, subsequentResult: '6.75' })
    plan.reevaluations[0].outcomes = []
    const withoutResult = await buildSnapshot('reinforcement_case', context)
    expect((withoutResult.reinforcementCase as typeof rc).reevaluations[0].subsequentResult).toBeNull()
  })
})
