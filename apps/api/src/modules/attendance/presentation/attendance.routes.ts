import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { PrismaAttendanceRepository } from '../infrastructure/repositories/prisma-attendance.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import {
  isPrivilegedStaff,
  assertStudentFichaAccess,
  assertCourseAssignmentAccess,
  assertParallelInScope,
  resolveViewableStudentId,
} from '../../../shared/infrastructure/services/teacher-scope.service'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { ForbiddenError, BadRequestError } from '../../../shared/domain/errors/app.errors'
import type { BulkAttendanceDto, CreateJustificationDto } from '../application/dtos/attendance.dto'
import { notifyGuardiansOfStudent } from '../../../shared/infrastructure/services/push.service'

const repo = new PrismaAttendanceRepository()

/** Solo el tutor del paralelo (o staff privilegiado) puede tomar la asistencia diaria. */
async function assertCanTakeDailyAttendance(
  institutionId: string,
  userId: string,
  roles: string[],
  parallelId: string,
): Promise<void> {
  if (isPrivilegedStaff(roles)) return
  const parallel = await prisma.parallel.findFirst({
    where: { id: parallelId, institutionId },
    select: { tutorId: true },
  })
  if (parallel?.tutorId === userId) return
  throw new ForbiddenError()
}

const requireAttendanceWrite = requirePermission('attendance', 'write')

/** Staff privilegiado (inspección, DECE, admin) o quien tenga attendance:write. */
async function staffOrAttendanceWriter(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (isPrivilegedStaff(req.user.roles)) return
  await requireAttendanceWrite(req, reply)
}

export default async function attendanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /attendance?courseAssignmentId=&date=  (materia)  ó  ?parallelId=&date=  (diaria)
  app.get<{ Querystring: { courseAssignmentId?: string; parallelId?: string; date: string } }>(
    '/attendance',
    { preHandler: [requirePermission('attendance', 'read')] },
    async (req, reply) => {
      const { courseAssignmentId, parallelId, date } = req.query
      if (parallelId) {
        await assertParallelInScope(req, parallelId)
        const result = await repo.getByParallelDate(req.user.institutionId, parallelId, date)
        return reply.status(200).send(result)
      }
      if (!courseAssignmentId) throw new BadRequestError('Se requiere courseAssignmentId o parallelId')
      await assertCourseAssignmentAccess(req, courseAssignmentId, 'read')
      const result = await repo.getByDate(req.user.institutionId, courseAssignmentId, date)
      return reply.status(200).send(result)
    },
  )

  // POST /attendance/bulk  (materia o diaria según parallelId)
  app.post<{ Body: BulkAttendanceDto }>(
    '/attendance/bulk',
    { preHandler: [staffOrAttendanceWriter] },
    async (req, reply) => {
      if (req.body.parallelId) {
        await assertCanTakeDailyAttendance(
          req.user.institutionId,
          req.user.sub,
          req.user.roles,
          req.body.parallelId,
        )
        const result = await repo.bulkUpsertDaily(req.user.institutionId, req.body, req.user.sub)
        // Notificar solo a representantes de alumnos que PASARON a ausente/tarde
        // en este guardado (re-guardar no vuelve a notificar). Fire-and-forget.
        void sendAttendanceNotifications(result.newlyFlagged, req.body.date)
        return reply.status(200).send(result)
      }
      if (!req.body.courseAssignmentId) throw new BadRequestError('Se requiere courseAssignmentId o parallelId')
      await assertCourseAssignmentAccess(req, req.body.courseAssignmentId, 'write')
      const result = await repo.bulkUpsert(req.user.institutionId, req.body, req.user.sub)
      void sendAttendanceNotifications(result.newlyFlagged, req.body.date)
      return reply.status(200).send(result)
    },
  )

  // GET /attendance/student/:studentId/summary?courseAssignmentId=
  app.get<{
    Params: { studentId: string }
    Querystring: { courseAssignmentId?: string }
  }>(
    '/attendance/student/:studentId/summary',
    async (req, reply) => {
      const { courseAssignmentId } = req.query
      const studentId = await resolveViewableStudentId(req, req.params.studentId)
      const result = await repo.getStudentSummary(
        req.user.institutionId,
        studentId,
        courseAssignmentId,
      )
      return reply.status(200).send(result)
    },
  )

  // GET /attendance/student/:studentId/absences
  app.get<{ Params: { studentId: string } }>(
    '/attendance/student/:studentId/absences',
    async (req, reply) => {
      const studentId = await resolveViewableStudentId(req, req.params.studentId)
      const result = await repo.getStudentAbsences(req.user.institutionId, studentId)
      return reply.status(200).send(result)
    },
  )

  // POST /attendance/justifications
  app.post<{ Body: CreateJustificationDto }>(
    '/attendance/justifications',
    {
      // Inspección/DECE justifican aunque no tomen asistencia; el docente con permiso de escritura también.
      preHandler: [staffOrAttendanceWriter],
    },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.body.studentId)
      const result = await repo.createJustification(
        req.user.institutionId,
        req.body,
        req.user.sub,
      )
      return reply.status(201).send(result)
    },
  )

  // ─── Solicitudes de justificación desde la familia ──────────────────────────

  /** El representante (o el propio estudiante) solicita justificar faltas/atrasos. */
  app.post<{ Body: { studentId: string; attendanceRecordIds: string[]; reason: string } }>(
    '/attendance/justification-requests',
    {
      schema: {
        body: {
          type: 'object',
          required: ['studentId', 'attendanceRecordIds', 'reason'],
          properties: {
            studentId: { type: 'string' },
            attendanceRecordIds: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 60 },
            reason: { type: 'string', minLength: 3, maxLength: 2000 },
          },
        },
      },
    },
    async (req, reply) => {
      const { roles, sub, institutionId } = req.user
      if (!roles.includes('guardian') && !roles.includes('student')) throw new ForbiddenError()
      const studentId = await resolveViewableStudentId(req, req.body.studentId)
      const records = await prisma.attendanceRecord.findMany({
        where: { id: { in: req.body.attendanceRecordIds }, studentId, institutionId, status: { in: ['absent', 'late'] } },
        select: { id: true },
      })
      if (records.length !== req.body.attendanceRecordIds.length) {
        throw new BadRequestError('Algunos registros no existen, ya están justificados o no pertenecen al estudiante')
      }
      const pendingDup = await prisma.justificationAttendance.findFirst({
        where: { attendanceRecordId: { in: records.map((r) => r.id) }, justification: { status: 'pending' } },
        select: { attendanceRecordId: true },
      })
      if (pendingDup) throw new BadRequestError('Ya hay una solicitud pendiente para alguna de esas fechas')
      const created = await prisma.absenceJustification.create({
        data: {
          institutionId,
          studentId,
          reason: req.body.reason.trim(),
          justifiedBy: sub,
          status: 'pending',
          attendanceRecords: { create: records.map((r) => ({ attendanceRecordId: r.id })) },
        },
        select: { id: true, status: true },
      })
      return reply.status(201).send(created)
    },
  )

  /** Bandeja del personal: solicitudes de las familias por revisar. */
  app.get<{ Querystring: { status?: string } }>(
    '/attendance/justification-requests',
    { preHandler: [staffOrAttendanceWriter] },
    async (req) => {
      const { institutionId, roles, sub } = req.user
      const status = ['pending', 'approved', 'rejected'].includes(req.query.status ?? '') ? req.query.status! : 'pending'
      // Docentes (no staff privilegiado) solo ven estudiantes de sus paralelos.
      const studentFilter = isPrivilegedStaff(roles)
        ? {}
        : { student: { studentEnrollments: { some: { status: 'active', parallel: { OR: [{ tutorId: sub }, { courseAssignments: { some: { teacherId: sub } } }] } } } } }
      const rows = await prisma.absenceJustification.findMany({
        where: { institutionId, status, justifier: { userRoles: { some: { role: { name: { in: ['guardian', 'student'] } } } } }, ...studentFilter },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
          justifier: { select: { profile: { select: { firstName: true, lastName: true } }, email: true } },
          attendanceRecords: {
            include: {
              attendanceRecord: {
                select: { id: true, date: true, status: true, courseAssignment: { select: { subject: { select: { name: true } } } } },
              },
            },
          },
        },
      })
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        reason: r.reason,
        createdAt: r.createdAt,
        reviewNotes: r.reviewNotes,
        student: { id: r.student.id, name: r.student.profile ? `${r.student.profile.lastName} ${r.student.profile.firstName}` : '' },
        requestedBy: r.justifier.profile ? `${r.justifier.profile.firstName} ${r.justifier.profile.lastName}` : r.justifier.email,
        records: r.attendanceRecords.map((a) => ({
          id: a.attendanceRecord.id,
          date: a.attendanceRecord.date.toISOString().slice(0, 10),
          status: a.attendanceRecord.status,
          subject: a.attendanceRecord.courseAssignment?.subject.name ?? null,
        })),
      }))
    },
  )

  /** Aprobar (marca las faltas como justificadas) o rechazar una solicitud. */
  app.patch<{ Params: { id: string }; Body: { approve: boolean; notes?: string } }>(
    '/attendance/justification-requests/:id',
    {
      preHandler: [staffOrAttendanceWriter],
      schema: {
        body: {
          type: 'object',
          required: ['approve'],
          properties: { approve: { type: 'boolean' }, notes: { type: 'string', maxLength: 1000 } },
        },
      },
    },
    async (req) => {
      const { institutionId, sub } = req.user
      const j = await prisma.absenceJustification.findFirst({
        where: { id: req.params.id, institutionId, status: 'pending' },
        include: { attendanceRecords: { select: { attendanceRecordId: true } } },
      })
      if (!j) throw new BadRequestError('La solicitud no existe o ya fue revisada')
      await assertStudentFichaAccess(req, j.studentId)
      await prisma.$transaction([
        prisma.absenceJustification.update({
          where: { id: j.id },
          data: { status: req.body.approve ? 'approved' : 'rejected', reviewedBy: sub, reviewedAt: new Date(), reviewNotes: req.body.notes?.trim() || null },
        }),
        ...(req.body.approve
          ? [prisma.attendanceRecord.updateMany({ where: { id: { in: j.attendanceRecords.map((a) => a.attendanceRecordId) }, institutionId }, data: { status: 'excused' } })]
          : []),
      ])
      void notifyGuardiansOfStudent(j.studentId, {
        title: req.body.approve ? 'Justificación aprobada' : 'Justificación no aprobada',
        body: req.body.approve
          ? 'Tu representado: la solicitud de justificación fue aprobada.'
          : `Tu representado: la solicitud de justificación no fue aprobada.${req.body.notes ? ` ${req.body.notes}` : ''}`,
        url: '/dashboard',
      })
      return { ok: true }
    },
  )
}

async function sendAttendanceNotifications(
  records: Array<{ studentId: string; status: string }>,
  date: string,
) {
  const absent = records.filter((r) => r.status === 'absent' || r.status === 'late')
  const label: Record<string, string> = { absent: 'faltó', late: 'llegó tarde' }
  await Promise.allSettled(
    absent.map((r) =>
      // notifyGuardiansOfStudent reemplaza "Tu representado" por el nombre real del alumno
      notifyGuardiansOfStudent(r.studentId, {
        title: 'Asistencia — Auleka',
        body: `Tu representado ${label[r.status] ?? r.status} el ${date}`,
        url: '/attendance',
      }),
    ),
  )
}
