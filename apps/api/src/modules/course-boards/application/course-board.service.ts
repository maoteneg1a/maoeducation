import crypto from 'node:crypto'
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
function accessWhere(actor: Actor, periodId?: string): Prisma.ParallelWhereInput {
  return broad(actor) ? {} : { OR: [
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
async function context(institutionId: string, actor: Actor, parallelId: string, periodId: string) {
  const parallel = await prisma.parallel.findFirst({
    where: { id: parallelId, institutionId, ...accessWhere(actor, periodId) },
    include: { academicYear: true, courseAssignments: { where: { institutionId, isActive: true }, select: { id: true, teacherId: true, subject: { select: { name: true } } } } },
  })
  if (!parallel) throw new NotFoundError('Curso no encontrado o sin acceso')
  const period = await prisma.academicPeriod.findFirst({ where: { id: periodId, academicYearId: parallel.academicYearId } })
  if (!period) throw new BadRequestError('El período no pertenece al año lectivo del curso')
  return { parallel, period }
}
async function accessibleBoard(institutionId: string, actor: Actor, id: string) {
  const board = await prisma.courseBoard.findFirst({ where: { id, institutionId }, include: { chair: { select: person } } })
  if (!board) throw new NotFoundError('Junta no encontrada')
  const ctx = await context(institutionId, actor, board.parallelId, board.academicPeriodId)
  return { board, ...ctx }
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
  const [parallels, periods, chairs] = await Promise.all([
    effectiveYearId ? prisma.parallel.findMany({
      where: { institutionId, academicYearId: effectiveYearId, ...accessWhere(actor) },
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
  ])
  return { years, yearId: effectiveYearId, periods,
    parallels: parallels.map((p) => ({ id: p.id, name: `${p.level.name} ${p.name}`, participant: broad(actor) || p.tutorId === actor.userId || p.courseAssignments.length > 0, boards: p.courseBoards })),
    chairs: chairs.map((u) => ({ id: u.id, name: name(u.profile) })), config: boardConfig(institution.settings), canConfigure: isAuthority(actor),
  }
}

export async function createBoard(institutionId: string, actor: Actor, parallelId: string, periodId: string) {
  const { parallel } = await context(institutionId, actor, parallelId, periodId)
  const board = await prisma.courseBoard.upsert({
    where: { parallelId_academicPeriodId: { parallelId, academicPeriodId: periodId } },
    create: { institutionId, parallelId, academicPeriodId: periodId, createdBy: actor.userId, chairId: parallel.tutorId }, update: {},
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
  return {
    id: board.id, yearId: parallel.academicYearId, status: board.status, revision: board.revision, closedAt: board.closedAt, conclusions: board.conclusions,
    chairId: board.chairId, chairName: board.status === 'CLOSED' && matrix.chairName ? matrix.chairName : board.chair ? name(board.chair.profile) : 'Sin responsable asignado',
    canDirect, canUpload: canDirect || parallel.tutorId === actor.userId || (hasPermission(actor, 'formal_reports', 'write', 'own') && parallel.courseAssignments.some((a) => a.teacherId === actor.userId)), canAssignChair: isAuthority(actor), canReport: board.status === 'OPEN' && hasPermission(actor, 'formal_reports', 'write', 'own'),
    isTutor: parallel.tutorId === actor.userId, isAuthority: isAuthority(actor),
    ownAssignmentIds: parallel.courseAssignments.filter((a) => a.teacherId === actor.userId).map((a) => a.id),
    matrix, matrixHash: matrixHash(matrix),
    evidence: evidence.map((f) => ({ id: f.id, kind: f.kind, label: f.label, fileName: f.fileName, mimeType: f.mimeType, isSigned: f.isSigned, createdAt: f.createdAt, authorName: name(f.uploader.profile), document: f.kind === 'REPORT' ? f.snapshot : null })),
    uploadSettings: { maxSizeMb: Math.min(flow.attachments.maxSizeMb, 10), allowedMime: flow.attachments.allowedMime.filter((m) => ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(m)) },
  }
}

// Toda escritura toca la revisión de la carpeta: el cierre detecta informes o adjuntos concurrentes.
async function saveEvidence(institutionId: string, actor: Actor, board: { id: string; revision: number }, file: { label: string; kind: string; buffer: Buffer; mimeType: string; fileName: string; snapshot?: unknown; isSigned?: boolean }, close?: { matrix: BoardSnapshot; conclusions: string }) {
  const extension: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
  const storedName = `course-boards/${crypto.randomUUID()}.${extension[file.mimeType]}`
  await storage.save(storedName, file.buffer, file.mimeType)
  try {
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
      await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: close ? 'course_board.close' : 'course_board.evidence', resourceType: 'course_board', resourceId: board.id, newValue: { evidenceId: evidence.id, kind: file.kind, label: file.label } } })
      return evidence
    })
  } catch (err) {
    await storage.remove(storedName)
    throw err
  }
}

export async function emitConsolidated(institutionId: string, actor: Actor, id: string) {
  const { board } = await accessibleBoard(institutionId, actor, id)
  if (board.status === 'CLOSED') {
    const file = await prisma.courseBoardEvidence.findFirst({ where: { boardId: id, kind: 'MINUTES' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (!file) throw new NotFoundError('No se encontró el documento de cierre')
    return file
  }
  const matrix = await snapshot(institutionId, board.parallelId, board.academicPeriodId)
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
  matrix.chairName = board.chair ? name(board.chair.profile) : matrix.tutorName
  const reports = await prisma.courseBoardEvidence.findMany({ where: { boardId: id, kind: 'REPORT' }, select: { id: true, snapshot: true } })
  const buffer = await buildBoardPdf(matrix, { conclusions: conclusions.trim(), chairName: matrix.chairName, reports: reports.map((r) => r.snapshot as unknown as BoardReportDocument) })
  return saveEvidence(institutionId, actor, board, { label: 'Acta y consolidado de cierre', kind: 'MINUTES', buffer, mimeType: 'application/pdf', fileName: 'acta-junta.pdf', snapshot: { matrix, conclusions: conclusions.trim(), reports } }, { matrix, conclusions: conclusions.trim() })
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
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE institutions SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{courseBoards}', ${JSON.stringify(parsed.data)}::jsonb, true) WHERE id = ${institutionId}`
    await tx.auditLog.create({ data: { institutionId, userId: actor.userId, action: 'course_board.config', resourceType: 'institution', resourceId: institutionId, newValue: json(parsed.data) } })
  })
  return parsed.data
}
