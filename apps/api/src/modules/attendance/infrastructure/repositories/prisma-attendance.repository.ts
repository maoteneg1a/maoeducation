import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import type { BulkAttendanceDto, CreateJustificationDto } from '../../application/dtos/attendance.dto'
import { STUDENT_ENROLLMENT_ORDER } from '../../../../shared/infrastructure/services/enrollment-query'

const VALID_STATUSES = new Set(['present', 'absent', 'late', 'excused'])

/** Estudiantes con nuevo estado ausente/tarde (para notificar solo cambios reales). */
export type AttendanceSaveResult = { saved: number; newlyFlagged: Array<{ studentId: string; status: string }> }

export class PrismaAttendanceRepository {
  /** Registro complementario por hora: nunca escribe attendance_records ni notifica faltas diarias. */
  async getClassHour(institutionId: string, courseAssignmentId: string, date: string, period: number) {
    validateClassPeriod(period)
    const parsedDate = parseAttendanceDate(date)
    const ca = await this.dailyAssignment(institutionId, courseAssignmentId)
    const [daily, records] = await Promise.all([
      this.getByParallelDate(institutionId, ca.parallelId, date),
      prisma.classAttendanceRecord.findMany({ where: { institutionId, courseAssignmentId, date: parsedDate, period } }),
    ])
    return daily.map((entry) => ({
      student: entry.student,
      record: records.find((r) => r.studentId === entry.student.id) ?? null,
      dailyRecord: entry.record,
    }))
  }

  private async dailyAssignment(institutionId: string, id: string) {
    const ca = await prisma.courseAssignment.findFirst({
      where: { id, institutionId, isActive: true, parallel: { isActive: true } },
      include: { parallel: { include: { level: true } } },
    })
    if (!ca) throw new NotFoundError('Asignación no encontrada o inactiva')
    if (ca.parallel.level.attendanceMode !== 'daily') throw new BadRequestError('El complemento por hora requiere asistencia diaria')
    return ca
  }

  async classHistory(institutionId: string, courseAssignmentId: string) {
    await this.dailyAssignment(institutionId, courseAssignmentId)
    return prisma.classAttendanceRecord.groupBy({
      by: ['date', 'period'], where: { institutionId, courseAssignmentId },
      _count: { _all: true }, orderBy: [{ date: 'desc' }, { period: 'asc' }], take: 100,
    })
  }

  async saveClassHour(institutionId: string, dto: BulkAttendanceDto & { period: number }, userId: string) {
    validateClassPeriod(dto.period)
    if (!dto.courseAssignmentId || dto.parallelId) throw new BadRequestError('Se requiere una asignación de materia')
    const ca = await this.dailyAssignment(institutionId, dto.courseAssignmentId)
    const date = parseAttendanceDate(dto.date)
    await assertStudentsEnrolled(institutionId, ca.parallelId, ca.academicYearId, dto.records)
    if (new Set(dto.records.map((r) => r.studentId)).size !== dto.records.length) throw new BadRequestError('Estudiantes repetidos')
    await prisma.$transaction(async (tx) => {
      // Serializa correcciones de la misma hora para conservar el antes/después real.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${ca.id}:${dto.date}:${dto.period}`}))`
      const previous = await tx.classAttendanceRecord.findMany({ where: { institutionId, courseAssignmentId: ca.id, date, period: dto.period } })
      for (const r of dto.records) {
        await tx.classAttendanceRecord.upsert({
          where: { courseAssignmentId_studentId_date_period: { courseAssignmentId: ca.id, studentId: r.studentId, date, period: dto.period } },
          create: { institutionId, courseAssignmentId: ca.id, studentId: r.studentId, date, period: dto.period, status: r.status, notes: r.notes?.trim() || null, recordedBy: userId },
          update: { status: r.status, notes: r.notes?.trim() || null, recordedBy: userId },
        })
      }
      await tx.auditLog.create({ data: {
        institutionId, userId, action: 'attendance.class_hour.save', resourceType: 'class_attendance', resourceId: ca.id,
        oldValue: previous.map((r) => ({ studentId: r.studentId, status: r.status, notes: r.notes })),
        newValue: { date: dto.date, period: dto.period, records: dto.records.map((r) => ({ studentId: r.studentId, status: r.status, notes: r.notes ?? null })) },
      } })
    }, { timeout: 30_000 })
    return { saved: dto.records.length }
  }

  async getByDate(institutionId: string, courseAssignmentId: string, date: string) {
    const courseAssignment = await prisma.courseAssignment.findFirst({
      where: { id: courseAssignmentId, institutionId },
      include: {
        parallel: { select: { academicYearId: true } },
      },
    })
    if (!courseAssignment) throw new NotFoundError('Asignación de curso no encontrada')

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        parallelId: courseAssignment.parallelId,
        academicYearId: courseAssignment.academicYearId,
        status: 'active',
      },
      orderBy: STUDENT_ENROLLMENT_ORDER,
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })

    const records = await prisma.attendanceRecord.findMany({
      where: {
        courseAssignmentId,
        date: new Date(date),
        institutionId,
      },
    })

    const gradeMap = new Map(records.map((r) => [r.studentId, r]))

    return enrollments.map((e) => ({
      student: e.student,
      record: gradeMap.get(e.studentId) ?? null,
    }))
  }

  async bulkUpsert(
    institutionId: string,
    dto: BulkAttendanceDto,
    recordedById: string,
  ): Promise<AttendanceSaveResult> {
    if (!dto.courseAssignmentId) throw new BadRequestError('courseAssignmentId requerido')
    const parsedDate = parseAttendanceDate(dto.date)
    const courseAssignmentId = dto.courseAssignmentId

    const courseAssignment = await prisma.courseAssignment.findFirst({
      where: { id: courseAssignmentId, institutionId },
      select: { parallelId: true, academicYearId: true },
    })
    if (!courseAssignment) throw new NotFoundError('Asignación de curso no encontrada')
    await assertStudentsEnrolled(institutionId, courseAssignment.parallelId, courseAssignment.academicYearId, dto.records)

    const previous = await prisma.attendanceRecord.findMany({
      where: { institutionId, courseAssignmentId, date: parsedDate, studentId: { in: dto.records.map((r) => r.studentId) } },
      select: { studentId: true, status: true },
    })

    await prisma.$transaction(
      dto.records.map((r) =>
        prisma.attendanceRecord.upsert({
          where: {
            courseAssignmentId_studentId_date: {
              courseAssignmentId,
              studentId: r.studentId,
              date: parsedDate,
            },
          },
          create: {
            institutionId,
            courseAssignmentId,
            studentId: r.studentId,
            date: parsedDate,
            status: r.status,
            notes: r.notes,
            recordedBy: recordedById,
          },
          update: {
            status: r.status,
            notes: r.notes,
            recordedBy: recordedById,
          },
        }),
      ),
    )

    return { saved: dto.records.length, newlyFlagged: newlyFlagged(previous, dto.records) }
  }

  /** Asistencia diaria por paralelo (un registro por estudiante/día). */
  async getByParallelDate(institutionId: string, parallelId: string, date: string) {
    const parallel = await prisma.parallel.findFirst({
      where: { id: parallelId, institutionId },
      select: { id: true, academicYearId: true, tutorId: true },
    })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId: parallel.academicYearId, status: 'active' },
      orderBy: STUDENT_ENROLLMENT_ORDER,
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })

    const records = await prisma.attendanceRecord.findMany({
      where: { parallelId, date: new Date(date), institutionId },
    })
    const recordMap = new Map(records.map((r) => [r.studentId, r]))

    return enrollments.map((e) => ({
      student: e.student,
      record: recordMap.get(e.studentId) ?? null,
    }))
  }

  async bulkUpsertDaily(
    institutionId: string,
    dto: BulkAttendanceDto,
    recordedById: string,
  ): Promise<AttendanceSaveResult> {
    if (!dto.parallelId) throw new BadRequestError('parallelId requerido')
    const parsedDate = parseAttendanceDate(dto.date)
    const parallelId = dto.parallelId

    const parallel = await prisma.parallel.findFirst({
      where: { id: parallelId, institutionId },
      select: { academicYearId: true },
    })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')
    await assertStudentsEnrolled(institutionId, parallelId, parallel.academicYearId, dto.records)

    const previous = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${parallelId}:${dto.date}`}))`
      const before = await tx.attendanceRecord.findMany({
        where: { institutionId, parallelId, date: parsedDate, studentId: { in: dto.records.map((r) => r.studentId) } },
        select: { studentId: true, status: true, notes: true },
      })
      for (const r of dto.records) {
        await tx.attendanceRecord.upsert({
          where: { parallelId_studentId_date: { parallelId, studentId: r.studentId, date: parsedDate } },
          create: { institutionId, parallelId, studentId: r.studentId, date: parsedDate, status: r.status, notes: r.notes?.trim() || null, recordedBy: recordedById },
          update: { status: r.status, notes: r.notes?.trim() || null, recordedBy: recordedById },
        })
      }
      await tx.auditLog.create({ data: {
        institutionId, userId: recordedById, action: 'attendance.daily.save', resourceType: 'daily_attendance', resourceId: parallelId,
        oldValue: before,
        newValue: { date: dto.date, records: dto.records.map((r) => ({ studentId: r.studentId, status: r.status, notes: r.notes ?? null })) },
      } })
      return before
    }, { timeout: 30_000 })

    return { saved: dto.records.length, newlyFlagged: newlyFlagged(previous, dto.records) }
  }

  async getStudentSummary(institutionId: string, studentId: string, courseAssignmentId?: string) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        institutionId,
        studentId,
        ...(courseAssignmentId && { courseAssignmentId }),
      },
      include: {
        courseAssignment: {
          include: {
            subject: { select: { id: true, name: true } },
          },
        },
      },
    })

    // Group by courseAssignmentId
    const grouped = new Map<
      string,
      {
        courseAssignment: { id: string; subject: { id: string; name: string } }
        total: number
        present: number
        absent: number
        late: number
        excused: number
      }
    >()

    for (const record of records) {
      // El resumen por materia ignora la asistencia diaria (sin courseAssignment).
      if (!record.courseAssignmentId || !record.courseAssignment) continue
      const key = record.courseAssignmentId
      if (!grouped.has(key)) {
        grouped.set(key, {
          courseAssignment: {
            id: record.courseAssignment.id,
            subject: record.courseAssignment.subject,
          },
          total: 0,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        })
      }

      const entry = grouped.get(key)!
      entry.total += 1

      if (record.status === 'present') entry.present += 1
      else if (record.status === 'absent') entry.absent += 1
      else if (record.status === 'late') entry.late += 1
      else if (record.status === 'excused') entry.excused += 1
    }

    return Array.from(grouped.values())
  }

  async getStudentAbsences(institutionId: string, studentId: string) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { institutionId, studentId },
      include: {
        student: { select: { profile: { select: { firstName: true, lastName: true, dni: true } } } },
        parallel: {
          include: {
            level: { select: { name: true, attendanceMode: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    })
    if (!enrollment) throw new NotFoundError('Estudiante sin matrícula')

    const records = await prisma.attendanceRecord.findMany({
      where: { institutionId, studentId, status: { in: ['absent', 'late'] } },
      include: {
        courseAssignment: { include: { subject: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
    })

    const { parallel } = enrollment
    return {
      student: {
        id: studentId,
        fullName: enrollment.student.profile
          ? `${enrollment.student.profile.firstName} ${enrollment.student.profile.lastName}`
          : 'Estudiante',
        dni: enrollment.student.profile?.dni ?? null,
      },
      attendanceMode: parallel.level.attendanceMode as 'per_subject' | 'daily',
      parallelName: parallel.name,
      levelName: parallel.level.name,
      records: records.map((r) => ({
        id: r.id,
        date: r.date.toISOString().split('T')[0],
        status: r.status as 'absent' | 'late',
        notes: r.notes ?? null,
        subject: r.courseAssignment ? { name: r.courseAssignment.subject.name } : null,
      })),
    }
  }

  async createJustification(
    institutionId: string,
    dto: CreateJustificationDto,
    justifiedById: string,
  ) {
    const student = await prisma.user.findFirst({
      where: { id: dto.studentId, institutionId },
    })
    if (!student) throw new NotFoundError('Estudiante no encontrado')

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        id: { in: dto.attendanceRecordIds },
        studentId: dto.studentId,
        institutionId,
      },
    })

    if (attendanceRecords.length !== dto.attendanceRecordIds.length) {
      throw new BadRequestError(
        'Uno o más registros de asistencia no pertenecen al estudiante o no existen',
      )
    }

    const justification = await prisma.absenceJustification.create({
      data: {
        institutionId,
        studentId: dto.studentId,
        reason: dto.reason,
        documentUrl: dto.documentUrl,
        justifiedBy: justifiedById,
      },
    })

    await prisma.justificationAttendance.createMany({
      data: dto.attendanceRecordIds.map((attendanceRecordId) => ({
        justificationId: justification.id,
        attendanceRecordId,
      })),
    })

    await prisma.attendanceRecord.updateMany({
      where: {
        id: { in: dto.attendanceRecordIds },
      },
      data: { status: 'excused' },
    })

    return justification
  }
}

function parseAttendanceDate(date: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestError('Fecha inválida (formato YYYY-MM-DD)')
  const parsed = new Date(date)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new BadRequestError('Fecha inválida')
  return parsed
}

function validateClassPeriod(period: number) {
  if (!Number.isInteger(period) || period < 1 || period > 20) throw new BadRequestError('Hora de clase inválida (1–20)')
}

/** Rechaza estados inválidos y estudiantes que no están matriculados (activos) en el paralelo. */
async function assertStudentsEnrolled(
  institutionId: string,
  parallelId: string,
  academicYearId: string,
  records: BulkAttendanceDto['records'],
): Promise<void> {
  if (!Array.isArray(records) || records.length === 0) throw new BadRequestError('No hay registros para guardar')
  for (const r of records) {
    if (!VALID_STATUSES.has(r.status)) throw new BadRequestError(`Estado de asistencia inválido: ${r.status}`)
  }
  const ids = [...new Set(records.map((r) => r.studentId))]
  const count = await prisma.studentEnrollment.count({
    where: { institutionId, parallelId, academicYearId, status: 'active', studentId: { in: ids } },
  })
  if (count !== ids.length) throw new BadRequestError('Hay estudiantes que no pertenecen a este paralelo')
}

function newlyFlagged(
  previous: Array<{ studentId: string; status: string }>,
  records: BulkAttendanceDto['records'],
): Array<{ studentId: string; status: string }> {
  const before = new Map(previous.map((p) => [p.studentId, p.status]))
  return records
    .filter((r) => (r.status === 'absent' || r.status === 'late') && before.get(r.studentId) !== r.status)
    .map((r) => ({ studentId: r.studentId, status: r.status }))
}
