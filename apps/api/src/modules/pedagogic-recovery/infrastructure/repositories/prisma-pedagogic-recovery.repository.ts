import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import {
  computePeriodSummary,
  applyRecovery,
  activityKind,
  type InsumoGroupInput,
} from '../../../../shared/domain/grade-math'
import type {
  PedagogicRecoveryPageDto,
  PedagogicRecoveryQuery,
  SavePedagogicRecoveryDto,
} from '../../application/dtos/pedagogic-recovery.dto'

const institutionRepo = new PrismaInstitutionRepository()

export class PrismaPedagogicRecoveryRepository {
  async getPage(
    institutionId: string,
    query: PedagogicRecoveryQuery,
  ): Promise<PedagogicRecoveryPageDto> {
    const parallel = await prisma.parallel.findFirst({
      where: { id: query.parallelId, institutionId, academicYearId: query.yearId },
      select: { id: true, name: true, level: { select: { name: true } } },
    })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    const period = await prisma.academicPeriod.findFirst({
      where: { id: query.periodId, academicYearId: query.yearId },
      select: { id: true, name: true, isClosed: true },
    })
    if (!period) throw new NotFoundError('Período no encontrado')

    const gc = await institutionRepo.getGradingConfig(institutionId)
    const recoveryMode = gc.pedagogicRecovery.mode
    const passingGrade = gc.promotion.minToPass
    const gradingScaleMax = gc.gradingScaleMax

    const [enrollments, assignments] = await Promise.all([
      prisma.studentEnrollment.findMany({
        where: { institutionId, parallelId: query.parallelId, academicYearId: query.yearId, status: 'active' },
        include: { student: { include: { profile: { select: { firstName: true, lastName: true } } } } },
        orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }],
      }),
      prisma.courseAssignment.findMany({
        where: { institutionId, parallelId: query.parallelId, academicYearId: query.yearId, isActive: true },
        select: { id: true, examWeight: true, subject: { select: { name: true } } },
        orderBy: { subject: { name: 'asc' } },
      }),
    ])

    const studentIds = enrollments.map((e) => e.studentId)
    const assignmentIds = assignments.map((a) => a.id)

    // ── Calcular totales del período ──────────────────────────────────────
    const bucket = new Map<string, Map<string, InsumoGroupInput>>()
    const key = (s: string, a: string) => `${s}:${a}`
    const ensureGroup = (s: string, a: string, insumoId: string): InsumoGroupInput => {
      const k = key(s, a)
      if (!bucket.has(k)) bucket.set(k, new Map())
      const groups = bucket.get(k)!
      if (!groups.has(insumoId)) groups.set(insumoId, { id: insumoId, name: insumoId, activities: [] })
      return groups.get(insumoId)!
    }

    if (assignmentIds.length > 0 && studentIds.length > 0) {
      const [insumos, standalone] = await Promise.all([
        prisma.insumo.findMany({
          where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: query.periodId },
          select: {
            id: true,
            courseAssignmentId: true,
            activities: {
              where: { isPublished: true },
              select: {
                maxScore: true,
                activityType: { select: { code: true } },
                grades: { where: { institutionId, studentId: { in: studentIds } }, select: { studentId: true, score: true } },
              },
            },
          },
        }),
        prisma.activity.findMany({
          where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: query.periodId, isPublished: true, insumoId: null },
          select: {
            courseAssignmentId: true,
            maxScore: true,
            activityType: { select: { code: true } },
            grades: { where: { institutionId, studentId: { in: studentIds } }, select: { studentId: true, score: true } },
          },
        }),
      ])

      const consume = (rows: Array<{ insumoId: string; courseAssignmentId: string; maxScore: unknown; activityType: { code: string }; grades: Array<{ studentId: string; score: unknown }> }>) => {
        for (const act of rows) {
          const gradeMap = new Map(act.grades.map((g) => [g.studentId, g.score]))
          for (const sId of studentIds) {
            const raw = gradeMap.get(sId)
            const score = raw != null ? Number(raw) : null
            ensureGroup(sId, act.courseAssignmentId, act.insumoId).activities.push({
              score,
              maxScore: Number(act.maxScore),
              kind: activityKind(act.activityType.code),
            })
          }
        }
      }
      consume(insumos.flatMap((i) => i.activities.map((a) => ({ insumoId: i.id, courseAssignmentId: i.courseAssignmentId, ...a }))))
      consume(standalone.map((a) => ({ insumoId: 'no-insumo', ...a })))
    }

    // ── Recuperaciones existentes ─────────────────────────────────────────
    const pedRecoveries = await prisma.pedagogicRecovery.findMany({
      where: { institutionId, academicPeriodId: query.periodId, studentId: { in: studentIds }, courseAssignmentId: { in: assignmentIds } },
      select: { studentId: true, courseAssignmentId: true, score: true, notes: true },
    })
    const recMap = new Map(pedRecoveries.map((r) => [`${r.studentId}:${r.courseAssignmentId}`, r]))

    // ── Armar resultado ───────────────────────────────────────────────────
    const subjects = assignments.map((a) => {
      const students = enrollments.map((e) => {
        const sId = e.studentId
        const profile = e.student.profile
        const studentName = profile ? `${profile.lastName} ${profile.firstName}` : e.student.email

        const groups = bucket.get(key(sId, a.id))
        const periodTotal = groups
          ? computePeriodSummary([...groups.values()], a.examWeight, gradingScaleMax).total
          : null
        const rec = recMap.get(`${sId}:${a.id}`)
        const recoveryScore = rec?.score != null ? Number(rec.score) : null
        const effectiveTotal = applyRecovery(periodTotal, recoveryScore, recoveryMode)

        return {
          studentId: sId,
          studentName,
          periodTotal,
          recoveryScore,
          effectiveTotal,
          recovered: recoveryScore !== null && effectiveTotal !== periodTotal,
        }
      })
      return { assignmentId: a.id, subjectName: a.subject.name, students }
    })

    return { parallel, period, recoveryMode, passingGrade, subjects }
  }

  async save(institutionId: string, dto: SavePedagogicRecoveryDto, recordedBy: string) {
    const period = await prisma.academicPeriod.findFirst({
      where: { id: dto.academicPeriodId },
      select: { id: true },
    })
    if (!period) throw new NotFoundError('Período no encontrado')

    if (dto.score == null) {
      await prisma.pedagogicRecovery.deleteMany({
        where: { institutionId, studentId: dto.studentId, courseAssignmentId: dto.courseAssignmentId, academicPeriodId: dto.academicPeriodId },
      })
      return { ok: true }
    }

    const gradingScaleMax = (await institutionRepo.getGradingConfig(institutionId)).gradingScaleMax
    if (dto.score < 0 || dto.score > gradingScaleMax) {
      throw new BadRequestError(`La nota debe estar entre 0 y ${gradingScaleMax}`)
    }

    await prisma.pedagogicRecovery.upsert({
      where: { studentId_courseAssignmentId_academicPeriodId: { studentId: dto.studentId, courseAssignmentId: dto.courseAssignmentId, academicPeriodId: dto.academicPeriodId } },
      update: { score: dto.score, notes: dto.notes ?? null, recordedBy },
      create: { institutionId, studentId: dto.studentId, courseAssignmentId: dto.courseAssignmentId, academicPeriodId: dto.academicPeriodId, score: dto.score, notes: dto.notes ?? null, recordedBy },
    })
    return { ok: true }
  }
}
