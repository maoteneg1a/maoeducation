import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import { DEFAULT_REPORTS_FLOW } from '../../../../shared/domain/reports-flow'
import { buildDossier } from './dossier.service'
import { uploadDossierFile, dossierFileForDownload, setDossierApplicability } from './dossier-files.service'

const db = vi.hoisted(() => ({
  studentEnrollment: { findFirst: vi.fn() }, courseAssignment: { findMany: vi.fn() },
  formalReport: { findMany: vi.fn() }, parentMeeting: { findMany: vi.fn() }, reinforcementPlan: { findMany: vi.fn() },
  dossierFile: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn() },
  dossierException: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  earlyAlert: { findMany: vi.fn() },
}))
const storage = vi.hoisted(() => ({ save: vi.fn(), remove: vi.fn() }))
const state = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('../../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../../shared/infrastructure/services/storage.service', () => ({ storage }))
vi.mock('../../../../shared/infrastructure/services/agreement.service', () => ({ institutionSettings: async () => state.settings }))
const teacher = { userId: 'teacher', roles: ['teacher'], permissions: ['student_folder:read:own', 'formal_reports:write:own'] }
const context = { studentId: 'student', academicYearId: 'year', courseAssignmentId: 'assignment' }
const file = (signed = false, itemKey = 'd6') => ({ id: 'file', itemKey, scopeKey: 'assignment', courseAssignmentId: 'assignment', fileName: 'respaldo.pdf', isSigned: signed, createdAt: new Date(), uploadedBy: 'teacher', uploader: { profile: { firstName: 'Docente', lastName: 'Uno' } }, observation: null })
const report = (typeKey: string, pdfTemplate?: string) => ({ id: 'report', typeKey, typeLabel: typeKey, folio: 'INF-1', status: 'RECEIVED', sentAt: new Date(), courseAssignmentId: 'assignment', reinforcementPlanId: null, typeConfig: { pdfTemplate }, authorId: 'teacher', confidential: false, recipients: [] })
beforeEach(() => {
  vi.resetAllMocks()
  state.settings = { reportsFlow: structuredClone(DEFAULT_REPORTS_FLOW) }
  db.studentEnrollment.findFirst.mockResolvedValue({ parallelId: 'parallel', hasAdaptation: true, adaptationType: 'grado_2', parallel: { name: 'A', tutorId: null, level: { name: 'Sexto', subnivel: 'media' } }, academicYear: { name: '2026-2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-01') }, student: { email: 'student', profile: { firstName: 'Ana', lastName: 'Pérez', dni: null } } })
  db.courseAssignment.findMany.mockResolvedValue([{ id: 'assignment', teacherId: 'teacher', subject: { name: 'Matemática' } }])
  for (const model of [db.formalReport, db.parentMeeting, db.reinforcementPlan, db.dossierFile, db.dossierException]) model.findMany.mockResolvedValue([])
  db.dossierFile.create.mockResolvedValue({ id: 'file' })
  db.earlyAlert.findMany.mockRejectedValue(new Error('El expediente no debe consultar alertas tempranas'))
})

describe('checklist de los 13 documentos de respaldo', () => {
  it('se abre sin alertas y sin casos; presenta las materias del docente y trece documentos pendientes', async () => {
    const dossier = await buildDossier('school', teacher, 'student', 'year', 'assignment')
    expect(dossier.items).toHaveLength(13)
    expect(dossier.completion).toBe(0)
    expect(dossier.subjects).toEqual([{ id: 'assignment', name: 'Matemática' }])
    expect(dossier.items.find((i) => i.key === 'd9')?.status).toBe('missing')
    expect(db.earlyAlert.findMany).not.toHaveBeenCalled()
    expect(db.courseAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ institutionId: 'school', academicYearId: 'year', teacherId: 'teacher' }) }))
  })

  it('el punto 7 exige tres informes al tutor; no cuenta el Anexo 1 de alertas a las autoridades', async () => {
    db.formalReport.findMany.mockResolvedValue([report('bajo_rendimiento_tutor'), { ...report('bajo_rendimiento_tutor'), id: 'second' }, report('acta_entrega_alertas', 'annex_alerts'), { ...report('bajo_rendimiento_tutor', 'annex_alerts'), id: 'legacy-misplaced' }])
    const dossier = await buildDossier('school', teacher, 'student', 'year', 'assignment')
    expect(dossier.items.find((i) => i.key === 'd7')).toMatchObject({ minCount: 3, acknowledged: 2, status: 'partial' })
    db.dossierFile.findMany.mockResolvedValue([file(false, 'd7')])
    expect((await buildDossier('school', teacher, 'student', 'year', 'assignment')).items.find((i) => i.key === 'd7')?.status).toBe('ok')
  })

  it('una carta generada con acuse no sustituye el compromiso firmado; el escaneado firmado completa el punto', async () => {
    db.formalReport.findMany.mockResolvedValue([report('carta_compromiso')])
    db.dossierFile.findMany.mockResolvedValue([file(false)])
    expect((await buildDossier('school', teacher, 'student', 'year', 'assignment')).items.find((i) => i.key === 'd6')).toMatchObject({ status: 'partial', acknowledged: 0 })
    db.dossierFile.findMany.mockResolvedValue([file(true)])
    expect((await buildDossier('school', teacher, 'student', 'year', 'assignment')).items.find((i) => i.key === 'd6')).toMatchObject({ status: 'ok', acknowledged: 1 })
  })

  it('no da por cumplida un acta de reunión sin firma ni una adaptación solo marcada en la matrícula', async () => {
    db.parentMeeting.findMany.mockResolvedValue([{ id: 'meeting', subject: 'Reunión', meetingDate: new Date(), signedAt: null }])
    const dossier = await buildDossier('school', teacher, 'student', 'year', 'assignment')
    expect(dossier.items.find((i) => i.key === 'd11')?.status).toBe('partial')
    expect(dossier.items.find((i) => i.key === 'd9')?.status).toBe('missing')
    db.dossierException.findMany.mockResolvedValue([{ itemKey: 'd9', scopeKey: 'general', reason: 'No requiere adaptaciones curriculares.' }])
    expect((await buildDossier('school', teacher, 'student', 'year', 'assignment')).items.find((i) => i.key === 'd9')).toMatchObject({ status: 'na', notApplicableReason: 'No requiere adaptaciones curriculares.' })
  })

  it('no mezcla los respaldos de materias diferentes', async () => {
    db.dossierFile.findMany.mockResolvedValue([{ ...file(true), scopeKey: 'another-assignment', courseAssignmentId: 'another-assignment' }])
    expect((await buildDossier('school', teacher, 'student', 'year', 'assignment')).items.find((i) => i.key === 'd6')?.status).toBe('missing')
    await expect(buildDossier('school', teacher, 'student', 'year', 'another-assignment')).rejects.toThrow('no tienes acceso')
  })

  it('rechaza el acceso de familias y consulta exclusivamente la matrícula de la institución', async () => {
    await expect(buildDossier('school', { userId: 'guardian', roles: ['guardian'], permissions: [] }, 'student', 'year')).rejects.toThrow('uso del personal')
    expect(db.studentEnrollment.findFirst).not.toHaveBeenCalled()
    await buildDossier('school', teacher, 'student', 'year', 'assignment')
    expect(db.studentEnrollment.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { institutionId: 'school', studentId: 'student', academicYearId: 'year' } }))
  })
})

describe('PDF y escaneados del expediente', () => {
  it('guarda el PDF por punto, alumno, año y materia, con autor y comprobación de firmas', async () => {
    await uploadDossierFile('school', teacher, { ...context, itemKey: 'd6', isSigned: true }, { filename: '../compromiso.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7 ejemplo') })
    expect(db.dossierFile.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ institutionId: 'school', studentId: 'student', academicYearId: 'year', courseAssignmentId: 'assignment', itemKey: 'd6', isSigned: true, uploadedBy: 'teacher', fileName: 'compromiso.pdf' }) }))
  })
  it('rechaza archivos que simulan ser PDF', async () => {
    await expect(uploadDossierFile('school', teacher, { ...context, itemKey: 'd6' }, { filename: 'falso.pdf', mimetype: 'application/pdf', buffer: Buffer.from('no es PDF') })).rejects.toThrow('escaneada válida')
    expect(storage.save).not.toHaveBeenCalled()
  })
  it('evita contar el mismo archivo dos veces y limpia una subida duplicada', async () => {
    db.dossierFile.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5.22.0' }))
    await expect(uploadDossierFile('school', teacher, { ...context, itemKey: 'd6' }, { filename: 'carta.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7') })).rejects.toThrow('ya está adjunto')
    expect(storage.remove).toHaveBeenCalledOnce()
  })
  it('no permite justificar la ausencia de un requisito obligatorio ni omitir el motivo de uno condicional', async () => {
    await expect(setDossierApplicability('school', teacher, { ...context, itemKey: 'd6', notApplicable: true, reason: 'No se entregó' })).rejects.toThrow('obligatorio')
    await expect(setDossierApplicability('school', teacher, { ...context, itemKey: 'd13', notApplicable: true })).rejects.toThrow('motivo')
    expect(db.dossierException.upsert).not.toHaveBeenCalled()
  })
  it('protege el contenido de un informe técnico del DECE subido por otro usuario', async () => {
    db.dossierFile.findFirst.mockResolvedValue({ ...file(false, 'd13'), institutionId: 'school', studentId: 'student', academicYearId: 'year', courseAssignmentId: null, scopeKey: 'general', uploadedBy: 'dece' })
    await expect(dossierFileForDownload('school', teacher, 'file')).rejects.toThrow('Documento reservado')
    expect(db.dossierFile.findFirst).toHaveBeenCalledWith({ where: { id: 'file', institutionId: 'school' } })
  })
  it('mantiene reservado un archivo aunque después se retire su tipo de documento de la configuración', async () => {
    const config = structuredClone(DEFAULT_REPORTS_FLOW)
    config.reportTypes = config.reportTypes.filter((t) => t.key !== 'informe_tecnico_dece')
    state.settings = { reportsFlow: config }
    db.dossierFile.findFirst.mockResolvedValue({ ...file(false, 'd13'), studentId: 'student', academicYearId: 'year', courseAssignmentId: null, uploadedBy: 'dece', confidential: true })
    await expect(dossierFileForDownload('school', teacher, 'file')).rejects.toThrow('Documento reservado')
  })
})
