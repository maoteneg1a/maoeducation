import { assertReinforcementGradesOpen } from './reinforcement-grade-lock.service'
import { prisma } from '../database/prisma'
import { ConflictError, NotFoundError } from '../../domain/errors/app.errors'
import { activityKind } from '../../domain/grade-math'
import { improvedScore, resolveAgreement } from '../../domain/agreement-rules'

/**
 * Vuelca la nota de una actividad/sesión de refuerzo en la nota ORIGINAL de la
 * actividad (Grade.reinforcementScore), con las mismas reglas que Calificaciones:
 * - Acuerdo 2026-00082-A activo: formativa → promedio con tope; sumativa →
 *   mejora directa o con refuerzo, con límites por asignatura y por año.
 * - Marco anterior: modo configurado en gradingConfig.activityGradeReinforcement.
 * `reinforcementScore = null` revierte la nota a la original.
 */
export async function applyReinforcementToGrade(params: {
  institutionId: string
  activityId: string
  studentId: string
  reinforcementScore: number | null
  gradedBy: string
}): Promise<{ score: number | null; mode: string | null }> {
  const { institutionId, activityId, studentId, reinforcementScore, gradedBy } = params
  return prisma.$transaction(async (db) => {
  const activity = await db.activity.findFirst({
    where: { id: activityId, institutionId },
    select: {
      id: true,
      maxScore: true,
      courseAssignmentId: true,
      academicPeriodId: true,
      activityType: { select: { code: true } },
      academicPeriod: { select: { isClosed: true } },
      courseAssignment: { select: { academicYearId: true } },
    },
  })
  if (!activity) throw new NotFoundError('Actividad original no encontrada')
  if (activity.academicPeriod.isClosed) throw new ConflictError('El periodo de la actividad está cerrado')
  const max = Number(activity.maxScore)
  const grade = await db.grade.findUnique({ where: { activityId_studentId: { activityId, studentId } } })
  await assertReinforcementGradesOpen(db, institutionId, [{ studentId, courseAssignmentId: activity.courseAssignmentId, academicPeriodId: activity.academicPeriodId, recordedAt: grade?.gradedAt ?? grade?.createdAt ?? new Date(8640000000000000) }])
  const base = grade ? (grade.baseScore != null ? Number(grade.baseScore) : grade.score != null ? Number(grade.score) : null) : null

  if (reinforcementScore == null) {
    if (grade && grade.reinforcementScore != null) {
      await db.grade.update({
        where: { id: grade.id },
        data: { score: base, baseScore: null, reinforcementScore: null, reinforcementMode: null, reinforcementRecordedAt: null, gradedBy },
      })
    }
    return { score: base, mode: null }
  }
  if (reinforcementScore < 0 || reinforcementScore > max) throw new ConflictError(`La nota de refuerzo debe estar entre 0 y ${max}`)
  if (base == null) throw new ConflictError('El estudiante no tiene nota inicial en la actividad original')

  const settings = ((await db.institution.findUnique({ where: { id: institutionId }, select: { settings: true } }))?.settings ?? {}) as Record<string, unknown>
  const rules = resolveAgreement(settings, activity.courseAssignment.academicYearId)
  let score: number
  let mode: string
  if (rules) {
    const summative = activityKind(activity.activityType.code) !== 'regular'
    const r = improvedScore(rules, base, reinforcementScore, summative, max)
    if (r.mode === null) throw new ConflictError('La nota inicial de esta evaluación sumativa no habilita mejora según la configuración')
    mode = `agreement_${r.mode}`
    score = r.score
    if (r.mode !== 'formative') {
      const rule = r.mode === 'direct' ? rules.summativeImprovement.direct : rules.summativeImprovement.withReinforcement
      const prior = await db.grade.findMany({
        where: {
          institutionId,
          studentId,
          reinforcementMode: mode,
          NOT: { activityId },
          activity: { courseAssignment: { academicYearId: activity.courseAssignment.academicYearId } },
        },
        select: { activity: { select: { courseAssignmentId: true } } },
      })
      const inSubject = prior.filter((p) => p.activity.courseAssignmentId === activity.courseAssignmentId).length
      if (rule.perSubject > 0 && inSubject + 1 > rule.perSubject) {
        throw new ConflictError(`Se alcanzó el máximo de ${rule.perSubject} evaluación(es) sumativa(s) mejorada(s) en esta asignatura`)
      }
      if (rule.perYear > 0 && prior.length + 1 > rule.perYear) {
        throw new ConflictError(`Se alcanzó el máximo de ${rule.perYear} evaluaciones sumativas mejoradas en el año`)
      }
    }
  } else {
    const gc = (settings.gradingConfig ?? {}) as { activityGradeReinforcement?: { mode?: 'replace' | 'average' } }
    mode = gc.activityGradeReinforcement?.mode ?? 'replace'
    score = Math.max(base, mode === 'average' ? (base + reinforcementScore) / 2 : reinforcementScore)
  }
  await db.grade.upsert({
    where: { activityId_studentId: { activityId, studentId } },
    create: {
      institutionId, activityId, studentId, score, baseScore: base, reinforcementScore,
      reinforcementMode: mode, reinforcementRecordedAt: new Date(), gradedBy, gradedAt: new Date(),
    },
    update: { score, baseScore: base, reinforcementScore, reinforcementMode: mode, reinforcementRecordedAt: new Date(), gradedBy },
  })
  return { score, mode }
  }, { timeout: 60000 })
}
