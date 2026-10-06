import { FastifyInstance } from 'fastify'
import { prisma } from '../../shared/infrastructure/database/prisma'
import { authMiddleware } from '../../shared/infrastructure/middleware/auth.middleware'
import { ForbiddenError, NotFoundError } from '../../shared/domain/errors/app.errors'
import { resolveGuardianStudentId } from '../../shared/infrastructure/services/guardian-scope.service'

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
}
