import { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors/app.errors'
import { resolveGuardianStudentId } from '../../shared/infrastructure/services/guardian-scope.service'
import { isPrivilegedStaff } from '../../shared/infrastructure/services/teacher-scope.service'
import { PrismaInstitutionRepository } from '../institution/infrastructure/repositories/prisma-institution.repository'

const institutionRepo = new PrismaInstitutionRepository()

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/dashboard/stats', async (req) => {
    const { institutionId } = req.user

    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      activeYear,
      totalParallels,
      totalActivities,
      pendingIncidents,
      unreadMessages,
    ] = await Promise.all([
      prisma.user.count({ where: { institutionId, isActive: true } }),
      prisma.userRole.count({
        where: { user: { institutionId }, role: { name: 'student', institutionId } },
      }),
      prisma.userRole.count({
        where: { user: { institutionId }, role: { name: 'teacher', institutionId } },
      }),
      prisma.academicYear.findFirst({
        where: { institutionId, isActive: true },
        include: {
          _count: { select: { academicPeriods: true, parallels: true, enrollments: true } },
        },
      }),
      prisma.parallel.count({ where: { institutionId } }),
      prisma.activity.count({ where: { institutionId } }),
      prisma.disciplinaryIncident.count({
        where: { institutionId, status: { in: ['open', 'in_review'] } },
      }),
      prisma.messageRecipient.count({
        where: { recipientId: req.user.sub, isRead: false, message: { thread: { institutionId } } },
      }),
    ])

    return {
      users: { total: totalUsers, students: totalStudents, teachers: totalTeachers },
      academic: {
        activeYear: activeYear
          ? {
              id: activeYear.id,
              name: activeYear.name,
              periods: activeYear._count.academicPeriods,
              parallels: activeYear._count.parallels,
              enrollments: activeYear._count.enrollments,
            }
          : null,
        totalParallels,
        totalActivities,
      },
      incidents: { pending: pendingIncidents },
      messages: { unread: unreadMessages },
    }
  })

  app.get<{ Querystring: { studentId?: string } }>('/dashboard/today', async (req, reply) => {
    const { institutionId, sub, roles } = req.user
    if (!roles.includes('student') && !roles.includes('guardian')) throw new ForbiddenError()
    const studentId = roles.includes('guardian')
      ? await resolveGuardianStudentId(sub, req.query.studentId)
      : sub
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { institutionId, studentId, status: 'active' },
      orderBy: { enrolledAt: 'desc' },
      include: { parallel: { include: { level: true } }, academicYear: true },
    })
    if (!enrollment) throw new NotFoundError('El estudiante no tiene una matrícula activa')

    const now = new Date()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)
    const upcomingLimit = new Date(todayStart)
    upcomingLimit.setDate(upcomingLimit.getDate() + 14)
    const recentLimit = new Date(todayStart)
    recentLimit.setDate(recentLimit.getDate() - 30)

    const [tasks, grades, attendance, schedule] = await Promise.all([
      prisma.task.findMany({
        where: {
          institutionId,
          isPublished: true,
          publishAt: { lte: now },
          dueDate: { gte: todayStart, lte: upcomingLimit },
          courseAssignment: {
            parallelId: enrollment.parallelId,
            academicYearId: enrollment.academicYearId,
          },
        },
        include: { courseAssignment: { select: { subject: { select: { name: true } } } } },
        orderBy: { dueDate: 'asc' },
        take: 8,
      }),
      prisma.grade.findMany({
        where: { institutionId, studentId, updatedAt: { gte: recentLimit }, score: { not: null } },
        include: {
          activity: {
            select: {
              name: true,
              maxScore: true,
              courseAssignment: { select: { subject: { select: { name: true } } } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      prisma.attendanceRecord.findMany({
        where: { institutionId, studentId, date: { gte: recentLimit }, status: { not: 'present' } },
        include: { courseAssignment: { select: { subject: { select: { name: true } } } } },
        orderBy: { date: 'desc' },
        take: 6,
      }),
      prisma.scheduleEntry.findMany({
        where: {
          institutionId,
          weekday: now.getDay(),
          courseAssignment: {
            parallelId: enrollment.parallelId,
            academicYearId: enrollment.academicYearId,
          },
        },
        include: { courseAssignment: { select: { subject: { select: { name: true } }, teacher: { select: { profile: { select: { firstName: true, lastName: true } } } } } } },
        orderBy: { startTime: 'asc' },
      }),
    ])

    return reply.send({
      student: {
        id: studentId,
        parallel: `${enrollment.parallel.level.name} - ${enrollment.parallel.name}`,
        academicYear: enrollment.academicYear.name,
      },
      tasks: tasks.map((task) => ({ id: task.id, title: task.title, dueDate: task.dueDate, subject: task.courseAssignment.subject.name })),
      recentGrades: grades.map((grade) => ({
        id: grade.id,
        activity: grade.activity.name,
        subject: grade.activity.courseAssignment.subject.name,
        score: Number(grade.score),
        maxScore: Number(grade.activity.maxScore),
        updatedAt: grade.updatedAt,
      })),
      attendance: attendance.map((record) => ({ id: record.id, date: record.date, status: record.status, subject: record.courseAssignment?.subject.name ?? null })),
      schedule: schedule.map((entry) => ({
        id: entry.id,
        subject: entry.courseAssignment.subject.name,
        startTime: entry.startTime,
        endTime: entry.endTime,
        room: entry.room,
        teacher: entry.courseAssignment.teacher.profile
          ? `${entry.courseAssignment.teacher.profile.firstName} ${entry.courseAssignment.teacher.profile.lastName}`
          : null,
      })),
    })
  })

  app.get<{ Querystring: { yearId?: string; parallelId?: string } }>('/dashboard/early-alerts', async (req, reply) => {
    if (!isPrivilegedStaff(req.user.roles)) throw new ForbiddenError()
    const { institutionId } = req.user
    const year = req.query.yearId
      ? await prisma.academicYear.findFirst({ where: { id: req.query.yearId, institutionId } })
      : await prisma.academicYear.findFirst({ where: { institutionId, isActive: true } })
    if (!year) throw new NotFoundError('No existe un año lectivo activo')
    const period = await prisma.academicPeriod.findFirst({
      where: { academicYearId: year.id, isActive: true },
      orderBy: { periodNumber: 'asc' },
    }) ?? await prisma.academicPeriod.findFirst({
      where: { academicYearId: year.id },
      orderBy: { periodNumber: 'desc' },
    })
    if (!period) throw new NotFoundError('El año lectivo no tiene períodos')

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        academicYearId: year.id,
        status: 'active',
        ...(req.query.parallelId ? { parallelId: req.query.parallelId } : {}),
      },
      include: {
        student: { select: { id: true, profile: { select: { firstName: true, lastName: true, dni: true } } } },
        parallel: { include: { level: true } },
      },
      orderBy: [{ parallel: { level: { sortOrder: 'asc' } } }, { student: { profile: { lastName: 'asc' } } }],
    })
    const studentIds = enrollments.map((row) => row.studentId)
    const since = new Date()
    since.setDate(since.getDate() - 30)
    const [grades, attendance, config] = await Promise.all([
      prisma.grade.findMany({
        where: {
          institutionId,
          studentId: { in: studentIds },
          isExcused: false,
          activity: { academicPeriodId: period.id, isPublished: true },
        },
        select: { studentId: true, score: true, status: true, activity: { select: { maxScore: true } } },
      }),
      prisma.attendanceRecord.findMany({
        where: { institutionId, studentId: { in: studentIds }, date: { gte: since }, status: { in: ['absent', 'late'] } },
        select: { studentId: true, status: true },
      }),
      institutionRepo.getGradingConfig(institutionId),
    ])

    const alerts = enrollments.flatMap((enrollment) => {
      const studentGrades = grades.filter((grade) => grade.studentId === enrollment.studentId)
      const lowGrades = studentGrades.filter((grade) => {
        if (grade.score == null || Number(grade.activity.maxScore) <= 0) return false
        return (Number(grade.score) / Number(grade.activity.maxScore)) * config.gradingScaleMax < config.promotion.minToPass
      }).length
      const missedTasks = studentGrades.filter((grade) => grade.status === 'no_realizado').length
      const studentAttendance = attendance.filter((row) => row.studentId === enrollment.studentId)
      const absences = studentAttendance.filter((row) => row.status === 'absent').length
      const late = studentAttendance.filter((row) => row.status === 'late').length
      const reasons = [
        ...(lowGrades ? [`${lowGrades} actividad(es) bajo ${config.promotion.minToPass}`] : []),
        ...(missedTasks ? [`${missedTasks} actividad(es) no realizada(s)`] : []),
        ...(absences ? [`${absences} ausencia(s) en 30 días`] : []),
        ...(late >= 2 ? [`${late} atraso(s) en 30 días`] : []),
      ]
      if (!reasons.length) return []
      return [{
        studentId: enrollment.studentId,
        studentName: enrollment.student.profile
          ? `${enrollment.student.profile.lastName} ${enrollment.student.profile.firstName}`
          : 'Sin nombre',
        dni: enrollment.student.profile?.dni ?? null,
        parallelId: enrollment.parallelId,
        parallel: `${enrollment.parallel.level.name} - ${enrollment.parallel.name}`,
        severity: lowGrades >= 2 || missedTasks >= 2 || absences >= 3 ? 'high' : 'medium',
        reasons,
        metrics: { lowGrades, missedTasks, absences, late },
      }]
    })

    return reply.send({
      year: { id: year.id, name: year.name },
      period: { id: period.id, name: period.name },
      totalStudents: enrollments.length,
      alerts: alerts.sort((a, b) => Number(b.severity === 'high') - Number(a.severity === 'high')),
    })
  })
}
