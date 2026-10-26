import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_REPORTS_FLOW } from '../../../../shared/domain/reports-flow'
import { PrismaFormalReportRepository } from './prisma-formal-report.repository'
import { getOwnSignature, captureDocumentSignature } from '../../../users/application/services/user-signature.service'

const db = vi.hoisted(() => ({
  $transaction: vi.fn(), $executeRaw: vi.fn(),
  parallel: { findFirst: vi.fn() }, courseAssignment: { findFirst: vi.fn() }, academicPeriod: { findFirst: vi.fn() },
  formalReport: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn() },
  formalReportRecipient: { update: vi.fn(), updateMany: vi.fn() },
  institution: { findUnique: vi.fn().mockResolvedValue({ name: 'Escuela' }) },
  reinforcementPlan: { findFirst: vi.fn() }, studentEnrollment: { findFirst: vi.fn() },
}))
const snapshotMock = vi.hoisted(() => vi.fn())
vi.mock('../../application/services/report-snapshot.service', () => ({ buildSnapshot: snapshotMock }))
vi.mock('../../../early-alerts/infrastructure/repositories/prisma-early-alert.repository', () => ({ PrismaEarlyAlertRepository: class { async list() { return {} } } }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/agreement.service', () => ({ institutionSettings: async () => ({ reportsFlow: DEFAULT_REPORTS_FLOW }) }))
vi.mock('../../../users/application/services/user-signature.service', () => ({ captureDocumentSignature: vi.fn().mockResolvedValue(undefined), getOwnSignature: vi.fn().mockResolvedValue({ imageData: null }) }))
vi.mock('../../../../shared/infrastructure/services/push.service', () => ({ sendPushToUser: vi.fn().mockResolvedValue(undefined) }))

const teacher = { userId: 'teacher', roles: ['teacher'], permissions: ['formal_reports:read:own', 'formal_reports:write:own'] }
const rector = { userId: 'rector', roles: ['rector'], permissions: [] }
const person = (id: string) => ({ id, email: id, profile: { firstName: id, lastName: 'Persona' } })
const repo = new PrismaFormalReportRepository()
let row: Record<string, any>
beforeEach(() => {
  vi.clearAllMocks()
  row = {
    id: 'report', institutionId: 'school', academicYearId: 'year', authorId: 'teacher', author: person('teacher'),
    status: 'SENT', folio: 'INF-00001', typeKey: 'acta_entrega_alertas', typeLabel: 'Anexo 1', scope: 'parallel',
    confidential: false, content: { jornada: 'Matutina', fecha_documento: '2026-10-26' }, snapshot: { frozen: true },
    typeConfig: { fields: [] }, recipientInstance: 'subdireccion', recipientInstanceLabel: 'Subdirección',
    recipients: [{ id: 'recipient', userId: 'rector', user: person('rector'), readAt: new Date() }],
    attachments: [], derived: [], student: null, parentReport: null, previousVersionId: null,
  }
  db.$transaction.mockImplementation(async (fn) => fn(db))
  db.parallel.findFirst.mockResolvedValue({ id: 'parallel' })
  db.courseAssignment.findFirst.mockResolvedValue({ id: 'assignment', parallelId: 'parallel', academicYearId: 'year' })
  db.academicPeriod.findFirst.mockResolvedValue({ academicYearId: 'year' })
  db.formalReport.findFirst.mockImplementation(async () => row)
  db.formalReport.update.mockImplementation(async ({ data }) => { Object.assign(row, data); return row })
  db.formalReport.findMany.mockResolvedValue([])
  db.formalReport.count.mockResolvedValue(0)
})

describe('bandejas y acciones del informe', () => {
  it('al generar el anexo reutiliza el plan autorizado y conserva las correcciones del docente', async () => {
    db.reinforcementPlan.findFirst.mockResolvedValue({ studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period', participants: [], mode: 'INDIVIDUAL',
      proposalLearningToReinforce: 'Fracciones equivalentes', proposalObjective: 'Objetivo del plan', proposalActiveStrategy: 'Práctica guiada', proposalResource: 'Guía', proposalEvaluation: 'Rúbrica',
      courseAssignment: { subject: { name: 'Matemática' }, teacher: person('teacher') }, sessions: [{ date: new Date('2026-10-26T00:00:00Z') }],
    })
    db.studentEnrollment.findFirst.mockResolvedValue({ parallelId: 'parallel' })
    db.formalReport.create.mockImplementation(async ({ data }) => { row = { ...row, ...data, status: 'DRAFT' }; return row })
    await repo.create('school', teacher, { typeKey: 'plan_refuerzo', reinforcementPlanId: 'plan', content: { objetivo: 'Objetivo adaptado para este informe' } })
    expect(db.reinforcementPlan.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'plan', institutionId: 'school' } }))
    expect(db.formalReport.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      studentId: 'student', courseAssignmentId: 'assignment', academicPeriodId: 'period', reinforcementPlanId: 'plan',
      content: expect.objectContaining({ objetivo: 'Objetivo adaptado para este informe', docente_refuerzo: 'teacher Persona', agrupacion: 'Individual', fecha_inicio: '2026-10-26', matematica_saberes: 'Fracciones equivalentes', matematica_estrategias: 'Práctica guiada' }),
    }) }))
  })
  it('muestra la firma actual en el borrador sin firmarlo ni guardar una copia de envío', async () => {
    row.status = 'DRAFT'
    vi.mocked(getOwnSignature).mockResolvedValue({ imageData: 'preview-image', updatedAt: null })
    snapshotMock.mockResolvedValue({ draft: true })
    const result = await repo.forPdf('school', teacher, 'report')
    expect(result.authorSignature).toEqual({ imageData: 'preview-image' })
    expect(getOwnSignature).toHaveBeenCalledWith('school', 'teacher')
    expect(captureDocumentSignature).not.toHaveBeenCalled()
    expect(db.formalReport.update).not.toHaveBeenCalled()
    expect(row.status).toBe('DRAFT')
  })
  it('el Word y PDF enviados conservan la firma original aunque se cambie la del perfil', async () => {
    row.authorSignature = { imageData: 'frozen-image', signedAt: '2026-10-26T17:00:00Z' }
    const result = await repo.forPdf('school', teacher, 'report')
    expect(result.authorSignature).toEqual(row.authorSignature)
    expect(getOwnSignature).not.toHaveBeenCalled()
    expect(db.formalReport.update).not.toHaveBeenCalled()
  })
  it('el autor ve su envío sin recibirlo ni poder acusarse recibo', async () => {
    const result = await repo.get('school', teacher, 'report')
    expect(result.permissions).toMatchObject({ isAuthor: true, isRecipient: false, canReceive: false, canReturn: false, canEdit: false })
    await expect(repo.receive('school', teacher, 'report')).rejects.toThrow('destinatario')
    expect(db.formalReport.update).not.toHaveBeenCalled()
  })
  it('la autoridad destinataria puede registrar acuse y luego atender', async () => {
    expect((await repo.get('school', rector, 'report')).permissions).toMatchObject({ canReceive: true, canReturn: true })
    const received = await repo.receive('school', rector, 'report')
    expect(received).toMatchObject({ status: 'RECEIVED', permissions: { canReceive: false, canAttend: true } })
    const attended = await repo.attend('school', rector, 'report', 'Revisado')
    expect(attended).toMatchObject({ status: 'ATTENDED', responseNote: 'Revisado' })
    expect(row.snapshot).toEqual({ frozen: true })
  })
  it('leer el informe no equivale a registrar su acuse', async () => {
    row.recipients[0].readAt = null
    const result = await repo.get('school', rector, 'report')
    expect(db.formalReportRecipient.update).toHaveBeenCalled()
    expect(result.status).toBe('SENT')
    expect(result.permissions.canReceive).toBe(true)
    expect(db.formalReport.update).not.toHaveBeenCalled()
  })
  it('una solicitud de cambios habilita una copia editable para el autor y conserva el original', async () => {
    const returned = await repo.returnReport('school', rector, 'report', 'Completar la autoridad receptora')
    expect(returned.status).toBe('RETURNED')
    expect((await repo.get('school', teacher, 'report')).permissions).toMatchObject({ canEdit: false, canNewVersion: true })
    db.formalReport.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce(null)
    const create = vi.spyOn(repo, 'create').mockResolvedValueOnce({ id: 'correction' } as any)
    await repo.newVersion('school', teacher, 'report')
    expect(create).toHaveBeenCalledWith('school', teacher, expect.objectContaining({ content: row.content }), expect.objectContaining({ previousVersionId: 'report' }))
    expect(row.snapshot).toEqual({ frozen: true })
    create.mockRestore()
  })
  it('reabre el borrador de corrección existente en lugar de duplicarlo', async () => {
    row.status = 'RETURNED'
    db.formalReport.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({ id: 'correction' }).mockResolvedValueOnce({ ...row, id: 'correction', status: 'DRAFT' })
    const result = await repo.newVersion('school', teacher, 'report')
    expect(result.id).toBe('correction')
    expect(result.permissions.canEdit).toBe(true)
  })
  it('excluye envíos propios de la bandeja recibida y del contador de pendientes', async () => {
    await repo.list('school', teacher, { box: 'inbox' })
    expect(db.formalReport.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ institutionId: 'school', authorId: { not: 'teacher' }, recipients: { some: { userId: 'teacher' } } }),
    }))
    await repo.counts('school', teacher)
    expect(db.formalReport.count).toHaveBeenCalledWith({ where: expect.objectContaining({ authorId: { not: 'teacher' }, status: 'SENT' }) })
  })
})


describe('Anexo 1 agrupado', () => {
  it('reutiliza el informe de la misma institución, autor, asignatura, paralelo y período', async () => {
    row.typeConfig = { pdfTemplate: 'annex_alerts', fields: [] }
    await repo.create('school', teacher, { typeKey: 'acta_entrega_alertas', courseAssignmentId: 'assignment', academicPeriodId: 'period' })
    expect(db.$executeRaw).toHaveBeenCalled()
    expect(db.formalReport.create).not.toHaveBeenCalled()
    expect(db.formalReport.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ institutionId: 'school', authorId: 'teacher', courseAssignmentId: 'assignment', academicPeriodId: 'period', parallelId: 'parallel', academicYearId: 'year' }),
      select: { id: true },
    }))
  })
  it('el receptor no puede ampliar el informe del docente', async () => {
    row.typeConfig = { pdfTemplate: 'annex_alerts', fields: [] }
    await expect(repo.amendment('school', rector, 'report')).rejects.toThrow()
    expect(db.formalReport.create).not.toHaveBeenCalled()
  })
  it('una ampliación conserva alumnos ya reportados y agrega la nueva nómina sin duplicar', async () => {
    row.typeConfig = { snapshot: 'early_alerts' }
    row.status = 'DRAFT'
    row.previousVersionId = 'previous'
    snapshotMock.mockResolvedValue({ alertRoster: [{ studentId: 'new', student: 'Nuevo alumno', result: '5.00' }, { studentId: 'prior', student: 'Previo', result: '6.50' }] })
    db.formalReport.findFirst.mockResolvedValueOnce(row).mockResolvedValueOnce({ snapshot: { alertRoster: [{ studentId: 'resolved', student: 'Alumno recuperado', result: '6.00' }, { studentId: 'prior', student: 'Previo', result: '5.00' }] } })
    const result = await repo.previewSnapshot('school', teacher, 'report')
    expect(result.alertRoster).toEqual([{ studentId: 'resolved', student: 'Alumno recuperado', result: '6.00' }, { studentId: 'new', student: 'Nuevo alumno', result: '5.00' }, { studentId: 'prior', student: 'Previo', result: '6.50' }])
  })
})


it('no cuenta como pendientes las versiones anteriores de un Anexo 1 ampliado', async () => {
  db.formalReport.findMany.mockResolvedValue([{ previousVersionId: 'old-report' }])
  await repo.counts('school', rector)
  expect(db.formalReport.count).toHaveBeenCalledWith({ where: expect.objectContaining({ id: { notIn: ['old-report'] }, authorId: { not: 'rector' } }) })
  expect(db.formalReport.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: { not: 'DRAFT' }, typeConfig: { path: ['pdfTemplate'], equals: 'annex_alerts' } }) }))
})
