import { prisma } from '../database/prisma'
import {
  activityKind,
  computePeriodSummary,
  effectiveActivityScore,
  type InsumoGroupInput,
  type PeriodSummary,
} from '../../domain/grade-math'

/**
 * Resumen del periodo por estudiante × asignación × periodo con el motor de
 * notas canónico (mismas reglas que boletín y promoción). Sin destrezas ni
 * planificación: solo insumos, actividades publicadas y notas.
 *
 * Clave del mapa: `${studentId}:${courseAssignmentId}:${academicPeriodId}`.
 */
export async function computePeriodGrades(
  institutionId: string,
  params: { assignmentIds: string[]; periodIds: string[]; studentIds: string[]; gradingScaleMax: number },
): Promise<Map<string, PeriodSummary>> {
  const { assignmentIds, periodIds, studentIds, gradingScaleMax } = params
  const out = new Map<string, PeriodSummary>()
  if (!assignmentIds.length || !periodIds.length || !studentIds.length) return out

  const assignments = await prisma.courseAssignment.findMany({
    where: { institutionId, id: { in: assignmentIds } },
    select: { id: true, examWeight: true, projectWeight: true },
  })
  const weights = new Map(assignments.map((a) => [a.id, a]))

  const gradeSelect = {
    where: { institutionId, studentId: { in: studentIds } },
    select: { studentId: true, score: true, baseScore: true, reinforcementScore: true, reinforcementMode: true },
  } as const

  const [insumos, standalone] = await Promise.all([
    prisma.insumo.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds } },
      select: {
        id: true,
        name: true,
        courseAssignmentId: true,
        academicPeriodId: true,
        activities: {
          where: { isPublished: true },
          select: { maxScore: true, activityType: { select: { code: true } }, grades: gradeSelect },
        },
      },
    }),
    prisma.activity.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds }, isPublished: true, insumoId: null },
      select: { courseAssignmentId: true, academicPeriodId: true, maxScore: true, activityType: { select: { code: true } }, grades: gradeSelect },
    }),
  ])

  const bucket = new Map<string, Map<string, InsumoGroupInput>>()
  const push = (
    insumoId: string,
    insumoName: string,
    assignmentId: string,
    periodId: string,
    act: { maxScore: unknown; activityType: { code: string }; grades: Array<{ studentId: string; score: unknown; baseScore: unknown; reinforcementScore: unknown; reinforcementMode: string | null }> },
  ) => {
    const byStudent = new Map(act.grades.map((g) => [g.studentId, effectiveActivityScore(g)]))
    for (const sId of studentIds) {
      const k = `${sId}:${assignmentId}:${periodId}`
      if (!bucket.has(k)) bucket.set(k, new Map())
      const groups = bucket.get(k)!
      if (!groups.has(insumoId)) groups.set(insumoId, { id: insumoId, name: insumoName, activities: [] })
      const raw = byStudent.get(sId)
      groups.get(insumoId)!.activities.push({
        score: raw != null ? Number(raw) : null,
        maxScore: Number(act.maxScore),
        kind: activityKind(act.activityType.code),
      })
    }
  }
  for (const i of insumos) for (const a of i.activities) push(i.id, i.name, i.courseAssignmentId, i.academicPeriodId, a)
  for (const a of standalone) push('no-insumo', 'Sin insumo', a.courseAssignmentId, a.academicPeriodId, a)

  for (const [k, groups] of bucket) {
    const assignmentId = k.split(':')[1]
    const w = weights.get(assignmentId)
    if (!w) continue
    out.set(k, computePeriodSummary([...groups.values()], w.examWeight, gradingScaleMax, w.projectWeight ?? undefined))
  }
  return out
}
