import { randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Actor } from '../../../shared/infrastructure/services/actor'
import { DEFAULT_BOARD_CONFIG } from '../domain/course-board-config'

vi.mock('../../../shared/infrastructure/services/push.service', () => ({ sendPushToUser: vi.fn(async () => {}) }))
import { sendPushToUser } from '../../../shared/infrastructure/services/push.service'

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
  let tutor: Actor, teacher: Actor, outsider: Actor, authority: Actor, secretary: Actor
  beforeEach(async () => {
    const institution = await db.institution.create({ data: { name: 'Escuela ficticia', code: `BOARD_${randomUUID()}`, settings: { branding: { primaryColor: 'blue' }, courseBoards: DEFAULT_BOARD_CONFIG } } })
    school = institution.id
    const role = await db.role.create({ data: { institutionId: school, name: 'teacher', label: 'Docente' } })
    const permission = await db.permission.upsert({ where: { resource_action_scope: { resource: 'reports', action: 'read', scope: 'own' } }, create: { resource: 'reports', action: 'read', scope: 'own' }, update: {} })
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } })
    const user = async (firstName: string, lastName: string) => db.user.create({ data: { institutionId: school, email: `${randomUUID()}@example.test`, passwordHash: 'unused-test', profile: { create: { firstName, lastName } }, userRoles: { create: { roleId: role.id } } } })
    const [t, d, o, a, s1, s2, q] = await Promise.all([user('Ana', 'Tutor'), user('Luis', 'Docente'), user('Otro', 'Docente'), user('Rector', 'Autoridad'), user('Zoé', 'Pérez'), user('Ana', 'Álvarez'), user('Sara', 'Secretaría')])
    const actor = (id: string): Actor => ({ userId: id, roles: ['teacher'], permissions: ['reports:read:own', 'formal_reports:write:own'] })
    tutor = actor(t.id); teacher = actor(d.id); outsider = actor(o.id); authority = { ...actor(a.id), roles: ['admin'] }
    secretary = actor(q.id)
    studentId = s1.id
    const year = await db.academicYear.create({ data: { institutionId: school, name: '2026-2027', startDate: new Date('2026-09-01'), endDate: new Date('2027-07-31'), isActive: true } })
    const scheme = await db.academicPeriodScheme.create({ data: { institutionId: school, name: 'Períodos configurados', code: 'custom', periodsCount: 2 } })
    const period = await db.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Período configurado', periodNumber: 1, startDate: year.startDate, endDate: new Date('2026-12-31'), isActive: true } })
    periodId = period.id
    secondPeriodId = (await db.academicPeriod.create({ data: { academicYearId: year.id, schemeId: scheme.id, name: 'Otro período', periodNumber: 2, startDate: new Date('2027-01-01'), endDate: year.endDate } })).id
    const level = await db.level.create({ data: { institutionId: school, name: 'Octavo', code: '8', sortOrder: 8 } })
    const parallel = await db.parallel.create({ data: { institutionId: school, academicYearId: year.id, levelId: level.id, name: 'A', tutorId: t.id } })
    parallelId = parallel.id
    await db.institution.update({ where: { id: school }, data: { settings: { branding: { primaryColor: 'blue' }, courseBoards: { ...DEFAULT_BOARD_CONFIG, secretaries: { [parallelId]: secretary.userId } } } } })
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
    boardId = (await boards.createBoard(school, secretary, parallelId, periodId)).id
    const created = await db.courseBoard.findUniqueOrThrow({ where: { id: boardId } })
    await db.courseBoard.update({ where: { id: boardId }, data: { meeting: { ...(created.meeting as Record<string, unknown>), shift: 'Matutina', invitationDate: '2026-11-01', meetingDate: '2026-11-12', startTime: '09:00', scheduledEndTime: '10:30', actualEndTime: '10:35', location: 'Auditorio' } } })
  }, 30000)
  afterAll(async () => { await db.$disconnect() })
  async function confirm() {
    const detail = await boards.boardDetail(school, tutor, boardId)
    await boards.confirmBoardGrades(school, tutor, boardId, detail.gradesHash)
    return boards.boardDetail(school, secretary, boardId)
  }
  it('lets the tutor review all subjects with canonical grades and Spanish surname order', async () => {
    const detail = await boards.boardDetail(school, tutor, boardId)
    expect(detail.matrix.rows.map((r) => r.name)).toEqual(['Álvarez Ana', 'Pérez Zoé'])
    expect(detail.matrix.subjects).toHaveLength(2)
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === assignmentId)?.value).toBe(0)
    expect(detail.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)?.value).toBe(8)
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === otherAssignmentId)?.value).toBeNull()
  })
  it('marks missing weighted components without confusing zero with an absent grade', async () => {
    await db.courseAssignment.update({ where: { id: assignmentId }, data: { examWeight: 30, projectWeight: 15 } })
    const detail = await boards.boardDetail(school, tutor, boardId)
    expect(detail.matrix.rows[0].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 0, display: '0.00', partial: true })
    expect(detail.matrix.rows[1].grades.find((g) => g.assignmentId === assignmentId)).toMatchObject({ value: 8, partial: true })
  })

  it('excludes subject teachers even with general report permissions and protects every document route', async () => {
    const broadTeacher = { ...teacher, permissions: ['reports:read:all', 'formal_reports:manage:all'] }
    for (const actor of [teacher, broadTeacher, outsider]) {
      expect(await boards.boardAccess(school, actor)).toEqual({ canAccess: false })
      expect((await boards.boardOptions(school, actor)).parallels).toEqual([])
      await expect(boards.boardDetail(school, actor, boardId)).rejects.toMatchObject({ statusCode: 404 })
      await expect(boards.emitConsolidated(school, actor, boardId)).rejects.toMatchObject({ statusCode: 404 })
      await expect(boards.emitMeetingDocument(school, actor, boardId, 'ATTENDANCE')).rejects.toMatchObject({ statusCode: 404 })
      await expect(boards.uploadBoardEvidence(school, actor, boardId, { filename: 'scan.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }, true)).rejects.toMatchObject({ statusCode: 404 })
      await expect(boards.emitBoardReport(school, actor, boardId, { typeKey: 'subject', courseAssignmentId: assignmentId, situation: 'Test' })).rejects.toMatchObject({ statusCode: 404 })
    }
    const file = await boards.emitConsolidated(school, tutor, boardId)
    await expect(boards.boardFile(school, teacher, file.id)).rejects.toMatchObject({ statusCode: 404 })
    await expect(boards.boardDetail(randomUUID(), authority, boardId)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('returns only the actions for each responsibility', async () => {
    const tutorView = await boards.boardDetail(school, tutor, boardId)
    expect(tutorView).toMatchObject({ isTutor: true, isSecretary: false, canConfirmGrades: true, canEditMeeting: false, canPublishInvitation: false, canUpload: false, canDirect: false })
    expect(await boards.boardDetail(school, secretary, boardId)).toMatchObject({ isTutor: false, isSecretary: true, canConfirmGrades: false, canEditMeeting: true, canUpload: true, canDirect: true, canReport: false })
    expect(await boards.boardDetail(school, authority, boardId)).toMatchObject({ isAuthority: true, canConfirmGrades: false, canEditMeeting: false, canUpload: false, canDirect: false, canReopen: true })
    expect(await boards.boardAccess(school, tutor)).toEqual({ canAccess: true })
    expect(await boards.boardAccess(school, secretary)).toEqual({ canAccess: true })
    expect(await boards.boardAccess(school, authority)).toEqual({ canAccess: true })
  })
  it('reserves invitations and meeting data for the assigned secretary', async () => {
    const detail = await boards.boardDetail(school, tutor, boardId)
    for (const actor of [tutor, authority]) {
      await expect(boards.createBoard(school, actor, parallelId, secondPeriodId)).rejects.toMatchObject({ statusCode: 403 })
      await expect(boards.updateMeeting(school, actor, boardId, { revision: detail.revision, meeting: detail.meeting })).rejects.toMatchObject({ statusCode: 403 })
      await expect(boards.previewInvitation(school, actor, boardId)).rejects.toMatchObject({ statusCode: 403 })
    }
    const saved = await boards.updateMeeting(school, secretary, boardId, { revision: detail.revision, meeting: { ...detail.meeting, development: 'Se revisaron los resultados.' } })
    expect(saved).toMatchObject({ revision: detail.revision + 1, meeting: { development: 'Se revisaron los resultados.' } })
    await expect(boards.updateMeeting(school, secretary, boardId, { revision: detail.revision, meeting: detail.meeting })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('requires the actual tutor to confirm the reviewed grades and archives the confirmation', async () => {
    const detail = await boards.boardDetail(school, tutor, boardId)
    for (const actor of [secretary, authority]) await expect(boards.confirmBoardGrades(school, actor, boardId, detail.gradesHash)).rejects.toMatchObject({ statusCode: 403 })
    await expect(boards.confirmBoardGrades(school, tutor, boardId, '0'.repeat(64))).rejects.toMatchObject({ statusCode: 409 })
    const reviewed = await confirm()
    expect(reviewed.notesConfirmed).toBe(true)
    expect((await boards.boardDetail(school, tutor, boardId)).canConfirmGrades).toBe(false)
    await boards.confirmBoardGrades(school, tutor, boardId, reviewed.gradesHash)
    const files = await db.courseBoardEvidence.findMany({ where: { boardId, kind: 'GRADES_CONFIRMATION' } })
    expect(files).toHaveLength(1)
    expect(files[0].snapshot).toMatchObject({ tutorId: tutor.userId, gradesHash: reviewed.gradesHash })
    expect(stored.get(files[0].storedName)?.subarray(0, 5).toString()).toBe('%PDF-')
  })
  it('lets secretariat close only after tutor confirmation and freezes the reviewed matrix', async () => {
    const unconfirmed = await boards.boardDetail(school, secretary, boardId)
    await expect(boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', unconfirmed.revision, unconfirmed.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    const detail = await confirm()
    for (const actor of [tutor, authority]) await expect(boards.closeBoard(school, actor, boardId, 'Acuerdos del curso', detail.revision, detail.matrixHash)).rejects.toMatchObject({ statusCode: 403 })
    const closed = await boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', detail.revision, detail.matrixHash)
    const file = await boards.boardFile(school, authority, closed.id)
    expect(file.kind).toBe('MINUTES')
    expect((await boards.boardDetail(school, authority, boardId))).toMatchObject({ status: 'CLOSED', notesConfirmed: true })
    await db.manualInsumoAverage.update({ where: { id: manualId }, data: { score: 9 } })
    expect((await boards.boardDetail(school, tutor, boardId)).matrix.rows).toEqual(detail.matrix.rows)
    await expect(boards.reopenBoard(school, secretary, boardId)).rejects.toMatchObject({ statusCode: 403 })
    await boards.reopenBoard(school, authority, boardId)
    expect((await boards.boardDetail(school, tutor, boardId))).toMatchObject({ status: 'OPEN', notesConfirmed: false, canConfirmGrades: true })
    expect(stored.has(file.storedName)).toBe(true)
  })
  it('invalidates confirmation when grades change and requires the tutor to review again', async () => {
    const reviewed = await confirm()
    await db.manualInsumoAverage.update({ where: { id: manualId }, data: { score: 9 } })
    const changed = await boards.boardDetail(school, secretary, boardId)
    expect(changed.notesConfirmed).toBe(false)
    await expect(boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', changed.revision, changed.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    await expect(boards.confirmBoardGrades(school, tutor, boardId, reviewed.gradesHash)).rejects.toMatchObject({ statusCode: 409 })
    const updated = await confirm()
    await expect(boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', updated.revision, updated.matrixHash)).resolves.toBeDefined()
  })
  it('detects concurrent documents and summary changes without silently approving a stale close', async () => {
    const reviewed = await confirm()
    await boards.emitConsolidated(school, authority, boardId)
    await expect(boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', reviewed.revision, reviewed.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    const current = await boards.boardDetail(school, secretary, boardId)
    await db.behaviorGrade.create({ data: { institutionId: school, studentId, academicPeriodId: periodId, code: 'B', notes: 'Observación pedagógica', recordedBy: tutor.userId } })
    await expect(boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', current.revision, current.matrixHash)).rejects.toMatchObject({ statusCode: 409 })
    expect((await boards.boardDetail(school, tutor, boardId)).notesConfirmed).toBe(true)
  })
  it('reserves evidence uploads for secretariat and retains copies after closure', async () => {
    const reviewed = await confirm()
    await boards.closeBoard(school, secretary, boardId, 'Acuerdos del curso', reviewed.revision, reviewed.matrixHash)
    const scan = { filename: '../copia-firmada.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nscan') }
    for (const actor of [tutor, authority]) await expect(boards.uploadBoardEvidence(school, actor, boardId, scan, true)).rejects.toMatchObject({ statusCode: 403 })
    const result = await boards.uploadBoardEvidence(school, secretary, boardId, scan, true)
    expect(await boards.boardFile(school, authority, result.id)).toMatchObject({ kind: 'UPLOAD', isSigned: true, fileName: 'copia-firmada.pdf' })
    await expect(boards.uploadBoardEvidence(school, secretary, boardId, { ...scan, buffer: Buffer.from('not a pdf') }, true)).rejects.toMatchObject({ statusCode: 400 })
  })
  it('keeps optional tutor reports without giving ordinary teachers access to the board', async () => {
    const result = await boards.emitBoardReport(school, tutor, boardId, { typeKey: 'general', situation: 'Hallazgo del período' })
    expect(await boards.boardFile(school, tutor, result.id)).toMatchObject({ kind: 'REPORT' })
    await expect(boards.emitBoardReport(school, secretary, boardId, { typeKey: 'general', situation: 'Test' })).rejects.toMatchObject({ statusCode: 403 })
    await expect(boards.emitBoardReport(school, tutor, boardId, { typeKey: 'subject', courseAssignmentId: assignmentId, situation: 'Test' })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('publishes a single targeted notice with an independent archived PDF', async () => {
    const detail = await boards.boardDetail(school, secretary, boardId)
    const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    await boards.updateMeeting(school, secretary, boardId, { revision: detail.revision, meeting: { ...detail.meeting, meetingDate: date } })
    const preview = await boards.previewInvitation(school, secretary, boardId)
    expect(preview.recipients.map((u) => u.id).sort()).toEqual([tutor.userId, teacher.userId, secretary.userId].sort())
    const result = await boards.publishInvitation(school, secretary, boardId, preview.revision)
    const notice = await db.announcement.findUniqueOrThrow({ where: { id: result.id } })
    const evidence = await db.courseBoardEvidence.findFirstOrThrow({ where: { boardId, kind: 'CALL' } })
    expect(notice.audience).toBe('selected_users')
    expect(stored.get(evidence.storedName)).toEqual(stored.get(`announcements/${notice.attachmentStoredName}`))
    const current = await boards.boardDetail(school, secretary, boardId)
    expect(await boards.publishInvitation(school, secretary, boardId, current.revision)).toEqual(result)
    expect(await db.announcement.count({ where: { courseBoardId: boardId } })).toBe(1)
    expect(sendPushToUser).toHaveBeenCalledWith(teacher.userId, expect.objectContaining({ url: `/announcements?notice=${result.id}` }))
  })
  it('does not leak disciplinary descriptions into the board', async () => {
    await db.disciplinaryIncident.create({ data: { institutionId: school, studentId, reportedBy: teacher.userId, incidentDate: new Date('2026-10-12'), category: 'Convivencia', description: 'Descripción reservada' } })
    const detail = await boards.boardDetail(school, authority, boardId)
    expect(detail.matrix.rows.find((r) => r.id === studentId)?.incidents).toBe(1)
    expect(JSON.stringify(detail)).not.toContain('Descripción reservada')
  })
  it('rolls back a confirmation and stored PDF when metadata cannot be saved', async () => {
    const count = stored.size
    await expect(boards.emitConsolidated(school, { ...authority, userId: randomUUID() }, boardId)).rejects.toBeDefined()
    expect(stored.size).toBe(count)
    expect((await db.courseBoard.findUniqueOrThrow({ where: { id: boardId } })).revision).toBe(0)
  })
})
