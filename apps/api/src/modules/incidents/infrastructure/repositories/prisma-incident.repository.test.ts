import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({
  disciplinaryIncident: { findFirst: vi.fn() }, institution: { findUnique: vi.fn() },
  studentEnrollment: { findFirst: vi.fn() }, guardianStudent: { findMany: vi.fn() },
  incidentCommitment: { create: vi.fn(), findFirst: vi.fn() }, incidentEvent: { create: vi.fn() }, $transaction: vi.fn(),
}))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
import type { CommitmentDocument } from '../../application/services/commitment-document'
import { PrismaIncidentRepository } from './prisma-incident.repository'
const repo = new PrismaIncidentRepository()
const person = { profile: { firstName: 'Nombre', lastName: 'Prueba', dni: null } }
beforeEach(() => {
  vi.resetAllMocks()
  db.$transaction.mockImplementation(async (callback) => callback(db))
  db.disciplinaryIncident.findFirst.mockResolvedValue({ id: 'case', studentId: 'student', student: person, reporter: person, incidentType: null, category: 'Convivencia', severity: 'low', description: 'Relato original', incidentDate: new Date('2026-10-18'), workflowState: 'reportado', guardianNotifiedAt: null, resolutionNotes: null, events: [{ id: 'event', type: 'note', description: 'Nota original', createdAt: new Date(), actor: person }], attachments: [] })
  db.institution.findUnique.mockResolvedValue({ name: 'Escuela', settings: null })
  db.studentEnrollment.findFirst.mockResolvedValue(null)
  db.guardianStudent.findMany.mockResolvedValue([])
  db.incidentCommitment.create.mockImplementation(async ({ data }) => ({ id: 'commitment', ...data }))
})
describe('emisión y recuperación del acta', () => {
  it('guarda contexto y acuerdos en la misma transacción del acta y evento', async () => {
    const result = await repo.createCommitment('case', 'school', 'actor', { terms: '', document: { agreements: [{ action: 'Revisar', responsible: 'Docente' }] } })
    const document = result.documentData as unknown as CommitmentDocument
    expect(document.context.description).toBe('Relato original')
    expect(document.generalTerms).toBe('')
    expect(document.details.agreements[0].responsible).toBe('Docente')
    expect(result.terms).toContain('Revisar')
    expect(db.disciplinaryIncident.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'case', institutionId: 'school' } }))
    expect(db.studentEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ institutionId: 'school', studentId: 'student', academicYear: { startDate: { lte: new Date('2026-10-18') }, endDate: { gte: new Date('2026-10-18') } } }) }))
    expect(db.incidentEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ institutionId: 'school', type: 'commitment_created' }) }))
  })
  it('descarga la instantánea guardada aunque el expediente o plantilla hayan cambiado', async () => {
    const created = await repo.createCommitment('case', 'school', 'actor', { terms: 'Acuerdo original' })
    db.incidentCommitment.findFirst.mockResolvedValue(created)
    db.$transaction.mockClear()
    const result = await repo.getCommitmentForPdf('case', 'commitment', 'school')
    expect(result.contextIsCurrent).toBe(false)
    expect(result.document.context.description).toBe('Relato original')
    expect(db.$transaction).not.toHaveBeenCalled()
    expect(db.incidentCommitment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'commitment', incidentId: 'case', institutionId: 'school' } }))
  })
  it('identifica que los expedientes antiguos se consultan con información actual', async () => {
    db.incidentCommitment.findFirst.mockResolvedValue({ id: 'legacy', documentData: null })
    expect((await repo.getCommitmentForPdf('case', 'legacy', 'school')).contextIsCurrent).toBe(true)
  })
  it('rechaza un incidente de otra institución y selecciones ajenas sin crear el acta', async () => {
    await expect(repo.createCommitment('case', 'school', 'actor', { terms: 'Acuerdo', document: { timelineEventIds: ['foreign'] } })).rejects.toMatchObject({ statusCode: 400 })
    db.disciplinaryIncident.findFirst.mockResolvedValue(null)
    await expect(repo.createCommitment('case', 'foreign-school', 'actor', { terms: 'Acuerdo' })).rejects.toMatchObject({ statusCode: 404 })
    expect(db.incidentCommitment.create).not.toHaveBeenCalled()
    expect(db.incidentEvent.create).not.toHaveBeenCalled()
  })
})
