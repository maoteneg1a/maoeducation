import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import {
  computePeriodSummary,
  applyRecovery,
  activityKind,
  type InsumoGroupInput,
} from '../../../../shared/domain/grade-math'
import type {
  CreateReinforcementPlanDto,
  ListReinforcementPlansQuery,
  PedagogicRecoveryPageDto,
  PedagogicRecoveryQuery,
  SavePedagogicRecoveryDto,
  SkillReinforcementCandidate,
  SkillReinforcementQuery,
  UpdateReinforcementPlanDto,
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

  /**
   * Detección automática de candidatos a refuerzo por destreza: agrupa las notas
   * (Grade) de las actividades vinculadas a cada CurriculumSkill dentro del periodo,
   * calcula el promedio por estudiante y devuelve quienes quedan bajo el umbral de
   * aprobación configurado. Puro cálculo — no crea nada, el docente decide qué hacer.
   */
  async getSkillReinforcementCandidates(
    institutionId: string,
    query: SkillReinforcementQuery,
  ): Promise<SkillReinforcementCandidate[]> {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: query.courseAssignmentId, institutionId },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')

    const institutionRepo = new PrismaInstitutionRepository()
    const gc = await institutionRepo.getGradingConfig(institutionId)
    const passingGrade = gc.promotion.minToPass

    const activities = await prisma.activity.findMany({
      where: {
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.academicPeriodId,
        curriculumSkillId: { not: null },
      },
      select: {
        id: true,
        curriculumSkillId: true,
        curriculumSkill: { select: { code: true, description: true } },
        grades: { select: { studentId: true, score: true, isExcused: true } },
      },
    })

    // agrupa por destreza -> studentId -> [scores]
    const bySkill = new Map<
      string,
      { code: string; description: string; scoresByStudent: Map<string, number[]> }
    >()

    for (const activity of activities) {
      const skillId = activity.curriculumSkillId
      if (!skillId || !activity.curriculumSkill) continue
      if (!bySkill.has(skillId)) {
        bySkill.set(skillId, {
          code: activity.curriculumSkill.code,
          description: activity.curriculumSkill.description,
          scoresByStudent: new Map(),
        })
      }
      const entry = bySkill.get(skillId)!
      for (const grade of activity.grades) {
        if (grade.isExcused || grade.score == null) continue
        const list = entry.scoresByStudent.get(grade.studentId) ?? []
        list.push(Number(grade.score))
        entry.scoresByStudent.set(grade.studentId, list)
      }
    }

    const studentIds = new Set<string>()
    for (const entry of bySkill.values()) for (const id of entry.scoresByStudent.keys()) studentIds.add(id)
    const students = studentIds.size
      ? await prisma.user.findMany({
          where: { id: { in: Array.from(studentIds) } },
          select: { id: true, profile: { select: { firstName: true, lastName: true } } },
        })
      : []
    const nameById = new Map(
      students.map((s) => [s.id, s.profile ? `${s.profile.firstName} ${s.profile.lastName}` : s.id]),
    )

    const candidates: SkillReinforcementCandidate[] = []
    for (const [skillId, entry] of bySkill) {
      const below: { studentId: string; studentName: string; average: number }[] = []
      for (const [studentId, scores] of entry.scoresByStudent) {
        const average = scores.reduce((a, b) => a + b, 0) / scores.length
        if (average < passingGrade) {
          below.push({ studentId, studentName: nameById.get(studentId) ?? studentId, average: Math.round(average * 100) / 100 })
        }
      }
      if (below.length > 0) {
        candidates.push({
          curriculumSkillId: skillId,
          skillCode: entry.code,
          skillDescription: entry.description,
          passingGrade,
          students: below.sort((a, b) => a.average - b.average),
        })
      }
    }

    return candidates.sort((a, b) => a.skillCode.localeCompare(b.skillCode))
  }

  // ─── Plan de Refuerzo Académico Individualizado ────────────────────────
  private static REINFORCEMENT_PLAN_INCLUDE = {
    student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    skills: { include: { curriculumSkill: { select: { id: true, code: true, description: true } } } },
  }

  async listReinforcementPlans(institutionId: string, query: ListReinforcementPlansQuery) {
    return prisma.reinforcementPlan.findMany({
      where: {
        institutionId,
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.academicPeriodId,
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_PLAN_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  async getReinforcementPlan(id: string, institutionId: string) {
    const plan = await prisma.reinforcementPlan.findFirst({
      where: { id, institutionId },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_PLAN_INCLUDE,
    })
    if (!plan) throw new NotFoundError('Plan de refuerzo no encontrado')
    return plan
  }

  async createReinforcementPlan(institutionId: string, actorId: string, dto: CreateReinforcementPlanDto) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')

    const existing = await prisma.reinforcementPlan.findUnique({
      where: {
        studentId_courseAssignmentId_academicPeriodId: {
          studentId: dto.studentId,
          courseAssignmentId: dto.courseAssignmentId,
          academicPeriodId: dto.academicPeriodId,
        },
      },
    })
    if (existing) throw new BadRequestError('Ya existe un plan de refuerzo para este estudiante en este periodo')

    if (dto.skills?.length) {
      await assertSkillsArePlanned(dto.courseAssignmentId, dto.academicPeriodId, dto.skills.map((s) => s.curriculumSkillId))
    }

    return prisma.reinforcementPlan.create({
      data: {
        institutionId,
        studentId: dto.studentId,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        planType: dto.planType,
        objetivoGeneral: dto.objetivoGeneral,
        estrategias: dto.estrategias,
        responsables: dto.responsables,
        fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : null,
        fechaSeguimiento: dto.fechaSeguimiento ? new Date(dto.fechaSeguimiento) : null,
        createdBy: actorId,
        skills: dto.skills?.length
          ? {
              create: dto.skills.map((s) => ({
                curriculumSkillId: s.curriculumSkillId,
                averageAtDetection: s.averageAtDetection ?? null,
                notes: s.notes,
              })),
            }
          : undefined,
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_PLAN_INCLUDE,
    })
  }

  async updateReinforcementPlan(id: string, institutionId: string, dto: UpdateReinforcementPlanDto) {
    const plan = await prisma.reinforcementPlan.findFirst({ where: { id, institutionId } })
    if (!plan) throw new NotFoundError('Plan de refuerzo no encontrado')

    if (dto.skills?.length) {
      await assertSkillsArePlanned(plan.courseAssignmentId, plan.academicPeriodId, dto.skills.map((s) => s.curriculumSkillId))
    }

    if (dto.skills) {
      await prisma.reinforcementPlanSkill.deleteMany({ where: { planId: id } })
      if (dto.skills.length) {
        await prisma.reinforcementPlanSkill.createMany({
          data: dto.skills.map((s) => ({
            planId: id,
            curriculumSkillId: s.curriculumSkillId,
            averageAtDetection: s.averageAtDetection ?? null,
            notes: s.notes,
          })),
        })
      }
    }

    return prisma.reinforcementPlan.update({
      where: { id },
      data: {
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.objetivoGeneral !== undefined && { objetivoGeneral: dto.objetivoGeneral }),
        ...(dto.estrategias !== undefined && { estrategias: dto.estrategias }),
        ...(dto.responsables !== undefined && { responsables: dto.responsables }),
        ...(dto.fechaInicio !== undefined && { fechaInicio: dto.fechaInicio ? new Date(dto.fechaInicio) : null }),
        ...(dto.fechaSeguimiento !== undefined && {
          fechaSeguimiento: dto.fechaSeguimiento ? new Date(dto.fechaSeguimiento) : null,
        }),
        ...(dto.observacionesFinales !== undefined && { observacionesFinales: dto.observacionesFinales }),
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_PLAN_INCLUDE,
    })
  }

  /** Junta los datos necesarios para renderizar el PDF del plan de refuerzo. */
  async getReinforcementPlanPdfData(id: string, institutionId: string) {
    const plan = await prisma.reinforcementPlan.findFirst({
      where: { id, institutionId },
      include: {
        student: { include: { profile: true } },
        courseAssignment: {
          include: {
            teacher: { include: { profile: true } },
            subject: true,
            parallel: { include: { level: true } },
          },
        },
        academicPeriod: true,
        skills: { include: { curriculumSkill: true } },
        creator: { include: { profile: true } },
      },
    })
    if (!plan) throw new NotFoundError('Plan de refuerzo no encontrado')

    const institution = await prisma.institution.findUnique({ where: { id: institutionId } })
    const settings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }

    // Representante primario del estudiante (si tiene uno) — para la fila de firma de familia.
    const guardianLink = await prisma.guardianStudent.findFirst({
      where: { studentId: plan.studentId, isPrimary: true },
      include: { guardian: { include: { profile: true } } },
    })

    return {
      institutionName: institution?.name ?? '',
      logoUrl: settings.branding?.logoUrl ?? null,
      studentName: plan.student.profile ? `${plan.student.profile.firstName} ${plan.student.profile.lastName}` : '',
      studentDni: plan.student.profile?.dni ?? null,
      teacherName: plan.courseAssignment.teacher.profile
        ? `${plan.courseAssignment.teacher.profile.firstName} ${plan.courseAssignment.teacher.profile.lastName}`
        : '',
      subjectName: plan.courseAssignment.subject.name,
      levelName: plan.courseAssignment.parallel.level.name,
      parallelName: plan.courseAssignment.parallel.name,
      periodName: plan.academicPeriod.name,
      planType: plan.planType as 'academico' | 'nee',
      status: plan.status,
      objetivoGeneral: plan.objetivoGeneral,
      estrategias: plan.estrategias,
      responsables: plan.responsables,
      fechaInicio: plan.fechaInicio,
      fechaSeguimiento: plan.fechaSeguimiento,
      observacionesFinales: plan.observacionesFinales,
      skills: plan.skills.map((s) => ({
        code: s.curriculumSkill.code,
        description: s.curriculumSkill.description,
        averageAtDetection: s.averageAtDetection ? Number(s.averageAtDetection) : null,
        notes: s.notes,
      })),
      guardianName: guardianLink?.guardian.profile
        ? `${guardianLink.guardian.profile.firstName} ${guardianLink.guardian.profile.lastName}`
        : null,
    }
  }
}
