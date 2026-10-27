import { applyFormativeReinforcement } from '../../domain/formative-reinforcement'
import { loadFormativeApplications } from './formative-reinforcement.service'
import { prisma } from '../database/prisma'
import type { Prisma } from '@prisma/client'
import {
  average,
  periodTotal,
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
  params: { assignmentIds: string[]; periodIds: string[]; studentIds: string[]; gradingScaleMax: number; ignoreFormativeApplications?: boolean },
  db: Prisma.TransactionClient = prisma,
): Promise<Map<string, PeriodSummary>> {
  const { assignmentIds, periodIds, studentIds, gradingScaleMax } = params
  const out = new Map<string, PeriodSummary>()
  if (!assignmentIds.length || !periodIds.length || !studentIds.length) return out

  const assignments = await db.courseAssignment.findMany({
    where: { institutionId, id: { in: assignmentIds } },
    select: { id: true, examWeight: true, projectWeight: true },
  })
  const weights = new Map(assignments.map((a) => [a.id, a]))

  const gradeSelect = {
    where: { institutionId, studentId: { in: studentIds } },
    select: { studentId: true, score: true, baseScore: true, reinforcementScore: true, reinforcementMode: true },
  } as const

  const [insumos, standalone] = await Promise.all([
    db.insumo.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds } },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        name: true,
        courseAssignmentId: true,
        academicPeriodId: true,
        activities: {
          where: { isPublished: true },
          select: { id: true, maxScore: true, activityType: { select: { code: true } }, grades: gradeSelect },
        },
      },
    }),
    db.activity.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds }, isPublished: true, insumoId: null },
      orderBy: { id: 'asc' },
      select: { id: true, courseAssignmentId: true, academicPeriodId: true, maxScore: true, activityType: { select: { code: true } }, grades: gradeSelect },
    }),
  ])

  const bucket = new Map<string, Map<string, InsumoGroupInput>>()
  const push = (
    insumoId: string,
    insumoName: string,
    assignmentId: string,
    periodId: string,
    act: { id: string; maxScore: unknown; activityType: { code: string }; grades: Array<{ studentId: string; score: unknown; baseScore: unknown; reinforcementScore: unknown; reinforcementMode: string | null }> },
  ) => {
    const byStudent = new Map(act.grades.map((g) => [g.studentId, effectiveActivityScore(g)]))
    for (const sId of studentIds) {
      const k = `${sId}:${assignmentId}:${periodId}`
      if (!bucket.has(k)) bucket.set(k, new Map())
      const groups = bucket.get(k)!
      if (!groups.has(insumoId)) groups.set(insumoId, { id: insumoId, name: insumoName, activities: [] })
      const raw = byStudent.get(sId)
      groups.get(insumoId)!.activities.push({
        id: act.id,
        score: raw != null ? Number(raw) : null,
        maxScore: Number(act.maxScore),
        kind: activityKind(act.activityType.code),
      })
    }
  }
  for (const i of insumos) for (const a of i.activities) push(i.id, i.name, i.courseAssignmentId, i.academicPeriodId, a)
  for (const a of standalone) push('no-insumo', 'Sin insumo', a.courseAssignmentId, a.academicPeriodId, a)

  const applications = params.ignoreFormativeApplications ? new Map() : await loadFormativeApplications(institutionId, assignmentIds, periodIds, studentIds, db)
  const manual = await db.manualInsumoAverage.findMany({
    where: { institutionId, studentId: { in: studentIds }, insumo: { courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds } }, score: { not: null } },
    orderBy: { id: 'asc' },
    select: { studentId: true, insumoId: true, score: true, insumo: { select: { courseAssignmentId: true, academicPeriodId: true, name: true } } },
  })
  for (const m of manual) {
    const key = `${m.studentId}:${m.insumo.courseAssignmentId}:${m.insumo.academicPeriodId}`
    if (!bucket.has(key)) bucket.set(key, new Map())
    if (!bucket.get(key)!.has(m.insumoId)) bucket.get(key)!.set(m.insumoId, { id: m.insumoId, name: m.insumo.name, activities: [] })
  }
  for (const [k, groups] of bucket) {
    const assignmentId = k.split(':')[1]
    const w = weights.get(assignmentId)
    if (!w) continue
    let summary = computePeriodSummary([...groups.values()], w.examWeight, gradingScaleMax, w.projectWeight ?? undefined)
    const overrides = manual.filter((m) => `${m.studentId}:${m.insumo.courseAssignmentId}:${m.insumo.academicPeriodId}` === k)
    if (overrides.length) {
      summary.insumoAvgs = summary.insumoAvgs.map((i) => ({ ...i, avg: overrides.find((m) => m.insumoId === i.id)?.score != null ? Number(overrides.find((m) => m.insumoId === i.id)!.score) : i.avg }))
      summary.insumosBase = average(summary.insumoAvgs.map((i) => i.avg))
      summary.total = periodTotal(summary.insumosBase, summary.summativeAvg, w.examWeight, summary.hasSummative)
    }
    out.set(k, applyFormativeReinforcement(summary, [...groups.values()], applications.get(k), w.examWeight, gradingScaleMax))
  }
  return out
}
