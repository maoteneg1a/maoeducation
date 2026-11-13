import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '../../../shared/infrastructure/services/actor'
import { DEFAULT_BOARD_CONFIG } from '../domain/course-board-config'

const stored = vi.hoisted(() => new Map<string, Buffer>())
vi.mock('../../../shared/infrastructure/database/prisma', async () => {
  const { PrismaClient } = await import('@prisma/client')
  const url = process.env.COURSE_BOARDS_TEST_DATABASE_URL || 'postgresql://juntas:juntas-test-only@127.0.0.1:55439/juntas_test'
  const parsed = new URL(url)
  if (parsed.hostname !== '127.0.0.1' || parsed.port !== '55439' || parsed.pathname !== '/juntas_test') throw new Error('Use only the disposable local juntas_test database')
  return { prisma: new PrismaClient({ datasources: { db: { url } } }) }
})
vi.mock('../../../shared/infrastructure/services/storage.service', () => ({ storage: {
  save: vi.fn(async (key: string, buffer: Buffer) => { stored.set(key, buffer) }),
  remove: vi.fn(async (key: string) => { stored.delete(key) }),
  getStream: vi.fn(async (key: string) => stored.has(key) ? Readable.from(stored.get(key)!) : null),
} }))
import { prisma } from '../../../shared/infrastructure/database/prisma'
import * as boards from './course-board.service'

const suite = process.env.COURSE_BOARDS_TEST_DATABASE_URL ? describe : describe.skip
suite('course boards with PostgreSQL', () => {
  const db = prisma as PrismaClient
  let school: string, parallelId: string, periodId: string, secondPeriodId: string, boardId: string, assignmentId: string, otherAssignmentId: string, studentId: string, manualId: string
  let tutor: Actor, teacher: Actor, outsider: Actor, authority: Actor
  beforeEach(async () => {
    const institution = await db.institution.create({ data: { name: 'Escuela ficticia', code: `BOARD_${randomUUID()}`, settings: { branding: { primaryColor: 'blue' }, courseBoards: DEFAULT_BOARD_CONFIG } } })
    school = institution.id
    const role = await db.role.create({ data: { institutionId: school, name: 'teacher', label: 'Docente' } })
    const permission = await db.permission.upsert({ where: { resource_action_scope: { resource: 'reports', action: 'read', scope: 'own' } }, create: { resource: 'reports', action: 'read', scope: 'own' }, update: {} })
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
    const user = async (firstName: string, lastName: string) => db.user.create({ data: { institutionId: school, email: `${randomUUID()}@example.test`, passwordHash: 'unused-test', profile: { create: { firstName, lastName } }, userRoles: { create: { roleId: role.id } } } })
    const [t, d, o, a, s1, s2] = await Promise.all([user('Ana', 'Tutor'), user('Luis', 'Docente'), user('Otro', 'Docente'), user('Rector', 'Autoridad'), user('Zoé', 'Pérez'), user('Ana', 'Álvarez')])
    const actor = (id: string): Actor => ({ userId: id, roles: ['teacher'], permissions: ['reports:read:own', 'formal_reports:write:own'] })
    tutor = actor(t.id); teacher = actor(d.id); outsider = actor(o.id); authority = { ...actor(a.id), roles: ['admin'] }
    studentId = s1.id
    const year = await db.academicYear.create({ data: { institutionId: school, name: '2026-2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31'), isActive: true } })
    const scheme = await db.academicPeriodScheme.create({ data: { institutionId: school, name: 'Períodos configurados', code: 'custom', periodsCount: 2 } })
    const period = await db.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Período configurado', periodNumber: 1, startDate: year.startDate, endDate: new Date('2026-12-31'), isActive: true } })
    periodId = period.id
    secondPeriodId = (await db.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Otro período', periodNumber: 2, startDate: new Date('2027-01-01'), endDate: year.endDate } })).id
    const level = await db.level.create({ data: { institutionId: school, name: 'Octavo', code: '8', sortOrder: 8 } })
    const parallel = await db.parallel.create({ data: { institutionId: school, academicYearId: year.id, levelId: level.id, name: 'A', tutorId: t.id } })
    parallelId = parallel.id
    const math = await db.subject.create({ data: { institutionId: school, name: 'Matemática' } })
    const qualitative = await db.subject.create({ data: { institutionId: school, name: 'Valoración cualitativa', isQualitative: true } })
    const assignment = await db.courseAssignment.create({ data: { institutionId: school, teacherId: d.id, subjectId: math.id, parallelId, academicYearId: year.id, examWeight: 0 } })
    assignmentId = assignment.id
    otherAssignmentId = (await db.courseAssignment.create({ data: { institutionId: school, teacherId: t.id, subjectId: qualitative.id, parallelId, academicYearId: year.id, examWeight: 0 } })).id
    for (const s of [s1, s2]) await db.studentEnrollment.create({ data: { institutionId: school, studentId: s.id, parallelId, academicYearId: year.id } })
    const insumo = await db.insumo.create({ data: { institutionId: school, courseAssignmentId: assignmentId, academicPeriodId: periodId, name: 'Promedio manual', createdBy: d.id } })
    manualId = (await db.manualInsumoAverage.create({ data: { institutionId: school, studentId, insumoId: insumo.id, score: 6, recordedBy: d.id } })).id
    await db.manualInsumoAverage.create({ data: { institutionId: school, studentId: s2.id, insumoId: insumo.id, score: 0, recordedBy: d.id } })
    await db.pedagogicRecovery.create({ data: { institutionId: school, studentId, courseAssignmentId: assignmentId, academicPeriodId: periodId, score: 8, recordedBy: d.id } })
    const qualitativeInsumo = await db.insumo.create({ data: { institutionId: school, courseAssignmentId: otherAssignmentId, academicPeriodId: periodId, name: 'Valoración', createdBy: t.id } })
    await db.manualInsumoAverage.create({ data: { institutionId: school, studentId, insumoId: qualitativeInsumo.id, score: 8, recordedBy: t.id } })
    boardId = (await boards.createBoard(school, tutor, parallelId, periodId)).id
  }, 30000)
  afterAll(async () => { await db.$disconnect() })

  it('reuses the canonical grades, honors zeroes, sorts surnames and allows a tutor to see all subjects', async () => {
    const detail = await boards.boardDetail(school, tutor, boardId)
    expect(detail.matrix.rows.map((r) => r.name)).toEqual(['Álvarez Ana', 'Pérez Zoé'])
    expect(detail.matrix.subjects).toHaveLength(2)
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 0, display: '0.00' })
    expect(detail.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 8, display: '8.00' })
    expect(detail.matrix.periodName).toBe('Período configurado')
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === otherAssignmentId)).toMatchObject({ value: null, display: '—' })
    expect(detail.matrix.rows[1].grades.find((g) => g.assignmentId === otherAssignmentId)).toMatchObject({ value: 8, display: 'B+' })
  })

  it('marks missing weighted components without confusing zero with an absent grade', async () => {
    await db.courseAssignment.update({ where: { id: assignmentId }, data: { examWeight: 30, projectWeight: 15 } })
    const detail = await boards.boardDetail(school, tutor, boardId)
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 0, display: '0.00', partial: true })
    expect(detail.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 8, partial: true })
  })

  it('archives immutable printable PDFs and freezes the reviewed matrix at closure without locking grades', async () => {
    const consolidated = await boards.emitConsolidated(school, tutor, boardId)
    const report = await boards.emitBoardReport(school, teacher, boardId, { typeKey: 'subject', courseAssignmentId: assignmentId, situation: 'Se requiere acompañamiento', actions: 'Refuerzo guiado', recommendations: 'Revisar avances' })
    const before = await boards.boardDetail(school, tutor, boardId)
    const closed = await boards.closeBoard(school, tutor, boardId, 'Continuar acompañamiento. Responsable: docente. Revisar el próximo período.', before.revision, before.matrixHash)
    const file = await boards.boardFile(school, tutor, closed.id)
    expect(stored.get(file.storedName)!.subarray(0, 5).toString()).toBe('%PDF-')
    writeFileSync('/private/tmp/mao-juntas-acta-preview.pdf', stored.get(file.storedName)!)
    await db.manualInsumoAverage.update({ where: { id: manualId }, data: { score: 9 } })
    const frozen = await boards.boardDetail(school, tutor, boardId)
    expect(frozen.status).toBe('CLOSED')
    expect(frozen.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)!.value).toBe(8)
    expect(frozen.evidence.map((f) => f.id)).toEqual(expect.arrayContaining([consolidated.id, report.id, closed.id]))
    await expect(boards.emitBoardReport(school, teacher, boardId, { typeKey: 'subject', courseAssignmentId: assignmentId, situation: 'Nuevo informe' })).rejects.toMatchObject({ statusCode: 409 })
    await boards.reopenBoard(school, tutor, boardId)
    const reopened = await boards.boardDetail(school, tutor, boardId)
    expect(reopened.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)!.value).toBe(9)
    expect(reopened.evidence.some((f) => f.id === closed.id)).toBe(true)
  })

  it('requires both a compatible author type and ownership of the selected assignment', async () => {
    await expect(boards.emitBoardReport(school, teacher, boardId, { typeKey: 'general', situation: 'Informe general' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(boards.emitBoardReport(school, teacher, boardId, { typeKey: 'subject', courseAssignmentId: otherAssignmentId, situation: 'Otra materia' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(boards.closeBoard(school, teacher, boardId, 'No puede cerrar', 0, 'a'.repeat(64))).rejects.toMatchObject({ statusCode: 403 })
    const author = { ...teacher, permissions: ['reports:read:own'] }
    await expect(boards.emitBoardReport(school, author, boardId, { typeKey: 'subject', courseAssignmentId: assignmentId, situation: 'Mi materia' })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('limits delegates to their assigned meeting, and protects evidence across schools and unrelated teachers', async () => {
    const file = await boards.emitConsolidated(school, tutor, boardId)
    await expect(boards.boardDetail(school, outsider, boardId)).rejects.toMatchObject({ statusCode: 404 })
    await expect(boards.boardFile(school, outsider, file.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(boards.boardFile('another-school', authority, file.id)).rejects.toMatchObject({ statusCode: 404 })
    await boards.assignBoardChair(school, authority, boardId, outsider.userId)
    expect((await boards.boardDetail(school, outsider, boardId)).canDirect).toBe(true)
    await expect(boards.createBoard(school, outsider, parallelId, secondPeriodId)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('detects documents added since review and leaves the meeting open on a stale close request', async () => {
    const detail = await boards.boardDetail(school, tutor, boardId)
    await boards.emitConsolidated(school, teacher, boardId)
    await expect(boards.closeBoard(school, tutor, boardId, 'Acuerdos revisados', detail.revision, detail.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.courseBoard.findUniqueOrThrow({ where: { id: boardId } })).status).toBe('OPEN')
    expect(await db.courseBoardEvidence.count({ where: { boardId, kind: 'MINUTES' } })).toBe(0)
  })

  it('requires a fresh review if grades change while the meeting is open', async () => {
    const reviewed = await boards.boardDetail(school, tutor, boardId)
    await db.manualInsumoAverage.update({ where: { id: manualId }, data: { score: 9 } })
    await expect(boards.closeBoard(school, tutor, boardId, 'Acuerdos con notas anteriores', reviewed.revision, reviewed.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    expect((await db.courseBoard.findUniqueOrThrow({ where: { id: boardId } })).status).toBe('OPEN')
    const current = await boards.boardDetail(school, tutor, boardId)
    await expect(boards.closeBoard(school, tutor, boardId, 'Acuerdos con notas revisadas', current.revision, current.matrixHash)).resolves.toBeDefined()
  })

  it('accepts scans after closure, rejects disguised files and retains a truthful signature declaration', async () => {
    const reviewed = await boards.boardDetail(school, tutor, boardId)
    await boards.closeBoard(school, tutor, boardId, 'Acuerdos y seguimiento', 0, reviewed.matrixHash)
    const scan = await boards.uploadBoardEvidence(school, teacher, boardId, { filename: '../copia-firmada.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nscan') }, true)
    const file = await boards.boardFile(school, tutor, scan.id)
    expect(file).toMatchObject({ kind: 'UPLOAD', isSigned: true, fileName: 'copia-firmada.pdf' })
    await expect(boards.uploadBoardEvidence(school, teacher, boardId, { filename: 'fake.pdf', mimetype: 'application/pdf', buffer: Buffer.from('not a pdf') }, false)).rejects.toMatchObject({ statusCode: 400 })
    expect((await boards.boardDetail(school, tutor, boardId)).status).toBe('CLOSED')
  })

  it('summarizes only period records and never includes the description of disciplinary incidents', async () => {
    await db.disciplinaryIncident.createMany({ data: [
      { institutionId: school, studentId, reportedBy: teacher.userId, incidentDate: new Date('2026-10-12'), category: 'Convivencia', description: 'Contenido reservado que no debe aparecer en la junta' },
      { institutionId: school, studentId, reportedBy: teacher.userId, incidentDate: new Date('2026-08-01'), category: 'Convivencia', description: 'Fuera del período' },
    ] })
    await db.attendanceRecord.createMany({ data: [
      { institutionId: school, studentId, courseAssignmentId: assignmentId, date: new Date('2026-10-12'), status: 'absent', recordedBy: teacher.userId },
      { institutionId: school, studentId, courseAssignmentId: assignmentId, date: new Date('2026-10-13'), status: 'excused', recordedBy: teacher.userId },
      { institutionId: school, studentId, courseAssignmentId: assignmentId, date: new Date('2026-08-01'), status: 'late', recordedBy: teacher.userId },
    ] })
    await db.behaviorGrade.create({ data: { institutionId: school, studentId, academicPeriodId: periodId, code: 'B', notes: 'Observación pedagógica', recordedBy: tutor.userId } })
    const detail = await boards.boardDetail(school, tutor, boardId)
    expect(detail.matrix.rows.find((r) => r.id === studentId)).toMatchObject({ absences: 2, late: 0, incidents: 1, behavior: 'B', observation: 'Observación pedagógica' })
    expect(JSON.stringify(detail)).not.toContain('Contenido reservado')
  })

  it('rolls back the folder and removes a stored PDF when metadata cannot be saved', async () => {
    const count = stored.size
    await expect(boards.emitConsolidated(school, { ...authority, userId: randomUUID() }, boardId)).rejects.toBeDefined()
    expect(stored.size).toBe(count)
    expect((await db.courseBoard.findUniqueOrThrow({ where: { id: boardId } })).revision).toBe(0)
    expect(await db.courseBoardEvidence.count({ where: { boardId } })).toBe(0)
  })

  it('saves configurable report labels without overwriting other institutional settings', async () => {
    await expect(boards.updateBoardConfig(school, tutor, DEFAULT_BOARD_CONFIG)).rejects.toMatchObject({ statusCode: 403 })
    const config = { ...DEFAULT_BOARD_CONFIG, situationLabel: 'Hallazgos', reportTypes: [{ key: 'custom', label: 'Informe breve', enabled: true, authors: 'both' as const }] }
    await boards.updateBoardConfig(school, authority, config)
    const institution = await db.institution.findUniqueOrThrow({ where: { id: school } })
    expect(institution.settings).toMatchObject({ branding: { primaryColor: 'blue' }, courseBoards: { situationLabel: 'Hallazgos' } })
    const result = await boards.emitBoardReport(school, teacher, boardId, { typeKey: 'custom', courseAssignmentId: assignmentId, situation: 'Hallazgo del período' })
    const evidence = await db.courseBoardEvidence.findUniqueOrThrow({ where: { id: result.id } })
    expect(evidence.snapshot).toMatchObject({ title: 'Informe breve', labels: { situation: 'Hallazgos' } })
  })
})
