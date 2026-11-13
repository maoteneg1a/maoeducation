import type { Prisma } from '@prisma/client'
import { computePeriodGrades } from '../../../shared/infrastructure/services/period-grades.service'
import { applyRecovery, toQualitativeCode, type QualitativeBand } from '../../../shared/domain/grade-math'
import { formatScore, resolveAgreement } from '../../../shared/domain/agreement-rules'
import { DEFAULT_QUALITATIVE_VALUE_SCALE } from '../../reports/infrastructure/prisma-report.repository'
import { boardConfig } from '../domain/course-board-config'
import type { BoardSnapshot } from '../domain/course-board.types'

export async function buildBoardSnapshot(db: Prisma.TransactionClient, institutionId: string, parallelId: string, periodId: string): Promise<BoardSnapshot> {
  const parallel = await db.parallel.findFirstOrThrow({
    where: { id: parallelId, institutionId },
    include: { level: true, academicYear: true, tutor: { select: { profile: true } } },
  })
  const [institution, period, assignments, enrollments] = await Promise.all([
    db.institution.findUniqueOrThrow({ where: { id: institutionId }, select: { name: true, settings: true } }),
    db.academicPeriod.findFirstOrThrow({ where: { id: periodId, academicYearId: parallel.academicYearId } }),
    db.courseAssignment.findMany({
      where: { institutionId, parallelId, academicYearId: parallel.academicYearId, isActive: true },
      include: { subject: true, teacher: { select: { profile: true } } }, orderBy: [{ subject: { name: 'asc' } }, { id: 'asc' }],
    }),
    db.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId: parallel.academicYearId, status: 'active' },
      select: { student: { select: { id: true, profile: true } } },
    }),
  ])
  const cfg = boardConfig(institution.settings)
  const settings = institution.settings as { gradingConfig?: { gradingScaleMax?: number; qualitativeValueScale?: QualitativeBand[]; pedagogicRecovery?: { mode?: 'replace_if_higher' | 'average' } } }
  const grading = settings.gradingConfig ?? {}
  const studentIds = enrollments.map((e) => e.student.id)
  const assignmentIds = assignments.map((a) => a.id)
  const [summaries, recoveries, attendance, incidents, reinforcement, behavior] = await Promise.all([
    computePeriodGrades(institutionId, { assignmentIds, studentIds, periodIds: [periodId], gradingScaleMax: grading.gradingScaleMax ?? 10 }, db),
    db.pedagogicRecovery.findMany({ where: { institutionId, academicPeriodId: periodId, studentId: { in: studentIds }, courseAssignmentId: { in: assignmentIds } }, select: { studentId: true, courseAssignmentId: true, score: true } }),
    cfg.showAttendance ? db.attendanceRecord.findMany({
      where: { institutionId, studentId: { in: studentIds }, date: { gte: period.startDate, lte: period.endDate }, ...(parallel.level.attendanceMode === 'daily' ? { parallelId } : { courseAssignmentId: { in: assignmentIds } }) },
      select: { studentId: true, status: true },
    }) : [],
    cfg.showIncidents ? db.disciplinaryIncident.groupBy({ by: ['studentId'], where: { institutionId, studentId: { in: studentIds }, incidentDate: { gte: period.startDate, lte: period.endDate } }, _count: { _all: true } }) : [],
    cfg.showReinforcement ? db.reinforcementPlan.findMany({
      where: { institutionId, planType: 'academico', academicPeriodId: periodId, courseAssignmentId: { in: assignmentIds } },
      select: { id: true, studentId: true, participants: { select: { studentId: true } } },
    }) : [],
    db.behaviorGrade.findMany({ where: { institutionId, academicPeriodId: periodId, studentId: { in: studentIds } }, select: { studentId: true, code: true, notes: true } }),
  ])
  const recoveryByStudent = new Map(recoveries.map((r) => [`${r.studentId}:${r.courseAssignmentId}`, r.score == null ? null : Number(r.score)]))
  const rules = resolveAgreement(institution.settings, parallel.academicYearId)
  const name = (p: { firstName: string; lastName: string } | null) => p ? `${p.lastName} ${p.firstName}`.trim() : 'Sin nombre'
  return {
    institutionName: institution.name, parallelName: `${parallel.level.name} ${parallel.name}`,
    yearName: parallel.academicYear.name, periodName: period.name, tutorName: parallel.tutor ? name(parallel.tutor.profile) : 'Sin tutor asignado',
    generatedAt: new Date().toISOString(), config: cfg,
    subjects: assignments.map((a) => ({ id: a.id, name: a.subject.name, teacherId: a.teacherId, teacherName: name(a.teacher.profile), isQualitative: a.subject.isQualitative })),
    rows: enrollments.map(({ student }) => {
      const b = behavior.find((item) => item.studentId === student.id)
      return {
        id: student.id, name: name(student.profile), dni: student.profile?.dni ?? null,
        grades: assignments.map((a) => {
          const s = summaries.get(`${student.id}:${a.id}:${periodId}`)
          const value = applyRecovery(s?.total ?? null, recoveryByStudent.get(`${student.id}:${a.id}`) ?? null, grading.pedagogicRecovery?.mode ?? 'replace_if_higher')
          const partial = value != null && (!s || ((a.examWeight < 100 && s.insumosBase == null)
            || (a.examWeight - (a.projectWeight ?? a.examWeight / 2) > 0 && s.examenAvg == null)
            || ((a.projectWeight ?? a.examWeight / 2) > 0 && s.proyectoAvg == null)))
          const display = a.subject.isQualitative ? toQualitativeCode(value, grading.qualitativeValueScale ?? DEFAULT_QUALITATIVE_VALUE_SCALE) ?? '—' : formatScore(value, rules?.decimals)
          return { assignmentId: a.id, value, display, partial }
        }),
        // Registros de asistencia: por materia o jornada según lo que use el curso.
        absences: attendance.filter((a) => a.studentId === student.id && (a.status === 'absent' || a.status === 'excused')).length,
        late: attendance.filter((a) => a.studentId === student.id && a.status === 'late').length,
        incidents: incidents.find((i) => i.studentId === student.id)?._count._all ?? 0,
        reinforcement: reinforcement.filter((p) => p.studentId === student.id || p.participants.some((item) => item.studentId === student.id)).length,
        behavior: b?.code ?? null, observation: b?.notes ?? null,
      }
    }).sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id)),
  }
}
