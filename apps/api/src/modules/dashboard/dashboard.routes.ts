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

  // Cada rol solo recibe los indicadores que le corresponden: los conteos
  // institucionales son de admin/rector, incidentes de inspección y DECE de DECE.
  app.get('/dashboard/stats', async (req) => {
    const { institutionId, roles, sub } = req.user
    const isAdmin = roles.includes('admin') || roles.includes('rector')
    const seesIncidents = isAdmin || roles.includes('inspector')
    const seesDece = isAdmin || roles.includes('dece')
    const zero = Promise.resolve(0)

    const [
      totalUsers,
      totalStudents,
      totalTeachers,
      activeYear,
      totalParallels,
      totalActivities,
      pendingIncidents,
      unreadMessages,
      deceOpenCases,
      deceFollowUps,
    ] = await Promise.all([
      isAdmin ? prisma.user.count({ where: { institutionId, isActive: true } }) : zero,
      isAdmin
        ? prisma.userRole.count({
            where: { user: { institutionId, isActive: true }, role: { name: 'student', institutionId } },
          })
        : zero,
      isAdmin
        ? prisma.userRole.count({
            where: { user: { institutionId, isActive: true }, role: { name: 'teacher', institutionId } },
          })
        : zero,
      isAdmin
        ? prisma.academicYear.findFirst({
            where: { institutionId, isActive: true },
            include: {
              _count: { select: { academicPeriods: true, parallels: true, enrollments: true } },
            },
          })
        : Promise.resolve(null),
      isAdmin ? prisma.parallel.count({ where: { institutionId } }) : zero,
      isAdmin ? prisma.activity.count({ where: { institutionId } }) : zero,
      seesIncidents
        ? prisma.disciplinaryIncident.count({
            where: { institutionId, status: { in: ['open', 'in_review'] } },
          })
        : zero,
      prisma.messageRecipient.count({
        where: { recipientId: sub, isRead: false, message: { thread: { institutionId } } },
      }),
      seesDece
        ? prisma.deceCase.count({
            where: { institutionId, status: { not: 'internal_closed' } },
          })
        : zero,
      seesDece
        ? prisma.deceCaseAction.count({
            where: { institutionId, type: 'follow_up', case: { status: { not: 'internal_closed' } } },
          })
        : zero,
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
      dece: { openCases: deceOpenCases, followUps: deceFollowUps },
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

  /**
   * Panel "Hoy" del docente: sus clases del día (según horario) con el estado
   * de la asistencia, actividades con notas pendientes y tareas por vencer.
   * `date` lo manda el cliente (YYYY-MM-DD local) para no depender de la zona
   * horaria del servidor.
   */
  app.get<{ Querystring: { date?: string } }>('/dashboard/teacher-today', async (req) => {
    const { institutionId, sub } = req.user
    const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date ?? '') ? req.query.date! : new Date().toISOString().slice(0, 10)
    const day = new Date(`${date}T00:00:00Z`)
    const weekday = day.getUTCDay() === 0 ? 7 : day.getUTCDay() // 1 = lunes … 7 = domingo

    const assignments = await prisma.courseAssignment.findMany({
      where: { institutionId, teacherId: sub, academicYear: { isActive: true } },
      select: {
        id: true,
        parallelId: true,
        academicYearId: true,
        subject: { select: { name: true } },
        parallel: { select: { name: true, level: { select: { name: true, attendanceMode: true } } } },
      },
    })
    const caIds = assignments.map((a) => a.id)
    const byId = new Map(assignments.map((a) => [a.id, a]))
    const label = (a: (typeof assignments)[number]) => `${a.parallel.level.name} ${a.parallel.name}`

    const [schedule, attendanceToday, activePeriod, tutored] = await Promise.all([
      prisma.scheduleEntry.findMany({
        where: { institutionId, courseAssignmentId: { in: caIds }, weekday },
        orderBy: { startTime: 'asc' },
      }),
      prisma.attendanceRecord.groupBy({
        by: ['courseAssignmentId'],
        where: { institutionId, courseAssignmentId: { in: caIds }, date: day },
        _count: { _all: true },
      }),
      prisma.academicPeriod.findFirst({
        where: { academicYear: { institutionId, isActive: true }, isActive: true },
        select: { id: true, name: true },
      }),
      prisma.parallel.findMany({
        where: { institutionId, tutorId: sub, academicYear: { isActive: true } },
        select: { id: true, name: true, level: { select: { name: true, attendanceMode: true } } },
      }),
    ])
    const takenCa = new Set(attendanceToday.map((r) => r.courseAssignmentId))

    // Asistencia diaria (niveles "daily"): la toma el tutor una vez al día.
    const dailyParallels = tutored.filter((p) => p.level.attendanceMode === 'daily')
    const dailyTaken = dailyParallels.length
      ? await prisma.attendanceRecord.groupBy({
          by: ['parallelId'],
          where: { institutionId, parallelId: { in: dailyParallels.map((p) => p.id) }, date: day },
          _count: { _all: true },
        })
      : []
    const dailyTakenSet = new Set(dailyTaken.map((r) => r.parallelId))

    // Actividades del período activo con estudiantes sin nota.
    let pendingGrading: Array<{ activityId: string; activityName: string; courseAssignmentId: string; periodId: string; label: string; subject: string; graded: number; total: number }> = []
    if (activePeriod && caIds.length) {
      const [activities, enrollmentCounts] = await Promise.all([
        prisma.activity.findMany({
          where: { institutionId, courseAssignmentId: { in: caIds }, academicPeriodId: activePeriod.id, activityDate: { lte: day } },
          select: {
            id: true,
            name: true,
            courseAssignmentId: true,
            activityDate: true,
            _count: { select: { grades: { where: { OR: [{ score: { not: null } }, { isExcused: true }] } } } },
          },
          orderBy: { activityDate: 'desc' },
        }),
        prisma.studentEnrollment.groupBy({
          by: ['parallelId', 'academicYearId'],
          where: { institutionId, status: 'active', parallelId: { in: [...new Set(assignments.map((a) => a.parallelId))] } },
          _count: { _all: true },
        }),
      ])
      const enrolled = new Map(enrollmentCounts.map((e) => [`${e.parallelId}:${e.academicYearId}`, e._count._all]))
      pendingGrading = activities
        .map((act) => {
          const ca = byId.get(act.courseAssignmentId)!
          const total = enrolled.get(`${ca.parallelId}:${ca.academicYearId}`) ?? 0
          return {
            activityId: act.id,
            activityName: act.name,
            courseAssignmentId: act.courseAssignmentId,
            periodId: activePeriod.id,
            label: label(ca),
            subject: ca.subject.name,
            graded: act._count.grades,
            total,
          }
        })
        .filter((a) => a.total > 0 && a.graded < a.total)
        .slice(0, 8)
    }

    const weekAhead = new Date(day)
    weekAhead.setUTCDate(weekAhead.getUTCDate() + 7)
    const tasksDue = caIds.length
      ? await prisma.task.findMany({
          where: { institutionId, courseAssignmentId: { in: caIds }, dueDate: { gte: day, lte: weekAhead } },
          select: { id: true, title: true, dueDate: true, isPublished: true, courseAssignmentId: true },
          orderBy: { dueDate: 'asc' },
          take: 8,
        })
      : []

    return {
      date,
      period: activePeriod,
      classes: schedule.map((s) => {
        const ca = byId.get(s.courseAssignmentId)!
        const isDaily = ca.parallel.level.attendanceMode === 'daily'
        return {
          courseAssignmentId: s.courseAssignmentId,
          startTime: s.startTime,
          endTime: s.endTime,
          room: s.room,
          subject: ca.subject.name,
          label: label(ca),
          attendanceMode: isDaily ? 'daily' : 'per_subject',
          attendanceTaken: isDaily ? dailyTakenSet.has(ca.parallelId) : takenCa.has(s.courseAssignmentId),
        }
      }),
      dailyAttendance: dailyParallels.map((p) => ({
        parallelId: p.id,
        label: `${p.level.name} ${p.name}`,
        taken: dailyTakenSet.has(p.id),
      })),
      pendingGrading,
      tasksDue: tasksDue.map((t) => ({
        id: t.id,
        title: t.title,
        dueDate: t.dueDate.toISOString().slice(0, 10),
        isPublished: t.isPublished,
        subject: byId.get(t.courseAssignmentId)?.subject.name ?? '',
        label: byId.get(t.courseAssignmentId) ? label(byId.get(t.courseAssignmentId)!) : '',
      })),
    }
  })

  /**
   * Checklist de puesta en marcha para admin/rector: qué falta configurar en el
   * año lectivo activo, calculado con conteos reales (no un wizard que se marca a mano).
   */
  app.get('/dashboard/setup-checklist', async (req) => {
    const { institutionId, roles } = req.user
    if (!roles.includes('admin') && !roles.includes('rector')) throw new ForbiddenError()

    const activeYear = await prisma.academicYear.findFirst({
      where: { institutionId, isActive: true },
      select: { id: true, name: true, _count: { select: { academicPeriods: true } } },
    })
    const yearId = activeYear?.id ?? '__none__'

    const [
      levels,
      subjects,
      parallels,
      parallelsNoTutor,
      parallelsNoAssignments,
      assignments,
      teachers,
      activeEnrollments,
      parallelsNoStudents,
      studentsNoGuardian,
      institution,
      activePeriod,
      scheduleEntries,
    ] = await Promise.all([
      prisma.level.count({ where: { institutionId } }),
      prisma.subject.count({ where: { institutionId, isActive: true } }),
      prisma.parallel.count({ where: { institutionId, academicYearId: yearId } }),
      prisma.parallel.count({ where: { institutionId, academicYearId: yearId, tutorId: null } }),
      prisma.parallel.count({ where: { institutionId, academicYearId: yearId, courseAssignments: { none: {} } } }),
      prisma.courseAssignment.count({ where: { institutionId, academicYearId: yearId } }),
      prisma.userRole.count({ where: { user: { institutionId, isActive: true }, role: { name: 'teacher', institutionId } } }),
      prisma.studentEnrollment.count({ where: { institutionId, academicYearId: yearId, status: 'active' } }),
      prisma.parallel.count({
        where: { institutionId, academicYearId: yearId, enrollments: { none: { status: 'active' } } },
      }),
      prisma.studentEnrollment.count({
        where: { institutionId, academicYearId: yearId, status: 'active', student: { studentGuardians: { none: {} } } },
      }),
      prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } }),
      prisma.academicPeriod.findFirst({ where: { academicYearId: yearId, isActive: true }, select: { id: true } }),
      prisma.scheduleEntry.count({ where: { institutionId, courseAssignment: { academicYearId: yearId } } }),
    ])
    const assignmentsNoInsumos = activePeriod
      ? await prisma.courseAssignment.count({
          where: { institutionId, academicYearId: yearId, insumos: { none: { academicPeriodId: activePeriod.id } } },
        })
      : assignments
    const settings = (institution?.settings ?? {}) as { gradingConfig?: unknown; branding?: { logoUrl?: string | null } }

    const items = [
      {
        key: 'year',
        label: 'Año lectivo activo con sus períodos',
        done: !!activeYear && activeYear._count.academicPeriods > 0,
        detail: activeYear ? `${activeYear.name} · ${activeYear._count.academicPeriods} períodos` : 'No hay año lectivo activo',
        link: '/academic/years',
      },
      { key: 'levels', label: 'Grados / niveles', done: levels > 0, detail: `${levels} niveles`, link: '/academic/levels' },
      { key: 'subjects', label: 'Materias activas', done: subjects > 0, detail: `${subjects} materias`, link: '/academic/subjects' },
      {
        key: 'parallels',
        label: 'Paralelos con tutor',
        done: parallels > 0 && parallelsNoTutor === 0,
        detail: parallels === 0 ? 'Sin paralelos en el año activo' : parallelsNoTutor > 0 ? `${parallelsNoTutor} de ${parallels} sin tutor` : `${parallels} paralelos`,
        link: '/academic/parallels',
      },
      { key: 'teachers', label: 'Docentes registrados', done: teachers > 0, detail: `${teachers} docentes`, link: '/users' },
      {
        key: 'assignments',
        label: 'Materias asignadas a docentes',
        done: assignments > 0 && parallelsNoAssignments === 0,
        detail: assignments === 0 ? 'Sin asignaciones' : parallelsNoAssignments > 0 ? `${parallelsNoAssignments} paralelos sin materias asignadas` : `${assignments} asignaciones`,
        link: '/academic/assignments',
      },
      {
        key: 'enrollment',
        label: 'Estudiantes matriculados',
        done: activeEnrollments > 0 && parallelsNoStudents === 0,
        detail: activeEnrollments === 0 ? 'Sin matrículas' : parallelsNoStudents > 0 ? `${parallelsNoStudents} paralelos sin estudiantes` : `${activeEnrollments} estudiantes`,
        link: '/enrollment',
      },
      {
        key: 'guardians',
        label: 'Representantes vinculados',
        done: activeEnrollments > 0 && studentsNoGuardian === 0,
        detail: studentsNoGuardian > 0 ? `${studentsNoGuardian} estudiantes sin representante` : 'Todos tienen representante',
        link: '/enrollment',
      },
      {
        key: 'insumos',
        label: 'Insumos del período activo',
        done: assignments > 0 && assignmentsNoInsumos === 0,
        detail: assignmentsNoInsumos > 0 ? `${assignmentsNoInsumos} materias sin insumos` : 'Configurados',
        link: '/academic/insumo-setup',
      },
      { key: 'grading', label: 'Escala de calificación', done: !!settings.gradingConfig, detail: settings.gradingConfig ? 'Configurada' : 'Pendiente', link: '/settings/calificacion' },
      { key: 'schedule', label: 'Horarios de clase', done: scheduleEntries > 0, detail: `${scheduleEntries} bloques`, link: '/schedules' },
      { key: 'branding', label: 'Logo de la institución', done: !!settings.branding?.logoUrl, detail: settings.branding?.logoUrl ? 'Cargado' : 'Sin logo', link: '/settings/branding' },
    ]
    return { items, completed: items.filter((i) => i.done).length, total: items.length }
  })
}
