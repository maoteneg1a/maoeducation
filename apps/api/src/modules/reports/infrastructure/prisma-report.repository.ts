import { prisma } from '../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../shared/domain/errors/app.errors'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'
import {
  average,
  computePeriodSummary,
  applyRecovery,
  activityKind,
  toQualitativeCode,
  type InsumoGroupInput,
  type QualitativeBand,
} from '../../../shared/domain/grade-math'
import type {
  GradesReportQuery,
  AttendanceReportQuery,
  EnrollmentReportQuery,
  BulletinOptionsQuery,
  BulletinReportQuery,
} from '../application/dtos/report.dto'

// Fallback si la institución no tiene configurada la escala de valor cualitativo.
const DEFAULT_QUALITATIVE_VALUE_SCALE: QualitativeBand[] = [
  { min: 9.5, max: 10.0, code: 'A+' },
  { min: 9.0, max: 9.49, code: 'A-' },
  { min: 8.0, max: 8.99, code: 'B+' },
  { min: 7.0, max: 7.99, code: 'B-' },
  { min: 6.0, max: 6.99, code: 'C+' },
  { min: 5.0, max: 5.99, code: 'C-' },
  { min: 4.51, max: 4.99, code: 'D+' },
  { min: 4.01, max: 4.5, code: 'D-' },
  { min: 2.67, max: 4.0, code: 'E+' },
  { min: 1.34, max: 2.66, code: 'E-' },
  { min: 0, max: 1.33, code: 'F-' },
]

export class PrismaReportRepository {
  private avg(scores: (number | null)[]) {
    return average(scores)
  }

  private async gradingScaleMax(institutionId: string): Promise<number> {
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    return (institution?.settings as { gradingConfig?: { gradingScaleMax?: number } } | null)
      ?.gradingConfig?.gradingScaleMax ?? 10
  }

  async getGradesReport(
    institutionId: string,
    query: GradesReportQuery,
    caller?: { userId: string; roles: string[] },
  ) {
    const gradingScaleMax = await this.gradingScaleMax(institutionId)
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: query.courseAssignmentId, institutionId },
      select: {
        id: true,
        parallelId: true,
        academicYearId: true,
        examWeight: true,
        subject: true,
        parallel: { include: { level: true } },
        teacher: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        academicYear: { select: { id: true, name: true } },
      },
    })
    if (!assignment) throw new NotFoundError('Asignación no encontrada')

    const insumos = await prisma.insumo.findMany({
      where: { institutionId, courseAssignmentId: query.courseAssignmentId, academicPeriodId: query.periodId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        activities: {
          where: { isPublished: true },
          orderBy: { activityDate: 'asc' },
          include: {
            grades: { where: { institutionId }, select: { studentId: true, score: true } },
            activityType: { select: { code: true, name: true } },
          },
        },
      },
    })

    const activitiesWithoutInsumo = await prisma.activity.findMany({
      where: {
        institutionId,
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.periodId,
        isPublished: true,
        insumoId: null,
      },
      orderBy: { activityDate: 'asc' },
      include: {
        grades: { where: { institutionId }, select: { studentId: true, score: true } },
        activityType: { select: { code: true, name: true } },
      },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allInsumos: any[] = [...insumos]
    if (activitiesWithoutInsumo.length > 0) {
      allInsumos.push({
        id: 'no-insumo',
        name: 'Sin insumo',
        weight: null,
        sortOrder: 9999,
        activities: activitiesWithoutInsumo,
      })
    }

    // Resolve studentId filter for student/guardian roles
    let studentIdFilter: string | undefined
    if (caller) {
      if (caller.roles.includes('student')) {
        studentIdFilter = caller.userId
      } else if (caller.roles.includes('guardian')) {
        studentIdFilter = await resolveGuardianStudentId(caller.userId)
      }
    }

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        parallelId: assignment.parallelId,
        academicYearId: assignment.academicYearId,
        ...(studentIdFilter ? { studentId: studentIdFilter } : {}),
      },
      include: {
        student: { select: { id: true, profile: { select: { firstName: true, lastName: true, dni: true } } } },
      },
      orderBy: [
        { student: { profile: { lastName: 'asc' } } },
        { student: { profile: { firstName: 'asc' } } },
      ],
    })

    // Build grade map: studentId -> activityId -> score
    const gradeMap = new Map<string, Map<string, number | null>>()
    for (const insumo of allInsumos) {
      for (const activity of insumo.activities) {
        for (const grade of activity.grades) {
          if (!gradeMap.has(grade.studentId)) gradeMap.set(grade.studentId, new Map())
          gradeMap.get(grade.studentId)!.set(activity.id, grade.score != null ? Number(grade.score) : null)
        }
      }
    }

    const examWeight = assignment.examWeight ?? 30

    return {
      assignment,
      insumos: allInsumos,
      students: enrollments.map((e) => {
        const grades = gradeMap.get(e.studentId) ?? new Map<string, number | null>()
        // Grupos canónicos para el cálculo: cada insumo (incl. "Sin insumo") con
        // sus actividades; el examen se identifica por activityType.code.
        const groups: InsumoGroupInput[] = allInsumos.map((ins) => ({
          id: ins.id,
          name: ins.name,
          activities: ins.activities.map((a: { id: string; maxScore: unknown; activityType: { code: string } }) => ({
            score: grades.get(a.id) ?? null,
            maxScore: Number(a.maxScore),
            kind: activityKind(a.activityType.code),
          })),
        }))
        const summary = { ...computePeriodSummary(groups, examWeight, gradingScaleMax), examWeight }
        return {
          student: e.student,
          grades: grades.size > 0 ? Object.fromEntries(grades) : {},
          summary,
        }
      }),
    }
  }

  async getMyGrades(institutionId: string, studentId: string, periodId: string) {
    const gradingScaleMax = await this.gradingScaleMax(institutionId)
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, studentId },
      select: { parallelId: true, academicYearId: true },
    })
    if (enrollments.length === 0) return []

    const assignments = await prisma.courseAssignment.findMany({
      where: {
        institutionId,
        OR: enrollments.map((e) => ({ parallelId: e.parallelId, academicYearId: e.academicYearId })),
      },
      include: {
        subject: { select: { name: true } },
        teacher: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { subject: { name: 'asc' } },
    })

    const results = []
    for (const assignment of assignments) {
      const insumos = await prisma.insumo.findMany({
        where: { institutionId, courseAssignmentId: assignment.id, academicPeriodId: periodId },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          activities: {
            where: { isPublished: true },
            include: {
              grades: { where: { studentId, institutionId }, select: { score: true } },
              activityType: { select: { code: true } },
            },
          },
        },
      })

      const activitiesWithoutInsumo = await prisma.activity.findMany({
        where: {
          institutionId,
          courseAssignmentId: assignment.id,
          academicPeriodId: periodId,
          isPublished: true,
          insumoId: null,
        },
        include: {
          grades: { where: { studentId, institutionId }, select: { score: true } },
          activityType: { select: { code: true } },
        },
      })

      // Grupos canónicos: insumos con nombre + "Sin insumo".
      const groups: InsumoGroupInput[] = [
        ...insumos.map((ins) => ({
          id: ins.id,
          name: ins.name,
          activities: ins.activities.map((a) => ({
            score: a.grades[0]?.score != null ? Number(a.grades[0].score) : null,
            maxScore: Number(a.maxScore),
            kind: activityKind(a.activityType.code),
          })),
        })),
        ...(activitiesWithoutInsumo.length > 0
          ? [
              {
                id: 'no-insumo',
                name: 'Sin insumo',
                activities: activitiesWithoutInsumo.map((a) => ({
                  score: a.grades[0]?.score != null ? Number(a.grades[0].score) : null,
                  maxScore: Number(a.maxScore),
                  kind: activityKind(a.activityType.code),
                })),
              },
            ]
          : []),
      ]

      const examWeight = assignment.examWeight
      const summary = computePeriodSummary(groups, examWeight, gradingScaleMax)
      const avgById = new Map(summary.insumoAvgs.map((i) => [i.id, i.avg]))

      // Columnas: solo insumos con al menos una actividad formativa.
      const insumoColumns = groups
        .filter((g) => g.activities.some((a) => a.kind === 'regular'))
        .map((g) => ({ name: g.name, avg: avgById.get(g.id) ?? null }))

      results.push({
        assignmentId: assignment.id,
        subjectName: assignment.subject.name,
        teacherName: assignment.teacher?.profile
          ? `${assignment.teacher.profile.firstName} ${assignment.teacher.profile.lastName}`
          : '',
        examWeight,
        insumoColumns,
        regularAvg: summary.insumosBase,
        examenAvg: summary.examenAvg,
        proyectoAvg: summary.proyectoAvg,
        hasSummative: summary.hasSummative,
        total: summary.total,
      })
    }
    return results
  }

  async getAttendanceReport(institutionId: string, query: AttendanceReportQuery) {
    const dateRange = { gte: new Date(query.startDate), lte: new Date(query.endDate) }

    // Modo diario: se pasa parallelId directamente (sin courseAssignment)
    if (query.parallelId && !query.courseAssignmentId) {
      const parallel = await prisma.parallel.findFirst({
        where: { id: query.parallelId, institutionId },
        include: { level: true, academicYear: { select: { id: true, name: true } } },
      })
      if (!parallel) throw new NotFoundError('Paralelo no encontrado')

      const [records, enrollments] = await Promise.all([
        prisma.attendanceRecord.findMany({
          where: { institutionId, parallelId: query.parallelId, courseAssignmentId: null, date: dateRange },
          include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
          orderBy: [{ date: 'asc' }, { student: { profile: { lastName: 'asc' } } }],
        }),
        prisma.studentEnrollment.findMany({
          where: { institutionId, parallelId: query.parallelId, academicYearId: parallel.academicYearId },
          include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
          orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }],
        }),
      ])

      const uniqueDates = [...new Set(records.map((r) => r.date.toISOString().split('T')[0]))].sort()
      const recordMap = new Map<string, Map<string, string>>()
      for (const r of records) {
        const d = r.date.toISOString().split('T')[0]
        if (!recordMap.has(r.studentId)) recordMap.set(r.studentId, new Map())
        recordMap.get(r.studentId)!.set(d, r.status)
      }

      return {
        assignment: {
          id: parallel.id,
          subject: { name: 'Asistencia diaria' },
          parallel: { name: parallel.name, level: { name: parallel.level.name } },
          academicYear: { id: parallel.academicYear.id, name: parallel.academicYear.name },
        },
        dates: uniqueDates,
        students: enrollments.map((e) => ({
          student: e.student,
          records: Object.fromEntries(recordMap.get(e.studentId) ?? new Map()),
        })),
      }
    }

    // Modo por materia: courseAssignmentId requerido
    if (!query.courseAssignmentId) throw new NotFoundError('Asignación no encontrada')

    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: query.courseAssignmentId, institutionId },
      include: {
        subject: true,
        parallel: { include: { level: true } },
        academicYear: { select: { id: true, name: true } },
      },
    })
    if (!assignment) throw new NotFoundError('Asignación no encontrada')

    const [records, enrollments] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: { institutionId, courseAssignmentId: query.courseAssignmentId, date: dateRange },
        include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
        orderBy: [{ date: 'asc' }, { student: { profile: { lastName: 'asc' } } }],
      }),
      prisma.studentEnrollment.findMany({
        where: { institutionId, parallelId: assignment.parallelId, academicYearId: assignment.academicYearId },
        include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
        orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }],
      }),
    ])

    const uniqueDates = [...new Set(records.map((r) => r.date.toISOString().split('T')[0]))].sort()
    const recordMap = new Map<string, Map<string, string>>()
    for (const r of records) {
      const d = r.date.toISOString().split('T')[0]
      if (!recordMap.has(r.studentId)) recordMap.set(r.studentId, new Map())
      recordMap.get(r.studentId)!.set(d, r.status)
    }

    return {
      assignment,
      dates: uniqueDates,
      students: enrollments.map((e) => ({
        student: e.student,
        records: Object.fromEntries(recordMap.get(e.studentId) ?? new Map()),
      })),
    }
  }

  async getEnrollmentReport(institutionId: string, query: EnrollmentReportQuery) {
    const year = await prisma.academicYear.findFirst({ where: { id: query.yearId, institutionId } })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        academicYearId: query.yearId,
        ...(query.parallelId && { parallelId: query.parallelId }),
      },
      include: {
        student: { select: { id: true, profile: { select: { firstName: true, lastName: true, dni: true, birthDate: true } } } },
        parallel: { include: { level: true } },
      },
      orderBy: [
        { parallel: { level: { sortOrder: 'asc' } } },
        { parallel: { name: 'asc' } },
        { student: { profile: { lastName: 'asc' } } },
      ],
    })

    // Group by parallel
    const grouped = new Map<string, { parallel: typeof enrollments[0]['parallel']; enrollments: typeof enrollments }>()
    for (const e of enrollments) {
      const key = e.parallelId
      if (!grouped.has(key)) grouped.set(key, { parallel: e.parallel, enrollments: [] })
      grouped.get(key)!.enrollments.push(e)
    }

    return {
      year,
      totalEnrollments: enrollments.length,
      parallels: Array.from(grouped.values()),
    }
  }

  async getBulletinOptions(
    institutionId: string,
    query: BulletinOptionsQuery,
    caller: { userId: string; roles: string[] },
  ) {
    const isAdminLike = caller.roles.includes('admin') || caller.roles.includes('inspector')
    const isTeacher = caller.roles.includes('teacher') && !isAdminLike

    let assignments: Array<{
      parallelId: string
      academicYearId: string
      parallel: { id: string; name: string; level: { name: string } }
      academicYear: { id: string; name: string; isActive: boolean }
    }> = []

    if (isAdminLike) {
      assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, isActive: true },
        select: {
          parallelId: true,
          academicYearId: true,
          parallel: { select: { id: true, name: true, level: { select: { name: true } } } },
          academicYear: { select: { id: true, name: true, isActive: true } },
        },
      })
    } else if (isTeacher) {
      assignments = await prisma.courseAssignment.findMany({
        where: { institutionId, teacherId: caller.userId, isActive: true },
        select: {
          parallelId: true,
          academicYearId: true,
          parallel: { select: { id: true, name: true, level: { select: { name: true } } } },
          academicYear: { select: { id: true, name: true, isActive: true } },
        },
      })
    } else {
      return { years: [], parallels: [], students: [] }
    }

    const yearsMap = new Map<string, { id: string; name: string; isActive: boolean }>()
    const parallelsMap = new Map<string, { id: string; name: string; level: { name: string }; academicYearId: string }>()

    for (const assignment of assignments) {
      yearsMap.set(assignment.academicYear.id, assignment.academicYear)
      parallelsMap.set(assignment.parallelId, {
        id: assignment.parallel.id,
        name: assignment.parallel.name,
        level: assignment.parallel.level,
        academicYearId: assignment.academicYearId,
      })
    }

    const allowedParallels = Array.from(parallelsMap.values()).filter((p) =>
      query.yearId ? p.academicYearId === query.yearId : true,
    )

    const students = query.yearId && query.parallelId
      ? await prisma.studentEnrollment.findMany({
          where: {
            institutionId,
            academicYearId: query.yearId,
            parallelId: query.parallelId,
          },
          select: {
            student: {
              select: {
                id: true,
                profile: { select: { firstName: true, lastName: true, dni: true } },
              },
            },
          },
          orderBy: [
            { student: { profile: { lastName: 'asc' } } },
            { student: { profile: { firstName: 'asc' } } },
          ],
        })
      : []

    return {
      years: Array.from(yearsMap.values()).sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
      parallels: allowedParallels.sort((a, b) =>
        `${a.level.name} ${a.name}`.localeCompare(`${b.level.name} ${b.name}`),
      ),
      students: students.map((e) => ({
        id: e.student.id,
        profile: e.student.profile,
      })),
    }
  }

  async getStudentBulletin(
    institutionId: string,
    query: BulletinReportQuery,
    caller: { userId: string; roles: string[] },
  ) {
    const gradingScaleMax = await this.gradingScaleMax(institutionId)
    const parallel = await prisma.parallel.findFirst({
      where: { id: query.parallelId, institutionId, academicYearId: query.yearId },
      select: {
        id: true,
        name: true,
        level: { select: { name: true } },
        tutor: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    const year = await prisma.academicYear.findFirst({
      where: { id: query.yearId, institutionId },
      select: { id: true, name: true, startDate: true, endDate: true },
    })
    if (!year) throw new NotFoundError('Año académico no encontrado')

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        institutionId,
        academicYearId: query.yearId,
        parallelId: query.parallelId,
        studentId: query.studentId,
      },
      select: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })
    if (!enrollment) throw new NotFoundError('Estudiante no matriculado en el paralelo seleccionado')

    if (caller.roles.includes('teacher') && !caller.roles.includes('admin') && !caller.roles.includes('inspector')) {
      const canAccess = await prisma.courseAssignment.findFirst({
        where: {
          institutionId,
          academicYearId: query.yearId,
          parallelId: query.parallelId,
          teacherId: caller.userId,
        },
        select: { id: true },
      })
      if (!canAccess) throw new NotFoundError('No tienes acceso a este paralelo')
    }

    const periods = await prisma.academicPeriod.findMany({
      where: { academicYearId: query.yearId },
      select: { id: true, name: true, periodNumber: true, startDate: true, endDate: true },
      orderBy: [{ periodNumber: 'asc' }, { startDate: 'asc' }],
    })

    const assignments = await prisma.courseAssignment.findMany({
      where: {
        institutionId,
        academicYearId: query.yearId,
        parallelId: query.parallelId,
        isActive: true,
      },
      select: {
        id: true,
        examWeight: true,
        subject: { select: { name: true, isQualitative: true } },
        teacher: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { subject: { name: 'asc' } },
    })

    const assignmentIds = assignments.map((a) => a.id)
    const periodIds = periods.map((p) => p.id)

    const insumos = assignmentIds.length > 0
      ? await prisma.insumo.findMany({
          where: {
            institutionId,
            courseAssignmentId: { in: assignmentIds },
            academicPeriodId: { in: periodIds },
          },
          select: {
            id: true,
            courseAssignmentId: true,
            academicPeriodId: true,
            activities: {
              where: { isPublished: true },
              select: {
                id: true,
                maxScore: true,
                activityType: { select: { code: true } },
                grades: {
                  where: { institutionId, studentId: query.studentId },
                  select: { score: true },
                },
              },
            },
          },
        })
      : []

    const activitiesWithoutInsumo = assignmentIds.length > 0
      ? await prisma.activity.findMany({
          where: {
            institutionId,
            courseAssignmentId: { in: assignmentIds },
            academicPeriodId: { in: periodIds },
            isPublished: true,
            insumoId: null,
          },
          select: {
            id: true,
            courseAssignmentId: true,
            academicPeriodId: true,
            maxScore: true,
            activityType: { select: { code: true } },
            grades: {
              where: { institutionId, studentId: query.studentId },
              select: { score: true },
            },
          },
        })
      : []

    // bucket: (asignación:periodo) -> (insumoId -> actividades) para calcular por categoría
    const bucket = new Map<string, Map<string, InsumoGroupInput>>()
    const ensureGroup = (key: string, insumoId: string): InsumoGroupInput => {
      if (!bucket.has(key)) bucket.set(key, new Map())
      const groups = bucket.get(key)!
      if (!groups.has(insumoId)) groups.set(insumoId, { id: insumoId, name: insumoId, activities: [] })
      return groups.get(insumoId)!
    }
    for (const insumo of insumos) {
      const key = `${insumo.courseAssignmentId}:${insumo.academicPeriodId}`
      for (const activity of insumo.activities) {
        ensureGroup(key, insumo.id).activities.push({
          score: activity.grades[0]?.score != null ? Number(activity.grades[0].score) : null,
          maxScore: Number(activity.maxScore),
          kind: activityKind(activity.activityType.code),
        })
      }
    }
    for (const activity of activitiesWithoutInsumo) {
      const key = `${activity.courseAssignmentId}:${activity.academicPeriodId}`
      ensureGroup(key, 'no-insumo').activities.push({
        score: activity.grades[0]?.score != null ? Number(activity.grades[0].score) : null,
        maxScore: Number(activity.maxScore),
        kind: activityKind(activity.activityType.code),
      })
    }

    // Recuperaciones pedagógicas del estudiante en este año (por asignación × período)
    const [pedRecoveries, gradingCfg] = await Promise.all([
      assignmentIds.length > 0
        ? prisma.pedagogicRecovery.findMany({
            where: { institutionId, studentId: query.studentId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds } },
            select: { courseAssignmentId: true, academicPeriodId: true, score: true },
          })
        : Promise.resolve([]),
      prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } }).then(
        (i) => ((i?.settings as { gradingConfig?: { pedagogicRecovery?: { mode?: string } } } | null)?.gradingConfig?.pedagogicRecovery?.mode ?? 'replace_if_higher') as 'replace_if_higher' | 'average',
      ),
    ])
    const pedRecMap = new Map(
      pedRecoveries
        .filter((r) => r.score != null)
        .map((r) => [`${r.courseAssignmentId}:${r.academicPeriodId}`, Number(r.score)]),
    )

    // Supletorios del estudiante en el año (por asignación)
    const supletorios = await prisma.subjectRecovery.findMany({
      where: { institutionId, academicYearId: query.yearId, studentId: query.studentId, type: 'supletorio' },
      select: { courseAssignmentId: true, score: true },
    })
    const supletorioByAssignment = new Map(
      supletorios.map((r) => [r.courseAssignmentId, r.score != null ? Number(r.score) : null]),
    )

    // Escala de valor cualitativo (rangos) para traducir nota → letra.
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, settings: true },
    })
    const qualitativeValueScale: QualitativeBand[] =
      (institution?.settings as { gradingConfig?: { qualitativeValueScale?: QualitativeBand[] } } | null)
        ?.gradingConfig?.qualitativeValueScale ?? DEFAULT_QUALITATIVE_VALUE_SCALE

    const subjects = assignments.map((assignment) => {
      const isQualitative = assignment.subject.isQualitative
      const periodGrades = periods.map((period) => {
        const groups = [...(bucket.get(`${assignment.id}:${period.id}`)?.values() ?? [])]
        const s = computePeriodSummary(groups, assignment.examWeight, gradingScaleMax)
        const pedRec = pedRecMap.get(`${assignment.id}:${period.id}`) ?? null
        const effectiveTotal = applyRecovery(s.total, pedRec, gradingCfg)

        return {
          periodId: period.id,
          periodName: period.name,
          regularAvg: s.insumosBase,
          examenAvg: s.examenAvg,
          proyectoAvg: s.proyectoAvg,
          total: effectiveTotal,
          code: isQualitative ? toQualitativeCode(effectiveTotal, qualitativeValueScale) : null,
        }
      })

      const finalAverage = this.avg(periodGrades.map((p) => p.total))
      return {
        assignmentId: assignment.id,
        subjectName: assignment.subject.name,
        isQualitative,
        teacherName: assignment.teacher?.profile
          ? `${assignment.teacher.profile.firstName} ${assignment.teacher.profile.lastName}`
          : '',
        periodGrades,
        finalAverage,
        finalCode: isQualitative ? toQualitativeCode(finalAverage, qualitativeValueScale) : null,
        supletorio: supletorioByAssignment.get(assignment.id) ?? null,
        promFinal: finalAverage,
      }
    })

    const attendanceRecords = await prisma.attendanceRecord.findMany({
      where: {
        institutionId,
        studentId: query.studentId,
        // Cubrir ambos modos: por-materia (courseAssignment) y diario (parallelId)
        OR: [
          { courseAssignment: { parallelId: query.parallelId, academicYearId: query.yearId } },
          { parallelId: query.parallelId, courseAssignmentId: null },
        ],
        date: {
          gte: year.startDate,
          lte: year.endDate,
        },
      },
      select: {
        date: true,
        status: true,
      },
      orderBy: { date: 'asc' },
    })

    const dailyStatus = new Map<string, string[]>()
    for (const record of attendanceRecords) {
      const dateStr = record.date.toISOString().split('T')[0]
      if (!dailyStatus.has(dateStr)) dailyStatus.set(dateStr, [])
      dailyStatus.get(dateStr)!.push(record.status)
    }

    const attendanceByPeriod = periods.map((period) => {
      const summary = {
        periodId: period.id,
        periodName: period.name,
        justifiedAbsences: 0,
        unjustifiedAbsences: 0,
        attendedDays: 0,
        lateCount: 0,
      }

      for (const [dateStr, statuses] of dailyStatus.entries()) {
        const date = new Date(`${dateStr}T12:00:00`)
        if (date < period.startDate || date > period.endDate) continue

        if (statuses.includes('absent')) {
          summary.unjustifiedAbsences += 1
        } else if (statuses.includes('late')) {
          summary.attendedDays += 1
          summary.lateCount += 1
        } else if (statuses.includes('excused')) {
          summary.justifiedAbsences += 1
          summary.attendedDays += 1
        } else if (statuses.includes('present')) {
          summary.attendedDays += 1
        }
      }

      return summary
    })

    const behaviorGrades = await prisma.behaviorGrade.findMany({
      where: { institutionId, studentId: query.studentId, academicPeriodId: { in: periodIds } },
      select: { academicPeriodId: true, code: true, notes: true },
    })
    const behaviorByPeriodMap = new Map(behaviorGrades.map((b) => [b.academicPeriodId, b]))
    const behaviorByPeriod = periods.map((period) => {
      const b = behaviorByPeriodMap.get(period.id)
      return {
        periodId: period.id,
        periodName: period.name,
        code: b?.code ?? null,
        notes: b?.notes ?? null,
      }
    })

    // Materias académicas (cuantitativas) vs cualitativas (se muestran como letra).
    const academicSubjects = subjects.filter((s) => !s.isQualitative)
    const qualitativeSubjects = subjects.filter((s) => s.isQualitative)

    return {
      institution: institution ? { id: institution.id, name: institution.name } : null,
      academicYear: { id: year.id, name: year.name },
      parallel,
      student: enrollment.student,
      periods: periods.map((p) => ({ id: p.id, name: p.name, periodNumber: p.periodNumber })),
      subjects: academicSubjects,
      qualitativeSubjects,
      qualitativeValueScale,
      attendanceByPeriod,
      behaviorByPeriod,
      // El promedio general usa SOLO las materias cuantitativas.
      overallAverage: this.avg(academicSubjects.map((s) => s.finalAverage)),
    }
  }
}
