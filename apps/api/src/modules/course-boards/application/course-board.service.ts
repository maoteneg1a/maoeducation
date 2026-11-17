import { z } from 'zod'
import { assertMeetingReady, readMeeting, meetingDetailsSchema } from '../domain/meeting-details'
import { convocationHash, resolveConvocationRecipients } from '../domain/convocation-recipients'
import { buildMeetingPdf, MEETING_TITLES } from './meeting-pdf'
import crypto from 'node:crypto'
import { sendPushToUser } from '../../../shared/infrastructure/services/push.service'
import path from 'node:path'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { storage } from '../../../shared/infrastructure/services/storage.service'
import { hasPermission, isAuthority, type Actor } from '../../../shared/infrastructure/services/actor'
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../../shared/domain/errors/app.errors'
import { extractReportsFlow } from '../../../shared/domain/reports-flow'
import { boardConfig, boardConfigSchema, reportInputSchema, type BoardConfig } from '../domain/course-board-config'
import type { BoardSnapshot, BoardReportDocument } from '../domain/course-board.types'
import { buildBoardSnapshot } from './course-board-snapshot'
import { buildBoardPdf } from './course-board-pdf'

const person = { id: true, profile: { select: { firstName: true, lastName: true } } } as const
const name = (p: { firstName: string; lastName: string } | null) => p ? `${p.lastName} ${p.firstName}`.trim() : 'Sin nombre'
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value))
function broad(actor: Actor) { return isAuthority(actor) || hasPermission(actor, 'reports', 'read', 'all') }
function accessWhere(actor: Actor, periodId?: string, secretaryParallelIds: string[] = []): Prisma.ParallelWhereInput {
  return broad(actor) ? {} : { OR: [
    ...(secretaryParallelIds.length ? [{ id: { in: secretaryParallelIds } }] : []),
    { tutorId: actor.userId },
    { courseAssignments: { some: { teacherId: actor.userId, isActive: true } } },
    { courseBoards: { some: { chairId: actor.userId, ...(periodId ? { academicPeriodId: periodId } : {}) } } },
  ] }
}
function chairWhere(institutionId: string): Prisma.UserWhereInput {
  return { institutionId, isActive: true, userRoles: { some: { role: { OR: [
    { name: { in: ['admin', 'rector'] } },
    { rolePermissions: { some: { permission: { resource: { in: ['reports', '*'] }, action: { in: ['read', 'manage', '*'] } } } } },
  ] } } } }
}
async function context(institutionId: string, actor: Actor, parallelId: string, periodId: string, secretaryId?: string) {
  const parallel = await prisma.parallel.findFirst({
    where: { id: parallelId, institutionId, ...accessWhere(actor, periodId, secretaryId === actor.userId ? [parallelId] : []) },
    include: { tutor: { select: person }, academicYear: true, courseAssignments: { where: { institutionId, isActive: true }, select: { id: true, teacherId: true, teacher: { select: person }, subject: { select: { name: true } } } } },
  })
  if (!parallel) throw new NotFoundError('Curso no encontrado o sin acceso')
  const period = await prisma.academicPeriod.findFirst({ where: { id: periodId, academicYearId: parallel.academicYearId } })
  if (!period) throw new BadRequestError('El período no pertenece al año lectivo del curso')
  return { parallel, period }
}
async function accessibleBoard(institutionId: string, actor: Actor, id: string) {
  const board = await prisma.courseBoard.findFirst({ where: { id, institutionId }, include: { institution: { select: { settings: true } }, chair: { select: person }, invitation: { select: { id: true, publishedAt: true } } } })
  if (!board) throw new NotFoundError('Junta no encontrada')
  const config = boardConfig(board.institution.settings)
  const ctx = await context(institutionId, actor, board.parallelId, board.academicPeriodId, config.secretaries[board.parallelId])
  const meeting = readMeeting(board.meeting)
  if (board.status === 'OPEN' && !meeting.background) meeting.background = boardConfig(board.institution.settings).convocationBackground
  return { board: { ...board, meeting }, ...ctx }
}
function requireDirector(actor: Actor, board: { chairId: string | null }) {
  if (!isAuthority(actor) && board.chairId !== actor.userId) throw new ForbiddenError('Solo quien dirige la junta o la autoridad puede realizar esta acción')
}
export function matrixHash(matrix: BoardSnapshot): string {
  const { generatedAt: _generatedAt, ...content } = matrix
  return crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex')
}
async function snapshot(institutionId: string, parallelId: string, periodId: string) {
  return prisma.$transaction((db) => buildBoardSnapshot(db, institutionId, parallelId, periodId), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 })
}

export async function boardOptions(institutionId: string, actor: Actor, yearId?: string) {
  const [years, institution] = await Promise.all([
    prisma.academicYear.findMany({ where: { institutionId }, select: { id: true, name: true, isActive: true }, orderBy: { startDate: 'desc' } }),
    prisma.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { settings: true } }),
  ])
  const effectiveYearId = yearId || years.find((y) => y.isActive)?.id || years[0]?.id
  const config = boardConfig(institution.settings)
  const secretaryParallelIds = Object.entries(config.secretaries).filter(([, userId]) => userId === actor.userId).map(([parallelId]) => parallelId)
  const [parallels, periods, chairs, secretaryCandidates] = await Promise.all([
    effectiveYearId ? prisma.parallel.findMany({
      where: { institutionId, academicYearId: effectiveYearId, ...accessWhere(actor, undefined, secretaryParallelIds) },
      select: { id: true, name: true, tutorId: true, level: { select: { name: true } },
        courseAssignments: { where: { institutionId, isActive: true, teacherId: actor.userId }, select: { id: true } },
        courseBoards: { select: { id: true, academicPeriodId: true, status: true, chairId: true, closedAt: true } },
      }, orderBy: [{ level: { sortOrder: 'asc' } }, { name: 'asc' }],
    }) : [],
    effectiveYearId ? prisma.academicPeriod.findMany({ where: { academicYearId: effectiveYearId, academicYear: { institutionId } }, select: { id: true, name: true, isActive: true }, orderBy: { periodNumber: 'asc' } }) : [],
    isAuthority(actor) ? prisma.user.findMany({
      where: chairWhere(institutionId),
      select: person, orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }],
    }) : [],
    isAuthority(actor) ? prisma.user.findMany({
      where: { institutionId, isActive: true, userRoles: { some: { role: { name: 'teacher' } } } },
      select: person, orderBy: [{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }],
    }) : [],
  ])
  return { years, yearId: effectiveYearId, periods,
    parallels: parallels.map((p) => ({ id: p.id, name: `${p.level.name} ${p.name}`, participant: broad(actor) || p.tutorId === actor.userId || p.courseAssignments.length > 0 || config.secretaries[p.id] === actor.userId, secretaryId: config.secretaries[p.id] ?? null, boards: p.courseBoards })),
    chairs: chairs.map((u) => ({ id: u.id, name: name(u.profile) })), secretaryCandidates: secretaryCandidates.map((u) => ({ id: u.id, name: name(u.profile) })), config, canConfigure: isAuthority(actor),
  }
}

export async function createBoard(institutionId: string, actor: Actor, parallelId: string, periodId: string) {
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { settings: true } })
  const config = boardConfig(institution.settings)
  const secretaryId = config.secretaries[parallelId]
  if (!secretaryId) throw new BadRequestError('La autoridad debe asignar secretaría a este paralelo antes de crear la convocatoria')
  if (secretaryId !== actor.userId) throw new ForbiddenError('Solo la secretaría asignada puede crear la convocatoria')
  const { parallel, period } = await context(institutionId, actor, parallelId, periodId, secretaryId)
  const people = new Map<string, { userId: string; name: string; role: string; attendance: 'pending' }>()
  if (parallel.tutor) people.set(parallel.tutor.id, { userId: parallel.tutor.id, name: name(parallel.tutor.profile), role: 'Tutor/a', attendance: 'pending' })
  for (const a of parallel.courseAssignments) {
    const previous = people.get(a.teacherId)
    people.set(a.teacherId, { userId: a.teacherId, name: name(a.teacher.profile), role: `${previous ? `${previous.role}; ` : ''}Docente de ${a.subject.name}`.slice(0, 200), attendance: 'pending' })
  }
  const secretary = secretaryId ? await prisma.user.findFirst({ where: { id: secretaryId, institutionId, isActive: true }, select: person }) : null
  if (secretary) {
    const previous = people.get(secretary.id)
    people.set(secretary.id, { userId: secretary.id, name: name(secretary.profile), role: `${previous ? `${previous.role}; ` : ''}Secretaría`.slice(0, 200), attendance: 'pending' })
  }
  const meeting = readMeeting({ background: config.convocationBackground, number: String(period.periodNumber).padStart(2, '0'), responsible: secretary ? name(secretary.profile) : parallel.tutor ? name(parallel.tutor.profile) : '', agenda: '1. Saludo e instalación de la sesión.\n2. Constatación del quórum.\n3. Lectura y aprobación del acta anterior.', participants: [...people.values()] })
  const board = await prisma.courseBoard.upsert({
    where: { parallelId_academicPeriodId: { parallelId, academicPeriodId: periodId } },
    create: { institutionId, parallelId, academicPeriodId: periodId, createdBy: actor.userId, chairId: parallel.tutorId, meeting: json(meeting) }, update: {},
    select: { id: true },
  })
  return board
}

export async function boardDetail(institutionId: string, actor: Actor, id: string) {
  const { board, parallel } = await accessibleBoard(institutionId, actor, id)
  const [matrix, evidence, institution] = await Promise.all([
    board.status === 'CLOSED' && board.snapshot ? board.snapshot as unknown as BoardSnapshot : snapshot(institutionId, board.parallelId, board.academicPeriodId),
    prisma.courseBoardEvidence.findMany({ where: { boardId: id }, include: { uploader: { select: person } }, orderBy: { createdAt: 'desc' } }),
    prisma.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { settings: true } }),
  ])
  const flow = extractReportsFlow(institution.settings)
  const canDirect = isAuthority(actor) || board.chairId === actor.userId
  const config = boardConfig(institution.settings)
  const secretaryId = config.secretaries[parallel.id] ?? null
  const secretary = secretaryId ? await prisma.user.findFirst({ where: { id: secretaryId, institutionId }, select: person }) : null
  const isSecretary = secretaryId === actor.userId
  return {
    id: board.id, yearId: parallel.academicYearId, status: board.status, revision: board.revision, closedAt: board.closedAt, conclusions: board.conclusions,
    chairId: board.chairId, chairName: board.status === 'CLOSED' && matrix.chairName ? matrix.chairName : board.chair ? name(board.chair.profile) : 'Sin responsable asignado',
    invitation: board.invitation ? { ...board.invitation, needsUpdate: publishedInvitationHash(evidence, board.invitation.id) !== convocationHash(readMeeting(board.meeting)) } : null, meeting: readMeeting(board.meeting), canEditInvitation: board.status === 'OPEN' && isSecretary, canEditMeeting: board.status === 'OPEN' && (canDirect || parallel.tutorId === actor.userId || isSecretary), canPublishInvitation: board.status === 'OPEN' && isSecretary,
    canDirect, canUpload: canDirect || parallel.tutorId === actor.userId || (hasPermission(actor, 'formal_reports', 'write', 'own') && parallel.courseAssignments.some((a) => a.teacherId === actor.userId)), canAssignChair: isAuthority(actor), canReport: board.status === 'OPEN' && hasPermission(actor, 'formal_reports', 'write', 'own'),
    isTutor: parallel.tutorId === actor.userId, isSecretary, secretaryId, secretaryName: secretary ? name(secretary.profile) : null, isAuthority: isAuthority(actor),
    ownAssignmentIds: parallel.courseAssignments.filter((a) => a.teacherId === actor.userId).map((a) => a.id),
    matrix, matrixHash: matrixHash(matrix),
    evidence: evidence.map((f) => ({ id: f.id, kind: f.kind, label: f.label, fileName: f.fileName, mimeType: f.mimeType, isSigned: f.isSigned, createdAt: f.createdAt, authorName: name(f.uploader.profile), document: f.kind === 'REPORT' ? f.snapshot : null })),
    uploadSettings: { maxSizeMb: Math.min(flow.attachments.maxSizeMb, 10), allowedMime: flow.attachments.allowedMime.filter((m) => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(m)) },
  }
}

function publishedInvitationHash(evidence: Array<{ kind: string; snapshot: unknown }>, noticeId: string) {
  const file = evidence.find((f) => f.kind === 'CALL' && (f.snapshot as { announcementId?: string } | null)?.announcementId === noticeId)
  return (file?.snapshot as { invitationHash?: string } | undefined)?.invitationHash
}
type InvitationPublication = { id: string; title: string; body: string; eventAt: Date; location: string; recipientIds: string[]; storedName: string }

// Toda escritura toca la revisión de la carpeta: el cierre detecta informes o adjuntos concurrentes.
async function saveEvidence(institutionId: string, actor: Actor, board: { id: string; revision: number }, file: { label: string; kind: string; buffer: Buffer; mimeType: string; fileName: string; snapshot?: unknown; isSigned?: boolean }, close?: { matrix: BoardSnapshot; conclusions: string }, notice?: InvitationPublication) {
  const extension: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const storedName = `course-boards/${crypto.randomUUID()}.${extension[file.mimeType]}`
  await storage.save(storedName, file.buffer, file.mimeType)
  try {
    if (notice) await storage.save(`announcements/${notice.storedName}`, file.buffer, file.mimeType)
    return await prisma.$transaction(async (tx) => {
      const changed = await tx.courseBoard.updateMany({
        where: { id: board.id, institutionId, revision: board.revision, ...(file.kind === 'UPLOAD' ? {} : { status: 'OPEN' }) },
        data: { revision: { increment: 1 }, ...(close ? { status: 'CLOSED', conclusions: close.conclusions, snapshot: json(close.matrix), closedAt: new Date(), closedBy: actor.userId } : {}) },
      })
      if (changed.count !== 1) throw new ConflictError('La junta cambió o ya fue cerrada. Actualiza la pantalla y vuelve a intentar')
      const evidence = await tx.courseBoardEvidence.create({ data: {
        boardId: board.id, kind: file.kind, label: file.label, storedName,
        fileName: file.fileName, mimeType: file.mimeType, fileSize: file.buffer.length,
        sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
        snapshot: file.snapshot === undefined ? undefined : json(file.snapshot), isSigned: file.isSigned ?? false, uploadedBy: actor.userId,
      }, select: { id: true } })
      if (notice) {
        const fields = { title: notice.title, body: notice.body, eventAt: notice.eventAt, location: notice.location,
          audience: 'selected_users', recipientIds: notice.recipientIds, communicationType: 'convocation', priority: 'important',
          publishedAt: new Date(), attachmentName: 'convocatoria.pdf', attachmentStoredName: notice.storedName,
          attachmentMimeType: file.mimeType, attachmentSize: file.buffer.length }
        await tx.announcement.upsert({ where: { courseBoardId: board.id },
          create: { ...fields, id: notice.id, courseBoardId: board.id, institutionId, createdBy: actor.userId }, update: fields })
        await tx.announcementRead.deleteMany({ where: { announcementId: notice.id } })
        await tx.announcementRsvp.deleteMany({ where: { announcementId: notice.id } })
      }
      await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: notice ? 'course_board.publish_invitation' : close ? 'course_board.close' : 'course_board.evidence', resourceType: 'course_board', resourceId: board.id, newValue: { evidenceId: evidence.id, kind: file.kind, label: file.label } } })
      return evidence
    })
  } catch (err) {
    await Promise.allSettled([storage.remove(storedName), ...(notice ? [storage.remove(`announcements/${notice.storedName}`)] : [])])
    throw err
  }
}

async function invitationContext(institutionId: string, actor: Actor, id: string) {
  const ctx = await accessibleBoard(institutionId, actor, id)
  const { board, parallel } = ctx
  const secretaryId = boardConfig(board.institution.settings).secretaries[parallel.id]
  if (secretaryId !== actor.userId) throw new ForbiddenError('Solo la secretaría asignada puede publicar la convocatoria')
  const meeting = readMeeting(board.meeting)
  assertMeetingReady(meeting, 'CALL')
  const staff = await prisma.user.findMany({ where: { institutionId, isActive: true, userRoles: { some: { role: { name: { in: ['teacher', 'admin', 'rector', 'inspector', 'dece'] } } } } }, select: person })
  const { recipients, unlinked } = resolveConvocationRecipients(meeting.participants, staff.map((u) => ({ id: u.id, name: name(u.profile) })))
  const evidence = await prisma.courseBoardEvidence.findMany({ where: { boardId: id, kind: 'CALL' }, select: { kind: true, snapshot: true }, orderBy: { createdAt: 'desc' } })
  const invitationHash = convocationHash(meeting)
  const alreadyPublished = !!board.invitation && publishedInvitationHash(evidence, board.invitation.id) === invitationHash
  const eventAt = new Date(`${meeting.meetingDate}T${meeting.startTime}:00-05:00`)
  if (!alreadyPublished) {
    if (board.status !== 'OPEN') throw new ConflictError('La junta está cerrada')
    if (eventAt.getTime() <= Date.now()) throw new BadRequestError('Publica la convocatoria antes de la fecha y hora de la reunión')
    if (!recipients.length) throw new BadRequestError('No hay cuentas del personal vinculadas a los convocados. Puedes descargar y entregar el PDF')
  }
  return { ...ctx, meeting, recipients, unlinked, eventAt, alreadyPublished, invitationHash }
}
export async function previewInvitation(institutionId: string, actor: Actor, id: string) {
  const ctx = await invitationContext(institutionId, actor, id)
  const matrix = await snapshot(institutionId, ctx.board.parallelId, ctx.board.academicPeriodId)
  const title = `Convocatoria · ${matrix.parallelName} · ${matrix.periodName}`.slice(0, 200)
  const body = `Se convoca a la junta de curso de ${matrix.parallelName}, jornada ${ctx.meeting.shift}.\nFecha: ${ctx.meeting.meetingDate} · ${ctx.meeting.startTime}\nLugar: ${ctx.meeting.location}\n\n${ctx.meeting.agenda}\n\nResponsable: ${ctx.meeting.responsible}\nConsulta la convocatoria adjunta y confirma tu asistencia.`
  return { revision: ctx.board.revision, title, body, recipients: ctx.recipients, unlinked: ctx.unlinked,
    alreadyPublished: ctx.alreadyPublished, updating: !!ctx.board.invitation, noticeId: ctx.board.invitation?.id ?? null }
}
export async function publishInvitation(institutionId: string, actor: Actor, id: string, revision: number) {
  const ctx = await invitationContext(institutionId, actor, id)
  if (ctx.board.revision !== revision) throw new ConflictError('La convocatoria cambió. Revisa la vista previa antes de publicar')
  if (ctx.alreadyPublished) return { id: ctx.board.invitation!.id }
  const preview = await previewInvitation(institutionId, actor, id)
  if (preview.revision !== revision) throw new ConflictError('La convocatoria cambió. Revisa la vista previa antes de publicar')
  const matrix = await snapshot(institutionId, ctx.board.parallelId, ctx.board.academicPeriodId)
  matrix.meeting = ctx.meeting
  const noticeId = ctx.board.invitation?.id ?? crypto.randomUUID()
  const old = ctx.board.invitation ? await prisma.announcement.findUnique({ where: { id: noticeId }, select: { attachmentStoredName: true } }) : null
  await saveEvidence(institutionId, actor, ctx.board, { kind: 'CALL', label: 'Convocatoria publicada en Avisos',
    buffer: await buildMeetingPdf(matrix, 'CALL'), mimeType: 'application/pdf', fileName: 'convocatoria.pdf',
    snapshot: { meeting: ctx.meeting, announcementId: noticeId, invitationHash: ctx.invitationHash, parallelName: matrix.parallelName } }, undefined,
    { id: noticeId, title: preview.title, body: preview.body, eventAt: ctx.eventAt, location: ctx.meeting.location,
      recipientIds: ctx.recipients.map((u) => u.id), storedName: `${crypto.randomUUID()}.pdf` })
  await Promise.allSettled(ctx.recipients.filter((u) => u.id !== actor.userId).map((u) => sendPushToUser(u.id, {
    title: ctx.board.invitation ? 'Convocatoria actualizada' : 'Convocatoria a junta de curso', body: preview.title, url: `/announcements?notice=${noticeId}`,
  })))
  if (old?.attachmentStoredName) await storage.remove(`announcements/${old.attachmentStoredName}`).catch(() => {})
  return { id: noticeId }
}

export async function emitConsolidated(institutionId: string, actor: Actor, id: string) {
  const { board } = await accessibleBoard(institutionId, actor, id)
  if (board.status === 'CLOSED') {
    const file = await prisma.courseBoardEvidence.findFirst({ where: { boardId: id, kind: 'MINUTES' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (!file) throw new NotFoundError('No se encontró el documento de cierre')
    return file
  }
  const matrix = await snapshot(institutionId, board.parallelId, board.academicPeriodId)
  matrix.meeting = readMeeting(board.meeting)
  return saveEvidence(institutionId, actor, board, { label: 'Consolidado de calificaciones', kind: 'CONSOLIDATED', buffer: await buildBoardPdf(matrix), mimeType: 'application/pdf', fileName: 'consolidado.pdf', snapshot: matrix })
}

export async function emitBoardReport(institutionId: string, actor: Actor, id: string, body: unknown) {
  if (!hasPermission(actor, 'formal_reports', 'write', 'own')) throw new ForbiddenError('No tienes permiso para generar informes')
  const parsed = reportInputSchema.safeParse(body)
  if (!parsed.success) throw new BadRequestError('Completa la situación y revisa la longitud de los campos del informe')
  const data = parsed.data
  const { board, parallel } = await accessibleBoard(institutionId, actor, id)
  if (board.status !== 'OPEN') throw new ConflictError('La junta está cerrada')
  const matrix = await snapshot(institutionId, board.parallelId, board.academicPeriodId)
  const template = matrix.config.reportTypes.find((t) => t.enabled && t.key === data.typeKey)
  if (!template) throw new BadRequestError('Tipo de informe no disponible')
  const assignment = data.courseAssignmentId ? parallel.courseAssignments.find((a) => a.id === data.courseAssignmentId) : null
  const tutor = parallel.tutorId === actor.userId
  const authority = isAuthority(actor)
  if (data.courseAssignmentId && !assignment) throw new BadRequestError('La asignatura no pertenece a este curso')
  if (assignment) {
    if (template.authors === 'tutor' || (!authority && assignment.teacherId !== actor.userId)) throw new ForbiddenError('Solo el docente de la asignatura puede emitir este informe')
  } else if (template.authors === 'teacher' || (!authority && !tutor)) throw new ForbiddenError('Selecciona tu asignatura; el informe general corresponde al tutor')
  const author = await prisma.user.findFirstOrThrow({ where: { id: actor.userId, institutionId }, select: person })
  const document: BoardReportDocument = {
    typeKey: data.typeKey, title: template.label, authorId: actor.userId, authorName: name(author.profile),
    courseAssignmentId: assignment?.id ?? null, subjectName: assignment?.subject.name ?? null,
    situation: data.situation, actions: data.actions, recommendations: data.recommendations,
    labels: { situation: matrix.config.situationLabel, actions: matrix.config.actionsLabel, recommendations: matrix.config.recommendationsLabel },
    institutionName: matrix.institutionName, parallelName: matrix.parallelName, periodName: matrix.periodName, yearName: matrix.yearName, generatedAt: matrix.generatedAt,
  }
  matrix.meeting = readMeeting(board.meeting)
  return saveEvidence(institutionId, actor, board, { label: template.label, kind: 'REPORT', buffer: await buildBoardPdf(matrix, { report: document }), mimeType: 'application/pdf', fileName: 'informe.pdf', snapshot: document })
}

export async function closeBoard(institutionId: string, actor: Actor, id: string, conclusions: string, expectedRevision: number, expectedMatrixHash: string) {
  const { board } = await accessibleBoard(institutionId, actor, id)
  requireDirector(actor, board)
  if (board.status !== 'OPEN') throw new ConflictError('La junta ya está cerrada')
  if (board.revision !== expectedRevision) throw new ConflictError('Hay nuevos documentos o cambios en la junta. Actualiza y revísalos antes de cerrar')
  if (conclusions.trim().length < 5 || conclusions.length > 12000) throw new BadRequestError('Registra los acuerdos y conclusiones de la junta (5 a 12000 caracteres)')
  const matrix = await snapshot(institutionId, board.parallelId, board.academicPeriodId)
  if (matrixHash(matrix) !== expectedMatrixHash) throw new ConflictError('Las notas o el resumen cambiaron. Actualiza y revisa el consolidado antes de cerrar')
  matrix.meeting = readMeeting(board.meeting)
  assertMeetingReady(matrix.meeting, 'MINUTES')
  matrix.chairName = board.chair ? name(board.chair.profile) : matrix.tutorName
  const reports = await prisma.courseBoardEvidence.findMany({ where: { boardId: id, kind: 'REPORT' }, select: { id: true, snapshot: true } })
  const buffer = await buildBoardPdf(matrix, { conclusions: conclusions.trim(), chairName: matrix.chairName, reports: reports.map((r) => r.snapshot as unknown as BoardReportDocument) })
  return saveEvidence(institutionId, actor, board, { label: 'Acta y consolidado de cierre', kind: 'MINUTES', buffer, mimeType: 'application/pdf', fileName: 'acta-junta.pdf', snapshot: { matrix, conclusions: conclusions.trim(), reports } }, { matrix, conclusions: conclusions.trim() })
}

export async function updateMeeting(institutionId: string, actor: Actor, id: string, body: unknown) {
  const parsed = z.object({ revision: z.number().int().nonnegative(), meeting: meetingDetailsSchema }).safeParse(body)
  if (!parsed.success) throw new BadRequestError('Revisa fechas, horas, nombres y funciones de los participantes')
  const { board, parallel } = await accessibleBoard(institutionId, actor, id)
  const secretaryId = boardConfig(board.institution.settings).secretaries[parallel.id]
  if (!isAuthority(actor) && board.chairId !== actor.userId && parallel.tutorId !== actor.userId && secretaryId !== actor.userId) throw new ForbiddenError('Solo secretaría, el tutor, quien dirige o la autoridad puede preparar la convocatoria')
  const current = readMeeting(board.meeting)
  const meeting = secretaryId === actor.userId ? parsed.data.meeting : {
    ...current,
    development: parsed.data.meeting.development,
    actualEndTime: parsed.data.meeting.actualEndTime,
    participants: current.participants.map((participant, index) => ({ ...participant, attendance: parsed.data.meeting.participants[index]?.attendance ?? participant.attendance })),
  }
  await prisma.$transaction(async (tx) => {
    const updated = await tx.courseBoard.updateMany({ where: { id, institutionId, status: 'OPEN', revision: parsed.data.revision }, data: { meeting: json(meeting), revision: { increment: 1 } } })
    if (!updated.count) throw new ConflictError('La junta cambió o está cerrada. Actualiza antes de guardar')
    await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: 'course_board.meeting_update', resourceType: 'course_board', resourceId: id } })
  })
  return { revision: parsed.data.revision + 1, meeting }
}

export async function emitMeetingDocument(institutionId: string, actor: Actor, id: string, kind: 'CALL' | 'ATTENDANCE' | 'MINUTES') {
  const { board, parallel } = await accessibleBoard(institutionId, actor, id)
  const secretaryId = boardConfig(board.institution.settings).secretaries[parallel.id]
  if (kind === 'CALL' && secretaryId !== actor.userId) throw new ForbiddenError('Solo la secretaría asignada puede emitir la convocatoria')
  if (board.status === 'CLOSED' || kind === 'MINUTES') {
    const file = await prisma.courseBoardEvidence.findFirst({ where: { boardId: id, kind }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (!file) throw new BadRequestError(kind === 'MINUTES' ? 'El acta se genera al cerrar la junta' : 'Este documento no se emitió antes del cierre')
    return file
  }
  const matrix = await snapshot(institutionId, board.parallelId, board.academicPeriodId)
  matrix.meeting = readMeeting(board.meeting)
  assertMeetingReady(matrix.meeting, kind)
  const buffer = await buildMeetingPdf(matrix, kind)
  return saveEvidence(institutionId, actor, board, { label: MEETING_TITLES[kind], kind, buffer, mimeType: 'application/pdf', fileName: kind === 'CALL' ? 'convocatoria.pdf' : 'asistencia.pdf', snapshot: { meeting: matrix.meeting, institutionName: matrix.institutionName, parallelName: matrix.parallelName, yearName: matrix.yearName, logoUrl: matrix.logoUrl } })
}

export async function reopenBoard(institutionId: string, actor: Actor, id: string) {
  const { board } = await accessibleBoard(institutionId, actor, id)
  requireDirector(actor, board)
  if (board.status !== 'CLOSED') throw new ConflictError('La junta ya está abierta')
  await prisma.$transaction(async (tx) => {
    const updated = await tx.courseBoard.updateMany({ where: { id, institutionId, status: 'CLOSED', revision: board.revision }, data: { status: 'OPEN', revision: { increment: 1 }, snapshot: Prisma.DbNull, closedAt: null, closedBy: null } })
    if (!updated.count) throw new ConflictError('La junta cambió. Actualiza la pantalla')
    await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: 'course_board.reopen', resourceType: 'course_board', resourceId: id } })
  })
}

export async function assignBoardChair(institutionId: string, actor: Actor, id: string, chairId: string) {
  if (!isAuthority(actor)) throw new ForbiddenError()
  const { board } = await accessibleBoard(institutionId, actor, id)
  const chair = await prisma.user.findFirst({ where: { id: chairId, ...chairWhere(institutionId) }, select: { id: true } })
  if (!chair) throw new BadRequestError('Selecciona una persona activa de la institución')
  await prisma.$transaction(async (tx) => {
    const updated = await tx.courseBoard.updateMany({ where: { id, institutionId, status: 'OPEN', revision: board.revision }, data: { chairId, revision: { increment: 1 } } })
    if (!updated.count) throw new ConflictError('La junta cambió o está cerrada')
    await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: 'course_board.assign_chair', resourceType: 'course_board', resourceId: id, oldValue: { chairId: board.chairId }, newValue: { chairId } } })
  })
}

export async function uploadBoardEvidence(institutionId: string, actor: Actor, id: string, file: { filename: string; mimetype: string; buffer: Buffer }, signed: boolean) {
  const { board, parallel } = await accessibleBoard(institutionId, actor, id)
  if (!isAuthority(actor) && board.chairId !== actor.userId && parallel.tutorId !== actor.userId && !(hasPermission(actor, 'formal_reports', 'write', 'own') && parallel.courseAssignments.some((a) => a.teacherId === actor.userId))) throw new ForbiddenError()
  const institution = await prisma.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { settings: true } })
  const flow = extractReportsFlow(institution.settings)
  const headers: Record<string, boolean> = {
    'application/pdf': file.buffer.subarray(0, 1024).includes(Buffer.from('%PDF-')),
    'image/jpeg': file.buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255])),
    'image/png': file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/webp': file.buffer.subarray(0, 4).toString() === 'RIFF' && file.buffer.subarray(8, 12).toString() === 'WEBP',
  }
  if (!headers[file.mimetype] || !flow.attachments.allowedMime.includes(file.mimetype)) throw new BadRequestError('Adjunta un PDF o una imagen escaneada válida')
  if (!file.buffer.length || file.buffer.length > Math.min(flow.attachments.maxSizeMb, 10) * 1024 * 1024) throw new BadRequestError('El archivo supera el tamaño permitido')
  const fileName = path.basename(file.filename.replace(/\\/g, '/')).slice(0, 255) || 'evidencia'
  return saveEvidence(institutionId, actor, board, { label: fileName.slice(0, 200), kind: 'UPLOAD', buffer: file.buffer, mimeType: file.mimetype, fileName, isSigned: signed })
}

export async function boardFile(institutionId: string, actor: Actor, id: string) {
  const file = await prisma.courseBoardEvidence.findFirst({ where: { id, board: { institutionId } } })
  if (!file) throw new NotFoundError('Documento no encontrado')
  await accessibleBoard(institutionId, actor, file.boardId)
  return file
}

export async function updateBoardConfig(institutionId: string, actor: Actor, body: unknown): Promise<BoardConfig> {
  if (!isAuthority(actor)) throw new ForbiddenError()
  const parsed = boardConfigSchema.safeParse(body)
  if (!parsed.success) throw new BadRequestError('Revisa los títulos, campos y tipos de informe; las claves deben ser únicas')
  const secretaryEntries = Object.entries(parsed.data.secretaries)
  if (secretaryEntries.length) {
    const [parallelCount, teacherCount] = await Promise.all([
      prisma.parallel.count({ where: { institutionId, id: { in: secretaryEntries.map(([parallelId]) => parallelId) } } }),
      prisma.user.count({ where: { institutionId, isActive: true, id: { in: secretaryEntries.map(([, userId]) => userId) }, userRoles: { some: { role: { name: 'teacher' } } } } }),
    ])
    if (parallelCount !== secretaryEntries.length || teacherCount !== new Set(secretaryEntries.map(([, userId]) => userId)).size) throw new BadRequestError('Selecciona paralelos y docentes activos de esta institución')
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE institutions SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{courseBoards}', ${JSON.stringify(parsed.data)}::jsonb, true) WHERE id = ${institutionId}`
    await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: 'course_board.config', resourceType: 'institution', resourceId: institutionId, newValue: json(parsed.data) } })
  })
  return parsed.data
}
