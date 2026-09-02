import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  average,
  computePeriodSummary,
  applyRecovery,
  activityKind,
  type InsumoGroupInput,
} from '../../../../shared/domain/grade-math'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import type {
  EffectiveStatus,
  ParallelPromotionDto,
  PromotionStatus,
  PromotionSubjectDto,
  RecoveryType,
  SaveDecisionDto,
  SaveRecoveryDto,
  SubjectStatus,
} from '../../application/dtos/promotion.dto'

const institutionRepo = new PrismaInstitutionRepository()
const RECOVERY_TYPES: RecoveryType[] = ['supletorio', 'remedial', 'gracia']
const PROMOTION_STATUSES: PromotionStatus[] = ['promoted', 'not_promoted', 'pending']

type Promotion = ParallelPromotionDto['config']

function subjectStatus(annualAvg: number | null, p: Promotion): SubjectStatus {
  if (annualAvg == null) return 'pending'
  if (annualAvg >= p.minToPass) return 'approved'
  if (annualAvg >= p.supletorioMin) return 'supletorio'
  return 'remedial'
}

function effectiveStatus(
  status: SubjectStatus,
  recovery: { score: number } | null,
  p: Promotion,
): EffectiveStatus {
  if (status === 'approved') return 'passed'
  if (status === 'pending') return 'pending'
  // supletorio | remedial → requiere recuperación
  if (!recovery) return 'recovery_pending'
  return recovery.score >= p.passWithExam ? 'passed' : 'failed'
}

export class PrismaPromotionRepository {
  async getParallelPromotion(
    institutionId: string,
    parallelId: string,
    yearId: string,
  ): Promise<ParallelPromotionDto> {
    const parallel = await prisma.parallel.findFirst({
      where: { id: parallelId, institutionId, academicYearId: yearId },
      select: { id: true, name: true, level: { select: { name: true } } },
    })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    const year = await prisma.academicYear.findFirst({
      where: { id: yearId, institutionId },
      select: { id: true, name: true },
    })
    if (!year) throw new NotFoundError('Año lectivo no encontrado')

    const gradingConfig = await institutionRepo.getGradingConfig(institutionId)
    const config = gradingConfig.promotion
    const gradingScaleMax = gradingConfig.gradingScaleMax

    const periods = await prisma.academicPeriod.findMany({
      where: { academicYearId: yearId },
      select: { id: true, isClosed: true },
      orderBy: [{ periodNumber: 'asc' }, { startDate: 'asc' }],
    })
    const periodIds = periods.map((p) => p.id)
    const periodsClosed = periods.filter((p) => p.isClosed).length
    const recoveryEnabled = periods.length > 0 && periodsClosed === periods.length

    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId: yearId, status: 'active' },
      include: { student: { include: { profile: { select: { firstName: true, lastName: true } } } } },
    })
    const studentIds = enrollments.map((e) => e.studentId)

    const assignments = await prisma.courseAssignment.findMany({
      where: { institutionId, parallelId, academicYearId: yearId, isActive: true },
      select: { id: true, examWeight: true, subject: { select: { name: true } } },
      orderBy: { subject: { name: 'asc' } },
    })
    const assignmentIds = assignments.map((a) => a.id)

    // Notas por (alumno, asignación, periodo) → grupos por insumo (cálculo por categoría)
    const bucket = new Map<string, Map<string, InsumoGroupInput>>()
    const key = (s: string, a: string, p: string) => `${s}:${a}:${p}`
    const ensureGroup = (s: string, a: string, p: string, insumoId: string): InsumoGroupInput => {
      const k = key(s, a, p)
      if (!bucket.has(k)) bucket.set(k, new Map())
      const groups = bucket.get(k)!
      if (!groups.has(insumoId)) groups.set(insumoId, { id: insumoId, name: insumoId, activities: [] })
      return groups.get(insumoId)!
    }

    if (assignmentIds.length > 0 && studentIds.length > 0 && periodIds.length > 0) {
      const insumos = await prisma.insumo.findMany({
        where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds } },
        select: {
          id: true,
          courseAssignmentId: true,
          academicPeriodId: true,
          activities: {
            where: { isPublished: true },
            select: {
              maxScore: true,
              activityType: { select: { code: true } },
              grades: { where: { institutionId, studentId: { in: studentIds } }, select: { studentId: true, score: true } },
            },
          },
        },
      })
      const standalone = await prisma.activity.findMany({
        where: {
          institutionId,
          courseAssignmentId: { in: assignmentIds },
          academicPeriodId: { in: periodIds },
          isPublished: true,
          insumoId: null,
        },
        select: {
          courseAssignmentId: true,
          academicPeriodId: true,
          maxScore: true,
          activityType: { select: { code: true } },
          grades: { where: { institutionId, studentId: { in: studentIds } }, select: { studentId: true, score: true } },
        },
      })

      const consume = (
        rows: Array<{
          insumoId: string
          courseAssignmentId: string
          academicPeriodId: string
          maxScore: unknown
          activityType: { code: string }
          grades: Array<{ studentId: string; score: unknown }>
        }>,
      ) => {
        for (const act of rows) {
          const gradeByStudent = new Map(act.grades.map((g) => [g.studentId, g.score]))
          for (const sId of studentIds) {
            const raw = gradeByStudent.get(sId)
            const score = raw != null ? Number(raw) : null
            ensureGroup(sId, act.courseAssignmentId, act.academicPeriodId, act.insumoId).activities.push({
              score,
              maxScore: Number(act.maxScore),
              kind: activityKind(act.activityType.code),
            })
          }
        }
      }
      consume(insumos.flatMap((i) => i.activities.map((a) => ({
        insumoId: i.id,
        courseAssignmentId: i.courseAssignmentId,
        academicPeriodId: i.academicPeriodId,
        maxScore: a.maxScore,
        activityType: a.activityType,
        grades: a.grades,
      }))))
      consume(standalone.map((a) => ({ insumoId: 'no-insumo', ...a })))
    }

    // Recuperaciones pedagógicas (intra-trimestrales) — ajustan el total del período
    const pedRecoveries = await prisma.pedagogicRecovery.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, academicPeriodId: { in: periodIds }, studentId: { in: studentIds } },
      select: { studentId: true, courseAssignmentId: true, academicPeriodId: true, score: true },
    })
    const fullConfig = await institutionRepo.getGradingConfig(institutionId)
    const pedRecoveryMode = fullConfig.pedagogicRecovery?.mode ?? 'replace_if_higher'
    const pedRecMap = new Map(
      pedRecoveries
        .filter((r) => r.score != null)
        .map((r) => [`${r.studentId}:${r.courseAssignmentId}:${r.academicPeriodId}`, Number(r.score)]),
    )

    const recoveries = await prisma.subjectRecovery.findMany({
      where: { institutionId, academicYearId: yearId, studentId: { in: studentIds } },
      select: { studentId: true, courseAssignmentId: true, type: true, score: true },
    })
    const recoveryByKey = new Map(recoveries.map((r) => [`${r.studentId}:${r.courseAssignmentId}`, r]))

    const decisions = await prisma.promotionDecision.findMany({
      where: { institutionId, academicYearId: yearId, studentId: { in: studentIds } },
      select: { studentId: true, status: true, notes: true },
    })
    const decisionByStudent = new Map(decisions.map((d) => [d.studentId, d]))

    const students = enrollments
      .map((e) => {
        const sId = e.studentId
        const profile = e.student.profile
        const studentName = profile ? `${profile.lastName} ${profile.firstName}` : e.student.email

        const subjects: PromotionSubjectDto[] = assignments.map((a) => {
          const annualByPeriod = periodIds.map((pId) => {
            const groups = bucket.get(key(sId, a.id, pId))
            if (!groups) return null
            const rawTotal = computePeriodSummary([...groups.values()], a.examWeight, gradingScaleMax).total
            const pedRec = pedRecMap.get(`${sId}:${a.id}:${pId}`) ?? null
            return applyRecovery(rawTotal, pedRec, pedRecoveryMode)
          })
          const annualAvg = average(annualByPeriod)
          const status = subjectStatus(annualAvg, config)
          const rec = recoveryByKey.get(`${sId}:${a.id}`)
          const recovery = rec
            ? { type: rec.type as RecoveryType, score: Number(rec.score) }
            : null
          return {
            assignmentId: a.id,
            subjectName: a.subject.name,
            annualAvg,
            status,
            recovery,
            effectiveStatus: effectiveStatus(status, recovery, config),
          }
        })

        const failedCount = subjects.filter((s) => s.effectiveStatus === 'failed').length
        const hasPending = subjects.some(
          (s) => s.effectiveStatus === 'pending' || s.effectiveStatus === 'recovery_pending',
        )
        const suggestedStatus: PromotionStatus = hasPending
          ? 'pending'
          : failedCount === 0
            ? 'promoted'
            : 'not_promoted'

        const decision = decisionByStudent.get(sId)
        return {
          studentId: sId,
          studentName,
          subjects,
          failedCount,
          suggestedStatus,
          decision: decision ? { status: decision.status as PromotionStatus, notes: decision.notes } : null,
        }
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName))

    return {
      parallel,
      year,
      config,
      subjects: assignments.map((a) => ({ assignmentId: a.id, subjectName: a.subject.name })),
      students,
      periodsTotal: periods.length,
      periodsClosed,
      recoveryEnabled,
    }
  }

  async saveRecovery(institutionId: string, dto: SaveRecoveryDto, recordedBy: string) {
    if (!RECOVERY_TYPES.includes(dto.type)) throw new BadRequestError('Tipo de recuperación inválido')

    // La recuperación es un proceso de fin de año: solo se habilita con todos los periodos cerrados.
    const periods = await prisma.academicPeriod.findMany({
      where: { academicYearId: dto.academicYearId, academicYear: { institutionId } },
      select: { isClosed: true },
    })
    if (periods.length === 0 || periods.some((p) => !p.isClosed)) {
      throw new ConflictError('Las recuperaciones se habilitan al cerrar todos los periodos del año')
    }

    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId, academicYearId: dto.academicYearId },
      select: { id: true },
    })
    if (!assignment) throw new NotFoundError('Asignación no encontrada')

    if (dto.score == null) {
      await prisma.subjectRecovery.deleteMany({
        where: {
          institutionId,
          studentId: dto.studentId,
          courseAssignmentId: dto.courseAssignmentId,
          academicYearId: dto.academicYearId,
        },
      })
      return { ok: true }
    }

    const gradingScaleMax = (await institutionRepo.getGradingConfig(institutionId)).gradingScaleMax
    if (dto.score < 0 || dto.score > gradingScaleMax) {
      throw new BadRequestError(`La nota debe estar entre 0 y ${gradingScaleMax}`)
    }

    await prisma.subjectRecovery.upsert({
      where: {
        studentId_courseAssignmentId_academicYearId: {
          studentId: dto.studentId,
          courseAssignmentId: dto.courseAssignmentId,
          academicYearId: dto.academicYearId,
        },
      },
      update: { type: dto.type, score: dto.score, recordedBy },
      create: {
        institutionId,
        studentId: dto.studentId,
        courseAssignmentId: dto.courseAssignmentId,
        academicYearId: dto.academicYearId,
        type: dto.type,
        score: dto.score,
        recordedBy,
      },
    })
    return { ok: true }
  }

  async saveDecision(institutionId: string, dto: SaveDecisionDto, decidedBy: string) {
    if (!PROMOTION_STATUSES.includes(dto.status)) throw new BadRequestError('Estado de promoción inválido')

    const year = await prisma.academicYear.findFirst({
      where: { id: dto.academicYearId, institutionId },
      select: { id: true },
    })
    if (!year) throw new NotFoundError('Año lectivo no encontrado')

    await prisma.promotionDecision.upsert({
      where: {
        studentId_academicYearId: { studentId: dto.studentId, academicYearId: dto.academicYearId },
      },
      update: { status: dto.status, notes: dto.notes ?? null, decidedBy },
      create: {
        institutionId,
        studentId: dto.studentId,
        academicYearId: dto.academicYearId,
        status: dto.status,
        notes: dto.notes ?? null,
        decidedBy,
      },
    })
    return { ok: true }
  }
}
