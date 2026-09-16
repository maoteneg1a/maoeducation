import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned, assertCompetenciesArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import { PrismaInstitutionRepository } from '../../../institution/infrastructure/repositories/prisma-institution.repository'
import {
  computePeriodSummary,
  applyRecovery,
  activityKind,
  type InsumoGroupInput,
} from '../../../../shared/domain/grade-math'
import {
  DETECTION_SOURCES,
  PEDAGOGICAL_NEEDS,
  COMMUNICATION_MEDIA,
  COMMITMENT_TYPES,
  NEED_PROPOSALS,
  catalogLabel,
} from '../../../../shared/domain/reinforcement-catalog'
import {
  assertTransition,
  suggestCommunicationText,
  durationFrequencyText,
  naturalText,
  naturalEvidence,
  PERSISTENT_DIFFICULTY_SUGGESTION,
  type ReinforcementStatus,
} from '../../../../shared/domain/reinforcement-domain'
import { generateReinforcementPlan } from '../../../../shared/domain/reinforcement-planning-engine'
import type {
  CreateReinforcementPlanDto,
  ListReinforcementPlansQuery,
  PedagogicRecoveryPageDto,
  PedagogicRecoveryQuery,
  SavePedagogicRecoveryDto,
  SkillReinforcementCandidate,
  SkillReinforcementQuery,
  UpdateReinforcementPlanDto,
  CreateReinforcementCaseDto,
  EditReinforcementProposalDto,
  AddReinforcementCommunicationDto,
  AddReinforcementCommitmentDto,
  AddReinforcementFollowUpDto,
  ReevaluateReinforcementCaseDto,
  ConfirmReinforcementOutcomeDto,
  CreateNextReinforcementCycleDto,
} from '../../application/dtos/pedagogic-recovery.dto'

const institutionRepo = new PrismaInstitutionRepository()

function labelOrBadRequest(catalog: Record<string, string>, code: string, fieldName: string): string {
  try {
    return catalogLabel(catalog, code)
  } catch {
    throw new BadRequestError(`Código inválido para ${fieldName}: ${code}`)
  }
}

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

    const [skillActivities, competencyActivities] = await Promise.all([
      prisma.activity.findMany({
        where: {
          courseAssignmentId: query.courseAssignmentId,
          academicPeriodId: query.academicPeriodId,
          curriculumSkillId: { not: null },
        },
        select: {
          curriculumSkillId: true,
          curriculumSkill: { select: { code: true, description: true } },
          grades: { select: { studentId: true, score: true, isExcused: true } },
        },
      }),
      prisma.activity.findMany({
        where: {
          courseAssignmentId: query.courseAssignmentId,
          academicPeriodId: query.academicPeriodId,
          competencyId: { not: null },
        },
        select: {
          competencyId: true,
          competency: { select: { code: true, text: true } },
          grades: { select: { studentId: true, score: true, isExcused: true } },
        },
      }),
    ])

    // agrupa por destreza/competencia -> studentId -> [scores]
    const byItem = new Map<
      string,
      { code: string; description: string; kind: 'skill' | 'competency'; scoresByStudent: Map<string, number[]> }
    >()

    const accumulate = (
      itemId: string | null,
      code: string | undefined,
      description: string | undefined,
      kind: 'skill' | 'competency',
      grades: { studentId: string; score: unknown; isExcused: boolean }[],
    ) => {
      if (!itemId || !code) return
      if (!byItem.has(itemId)) {
        byItem.set(itemId, { code, description: description ?? '', kind, scoresByStudent: new Map() })
      }
      const entry = byItem.get(itemId)!
      for (const grade of grades) {
        if (grade.isExcused || grade.score == null) continue
        const list = entry.scoresByStudent.get(grade.studentId) ?? []
        list.push(Number(grade.score))
        entry.scoresByStudent.set(grade.studentId, list)
      }
    }

    for (const activity of skillActivities) {
      accumulate(activity.curriculumSkillId, activity.curriculumSkill?.code, activity.curriculumSkill?.description, 'skill', activity.grades)
    }
    for (const activity of competencyActivities) {
      accumulate(activity.competencyId, activity.competency?.code, activity.competency?.text, 'competency', activity.grades)
    }

    const studentIds = new Set<string>()
    for (const entry of byItem.values()) for (const id of entry.scoresByStudent.keys()) studentIds.add(id)
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
    for (const [itemId, entry] of byItem) {
      const below: { studentId: string; studentName: string; average: number }[] = []
      for (const [studentId, scores] of entry.scoresByStudent) {
        const average = scores.reduce((a, b) => a + b, 0) / scores.length
        if (average < passingGrade) {
          below.push({ studentId, studentName: nameById.get(studentId) ?? studentId, average: Math.round(average * 100) / 100 })
        }
      }
      if (below.length > 0) {
        candidates.push({
          curriculumSkillId: entry.kind === 'skill' ? itemId : undefined,
          competencyId: entry.kind === 'competency' ? itemId : undefined,
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
    skills: {
      include: {
        curriculumSkill: { select: { id: true, code: true, description: true } },
        competency: { select: { id: true, code: true, text: true } },
      },
    },
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

    const existing = await prisma.reinforcementPlan.findFirst({
      where: {
        studentId: dto.studentId,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        planType: dto.planType,
      },
    })
    if (existing) throw new BadRequestError('Ya existe un plan de refuerzo para este estudiante en este periodo')

    if (dto.skills?.length) {
      const skillIds = dto.skills.map((s) => s.curriculumSkillId).filter((id): id is string => !!id)
      const competencyIds = dto.skills.map((s) => s.competencyId).filter((id): id is string => !!id)
      await assertSkillsArePlanned(dto.courseAssignmentId, dto.academicPeriodId, skillIds)
      await assertCompetenciesArePlanned(dto.courseAssignmentId, dto.academicPeriodId, competencyIds)
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
                competencyId: s.competencyId,
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
      const skillIds = dto.skills.map((s) => s.curriculumSkillId).filter((id): id is string => !!id)
      const competencyIds = dto.skills.map((s) => s.competencyId).filter((id): id is string => !!id)
      await assertSkillsArePlanned(plan.courseAssignmentId, plan.academicPeriodId, skillIds)
      await assertCompetenciesArePlanned(plan.courseAssignmentId, plan.academicPeriodId, competencyIds)
    }

    if (dto.skills) {
      await prisma.reinforcementPlanSkill.deleteMany({ where: { planId: id } })
      if (dto.skills.length) {
        await prisma.reinforcementPlanSkill.createMany({
          data: dto.skills.map((s) => ({
            planId: id,
            curriculumSkillId: s.curriculumSkillId,
            competencyId: s.competencyId,
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
        skills: { include: { curriculumSkill: true, competency: true } },
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
      skills: plan.skills
        .filter((s) => s.curriculumSkill || s.competency)
        .map((s) => ({
          code: s.curriculumSkill ? s.curriculumSkill.code : s.competency!.code,
          description: s.curriculumSkill ? s.curriculumSkill.description : s.competency!.text,
          averageAtDetection: s.averageAtDetection ? Number(s.averageAtDetection) : null,
          notes: s.notes,
        })),
      guardianName: guardianLink?.guardian.profile
        ? `${guardianLink.guardian.profile.firstName} ${guardianLink.guardian.profile.lastName}`
        : null,
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Flujo completo de refuerzo pedagógico (motor TIGA) — casos de uso sobre
  // ReinforcementPlan.planType="academico". Máquina de estados validada en
  // shared/domain/reinforcement-domain.ts; plan temporal generado por
  // shared/domain/reinforcement-planning-engine.ts.
  // ═══════════════════════════════════════════════════════════════════════

  private static REINFORCEMENT_CASE_INCLUDE = {
    student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
    skills: {
      include: {
        curriculumSkill: { select: { id: true, code: true, description: true } },
        competency: { select: { id: true, code: true, text: true } },
      },
    },
    courseAssignment: {
      select: {
        id: true,
        subject: { select: { id: true, name: true } },
        parallel: { select: { id: true, name: true, level: { select: { name: true } } } },
      },
    },
    academicPeriod: { select: { id: true, name: true } },
    participants: {
      include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
    },
    units: { orderBy: { temporalIndex: 'asc' as const } },
    communications: { orderBy: { date: 'asc' as const } },
    commitments: { orderBy: { createdAt: 'asc' as const } },
    followUps: { orderBy: { date: 'asc' as const } },
    reevaluations: {
      orderBy: { date: 'asc' as const },
      include: {
        outcomes: {
          include: { student: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } } },
        },
      },
    },
  }

  private async getCaseOrThrow(id: string, institutionId: string) {
    const plan = await prisma.reinforcementPlan.findFirst({
      where: { id, institutionId, planType: 'academico' },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
    })
    if (!plan) throw new NotFoundError('Caso de refuerzo no encontrado')
    return plan
  }

  async listReinforcementCases(institutionId: string, query: ListReinforcementPlansQuery) {
    return prisma.reinforcementPlan.findMany({
      where: {
        institutionId,
        planType: 'academico',
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.academicPeriodId,
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  async getReinforcementCase(id: string, institutionId: string) {
    return this.getCaseOrThrow(id, institutionId)
  }

  /** create_case — crea el caso completo con la propuesta inicial auto-armada desde NEED_PROPOSALS. */
  async createReinforcementCase(institutionId: string, actorId: string, dto: CreateReinforcementCaseDto) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')

    if (!dto.studentIds?.length) throw new BadRequestError('Se requiere al menos un estudiante')

    const detectionLabel = labelOrBadRequest(DETECTION_SOURCES, dto.detectionSourceCode, 'fuente de detección')
    if (dto.detectionSourceCode === 'OTHER' && !(dto.detectionObservation ?? '').trim()) {
      throw new BadRequestError('La detección "Otro" requiere una observación')
    }
    if (!dto.needCodes?.length) throw new BadRequestError('Se requiere al menos una necesidad pedagógica')
    const needs = dto.needCodes.map((code) => ({
      code,
      label: labelOrBadRequest(PEDAGOGICAL_NEEDS, code, 'necesidad pedagógica'),
    }))

    if (dto.curriculumSkillId) await assertSkillsArePlanned(dto.courseAssignmentId, dto.academicPeriodId, [dto.curriculumSkillId])
    if (dto.competencyId) await assertCompetenciesArePlanned(dto.courseAssignmentId, dto.academicPeriodId, [dto.competencyId])

    const proposedGroup = dto.studentIds.length > 1
    const mode = dto.mode ?? (proposedGroup && dto.teacherConfirmsGroup ? 'GROUP' : 'INDIVIDUAL')
    if (dto.studentIds.length > 1 && mode === 'INDIVIDUAL') {
      throw new BadRequestError('Varios estudiantes requieren modo GRUPO o casos separados')
    }
    const modeAuthority = proposedGroup ? 'TIGA_SUGGESTED_TEACHER_CONFIRMED' : 'TEACHER_CONFIRMED'

    const [strategy, activitySuggestion] = NEED_PROPOSALS[needs[0].code]
    const activities = dto.learningTarget.activities ?? []
    const sourceActivity = naturalText(activities.length ? activities[activities.length - 1] : activitySuggestion)
    const evaluationName = dto.evaluationInstrument || 'Comprobación mediante evidencia y observación docente'
    const durationFrequency = durationFrequencyText(dto.reinforcementDurationWeeks, dto.reinforcementFrequency)

    const plan = await prisma.reinforcementPlan.create({
      data: {
        institutionId,
        studentId: dto.studentIds[0],
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        planType: 'academico',
        status: 'borrador',
        createdBy: actorId,
        caseStatus: 'DETECTED',
        mode,
        modeAuthority,
        reinforcementDurationWeeks: dto.reinforcementDurationWeeks,
        reinforcementFrequency: dto.reinforcementFrequency ?? null,
        detectionSourceCode: dto.detectionSourceCode,
        detectionObservation: (dto.detectionObservation ?? '').trim(),
        detectionEvidenceValue: (dto.detectionEvidenceValue ?? '').trim() || null,
        detectionPeriod: (dto.detectionPeriod ?? '').trim() || null,
        detectionInitialResult: (dto.detectionInitialResult ?? '').trim() || null,
        detectionEvidenceOrigin: (dto.detectionEvidenceOrigin ?? '').trim() || null,
        psychopedagogicalReportExists: !!dto.psychopedagogicalReportExists,
        psychopedagogicalAuthorityReference: (dto.psychopedagogicalAuthorityReference ?? '').trim() || null,
        detectedOn: new Date(),
        needCodes: dto.needCodes,
        needObservation: (dto.needObservation ?? '').trim() || null,
        learningTargetTitle: dto.learningTarget.title,
        learningTargetDescription: dto.learningTarget.description,
        learningTargetActivities: activities,
        learningTargetEvidence: dto.learningTarget.evidence ?? '',
        evaluationInstrument: dto.evaluationInstrument ?? null,
        evaluationObservedResult: dto.evaluationObservedResult ?? null,
        proposalLearningToReinforce: dto.learningTarget.description,
        proposalObjective: `Consolidar el aprendizaje priorizado mediante ${strategy.toLowerCase()}.`,
        proposalActiveStrategy: strategy,
        proposalConcreteActivity: `${sourceActivity} Registrar el procedimiento o las decisiones tomadas y comentar el resultado con el docente.`,
        proposalResource: 'Ficha de refuerzo y recursos de la planificación vigente',
        proposalEvidence: naturalEvidence(dto.learningTarget.evidence),
        proposalEvaluation: evaluationName,
        proposalDurationFrequency: durationFrequency,
        proposalExpectedResult: 'El estudiante demuestra el aprendizaje priorizado en una evidencia verificable.',
        proposalAuthority: 'TIGA_SUGGESTED',
        proposalTeacherConfirmed: false,
        skills: {
          create: [
            {
              curriculumSkillId: dto.curriculumSkillId,
              competencyId: dto.competencyId,
            },
          ],
        },
        participants: { create: dto.studentIds.map((studentId) => ({ studentId })) },
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
    })
    return plan
  }

  /** edit_proposal — el docente edita cualquier campo de la propuesta antes de confirmarla. */
  async editReinforcementProposal(id: string, institutionId: string, dto: EditReinforcementProposalDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    const fieldMap: Record<keyof EditReinforcementProposalDto, string> = {
      learningToReinforce: 'proposalLearningToReinforce',
      objective: 'proposalObjective',
      activeStrategy: 'proposalActiveStrategy',
      concreteActivity: 'proposalConcreteActivity',
      resource: 'proposalResource',
      evidence: 'proposalEvidence',
      evaluation: 'proposalEvaluation',
      durationFrequency: 'proposalDurationFrequency',
      expectedResult: 'proposalExpectedResult',
    }
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined) as [keyof EditReinforcementProposalDto, string][]
    if (!entries.length) throw new BadRequestError('No hay campos de la propuesta para editar')
    const data: Record<string, string> = {}
    for (const [key, value] of entries) {
      const text = value.trim()
      if (!text) throw new BadRequestError(`El campo de la propuesta no puede quedar vacío: ${key}`)
      data[fieldMap[key]] = text
    }
    void plan
    return prisma.reinforcementPlan.update({
      where: { id },
      data: { ...data, proposalAuthority: 'TEACHER_EDITED', proposalTeacherConfirmed: false },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
    })
  }

  /** confirm_plan — DETECTED→PLANNED, marca la propuesta confirmada y genera+persiste el plan temporal. */
  async confirmReinforcementPlan(id: string, institutionId: string) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    assertTransition(plan.caseStatus as ReinforcementStatus, 'PLANNED')

    const needs = plan.needCodes.map((code) => ({ code, label: catalogLabel(PEDAGOGICAL_NEEDS, code) }))
    const temporalPlan = generateReinforcementPlan(
      {
        title: plan.learningTargetTitle ?? '',
        description: plan.learningTargetDescription ?? '',
        activities: plan.learningTargetActivities,
        evidence: plan.learningTargetEvidence ?? '',
      },
      needs,
      plan.reinforcementDurationWeeks ?? 1,
      {
        mode: plan.mode as 'INDIVIDUAL' | 'GROUP',
        frequency: plan.reinforcementFrequency ?? undefined,
        initialResult: plan.detectionInitialResult ?? undefined,
      },
    )

    await prisma.$transaction([
      prisma.reinforcementPlanUnit.deleteMany({ where: { planId: id } }),
      prisma.reinforcementPlanUnit.createMany({
        data: temporalPlan.units.map((u) => ({
          planId: id,
          temporalIndex: u.temporalIndex,
          phase: u.phase,
          learningFocus: u.learningFocus,
          specificObjective: u.specificObjective,
          strategy: u.strategy,
          concreteActivity: u.concreteActivity,
          requiredResource: u.requiredResource,
          observableEvidence: u.observableEvidence,
          evaluationMechanism: u.evaluationMechanism,
          frequency: u.frequency,
          advancementCriterion: u.advancementCriterion,
          nextStep: u.nextStep,
        })),
      }),
      prisma.reinforcementPlan.update({
        where: { id },
        data: { caseStatus: 'PLANNED', status: 'activo', proposalTeacherConfirmed: true },
      }),
    ])

    return this.getCaseOrThrow(id, institutionId)
  }

  /** start_reinforcement — PLANNED→IN_REINFORCEMENT. */
  async startReinforcement(id: string, institutionId: string) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    assertTransition(plan.caseStatus as ReinforcementStatus, 'IN_REINFORCEMENT')
    await prisma.reinforcementPlan.update({ where: { id }, data: { caseStatus: 'IN_REINFORCEMENT' } })
    return this.getCaseOrThrow(id, institutionId)
  }

  /** add_communication / suggest_communication — registra comunicación con el representante. */
  async addReinforcementCommunication(id: string, institutionId: string, actorId: string, dto: AddReinforcementCommunicationDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    const mediumLabel = labelOrBadRequest(COMMUNICATION_MEDIA, dto.mediumCode, 'medio de comunicación')
    const recipient = dto.recipient?.trim() || 'Representante'
    const text = dto.text?.trim() || suggestCommunicationText(
      mediumLabel,
      plan.participants.map((p) => `${p.student.profile?.firstName ?? ''} ${p.student.profile?.lastName ?? ''}`.trim()),
      recipient,
      plan.commitments.map((c) => c.commitmentLabel),
    )
    await prisma.reinforcementCommunication.create({
      data: {
        planId: id,
        date: dto.date ? new Date(dto.date) : new Date(),
        mediumCode: dto.mediumCode,
        mediumLabel,
        recipient,
        institutionalText: text,
        createdBy: actorId,
      },
    })
    return this.getCaseOrThrow(id, institutionId)
  }

  /** add_commitment — registra un compromiso (tipo + responsable + fecha + nota). */
  async addReinforcementCommitment(id: string, institutionId: string, actorId: string, dto: AddReinforcementCommitmentDto) {
    await this.getCaseOrThrow(id, institutionId)
    const commitmentLabel = labelOrBadRequest(COMMITMENT_TYPES, dto.commitmentCode, 'tipo de compromiso')
    await prisma.reinforcementCommitment.create({
      data: {
        planId: id,
        commitmentCode: dto.commitmentCode,
        commitmentLabel,
        responsible: dto.responsible?.trim() || 'Representante y estudiante',
        targetDate: dto.targetDate ? new Date(dto.targetDate) : null,
        note: dto.note?.trim() || null,
        createdBy: actorId,
      },
    })
    return this.getCaseOrThrow(id, institutionId)
  }

  /** add_follow_up — solo válido si el caso está IN_REINFORCEMENT. */
  async addReinforcementFollowUp(id: string, institutionId: string, actorId: string, dto: AddReinforcementFollowUpDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    if (plan.caseStatus !== 'IN_REINFORCEMENT') {
      throw new BadRequestError('El seguimiento requiere que el refuerzo esté en curso (IN_REINFORCEMENT)')
    }
    await prisma.reinforcementFollowUp.create({
      data: {
        planId: id,
        date: dto.date ? new Date(dto.date) : new Date(),
        strategyApplied: dto.strategyApplied,
        evidence: dto.evidence,
        observation: dto.observation,
        activityApplied: dto.activityApplied?.trim() || null,
        supportOrAdjustment: dto.supportOrAdjustment?.trim() || null,
        observedProgress: (dto.observedProgress || dto.observation || '').trim() || null,
        persistentDifficulty: dto.persistentDifficulty?.trim() || null,
        nextAction: dto.nextAction?.trim() || null,
        createdBy: actorId,
      },
    })
    return this.getCaseOrThrow(id, institutionId)
  }

  /** reevaluate — IN_REINFORCEMENT→EVALUATED, requiere un resultado por cada estudiante participante. */
  async reevaluateReinforcementCase(id: string, institutionId: string, actorId: string, dto: ReevaluateReinforcementCaseDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    if (plan.caseStatus !== 'IN_REINFORCEMENT') {
      throw new BadRequestError('La reevaluación requiere que el refuerzo esté en curso (IN_REINFORCEMENT)')
    }
    const participantIds = new Set(plan.participants.map((p) => p.studentId))
    if (!dto.outcomes?.length) throw new BadRequestError('Se requiere un resultado por cada estudiante')
    for (const outcome of dto.outcomes) {
      if (!participantIds.has(outcome.studentId)) throw new BadRequestError('Estudiante fuera del caso de refuerzo')
      if (outcome.result !== 'CONSOLIDATED' && outcome.result !== 'NOT_CONSOLIDATED') {
        throw new BadRequestError('Resultado de reevaluación inválido')
      }
    }
    const outcomeIds = new Set(dto.outcomes.map((o) => o.studentId))
    if (outcomeIds.size !== participantIds.size) throw new BadRequestError('Se requiere un resultado por cada estudiante del caso')

    const pedagogicalDecision = dto.pedagogicalDecision
      || (dto.outcomes.every((o) => o.result === 'CONSOLIDATED') ? 'LEARNING_ACHIEVED' : 'CONTINUE_REINFORCEMENT')
    const suggestion = dto.persistentDifficulty ? PERSISTENT_DIFFICULTY_SUGGESTION : null

    await prisma.$transaction([
      prisma.reinforcementReevaluation.create({
        data: {
          planId: id,
          date: dto.date ? new Date(dto.date) : new Date(),
          evaluation: dto.evaluation,
          persistentDifficulty: !!dto.persistentDifficulty,
          institutionalSupportSuggestion: suggestion,
          initialResult: (dto.initialResult || plan.detectionInitialResult || '').trim() || null,
          subsequentResult: (dto.subsequentResult ?? '').trim() || null,
          observedProgress: (dto.observedProgress ?? '').trim() || null,
          evidence: (dto.evidence ?? '').trim() || null,
          pedagogicalDecision,
          createdBy: actorId,
          outcomes: {
            create: dto.outcomes.map((o) => ({
              studentId: o.studentId,
              result: o.result,
              assessmentValue: o.assessmentValue ?? null,
              observation: o.observation ?? null,
            })),
          },
        },
      }),
      prisma.reinforcementPlan.update({ where: { id }, data: { caseStatus: 'EVALUATED' } }),
    ])

    return this.getCaseOrThrow(id, institutionId)
  }

  /** confirm_outcome — EVALUATED→{CLOSED|CONTINUES_REINFORCEMENT}. */
  async confirmReinforcementOutcome(id: string, institutionId: string, dto: ConfirmReinforcementOutcomeDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    if (plan.caseStatus !== 'EVALUATED') {
      throw new BadRequestError('La decisión de resultado requiere que el caso esté evaluado')
    }
    const latest = plan.reevaluations[plan.reevaluations.length - 1]
    if (!latest) throw new BadRequestError('No hay reevaluación registrada')
    const allConsolidated = latest.outcomes.every((o) => o.result === 'CONSOLIDATED')
    if (dto.close && !allConsolidated) {
      throw new BadRequestError('No se puede cerrar el caso con estudiantes pendientes de consolidar')
    }
    const target: ReinforcementStatus = dto.close ? 'CLOSED' : 'CONTINUES_REINFORCEMENT'
    assertTransition('EVALUATED', target)
    await prisma.reinforcementPlan.update({
      where: { id },
      data: { caseStatus: target, ...(dto.close && { status: 'cerrado' }) },
    })
    return this.getCaseOrThrow(id, institutionId)
  }

  /** create_next_cycle — solo desde CONTINUES_REINFORCEMENT, clona el caso con cycleNumber+1. */
  async createNextReinforcementCycle(id: string, institutionId: string, actorId: string, dto: CreateNextReinforcementCycleDto) {
    const plan = await this.getCaseOrThrow(id, institutionId)
    if (plan.caseStatus !== 'CONTINUES_REINFORCEMENT') {
      throw new BadRequestError('El siguiente ciclo requiere que el caso esté en CONTINUES_REINFORCEMENT')
    }

    const nextPlan = await prisma.reinforcementPlan.create({
      data: {
        institutionId,
        studentId: plan.studentId,
        courseAssignmentId: plan.courseAssignmentId,
        academicPeriodId: plan.academicPeriodId,
        planType: 'academico',
        status: 'borrador',
        createdBy: actorId,
        caseStatus: 'DETECTED',
        mode: plan.mode,
        modeAuthority: plan.modeAuthority,
        rootCaseId: plan.rootCaseId ?? plan.id,
        previousCaseId: plan.id,
        cycleNumber: plan.cycleNumber + 1,
        reinforcementDurationWeeks: plan.reinforcementDurationWeeks,
        reinforcementFrequency: plan.reinforcementFrequency,
        detectionSourceCode: plan.detectionSourceCode,
        detectionObservation: plan.detectionObservation,
        detectionEvidenceValue: plan.detectionEvidenceValue,
        detectionPeriod: (dto.detectionPeriod || plan.detectionPeriod || '').trim() || null,
        detectionInitialResult: (dto.initialResult ?? '').trim() || null,
        detectionEvidenceOrigin: plan.detectionEvidenceOrigin,
        psychopedagogicalReportExists: plan.psychopedagogicalReportExists,
        psychopedagogicalAuthorityReference: plan.psychopedagogicalAuthorityReference,
        detectedOn: new Date(),
        needCodes: plan.needCodes,
        needObservation: plan.needObservation,
        learningTargetTitle: plan.learningTargetTitle,
        learningTargetDescription: plan.learningTargetDescription,
        learningTargetActivities: plan.learningTargetActivities,
        learningTargetEvidence: plan.learningTargetEvidence,
        evaluationInstrument: plan.evaluationInstrument,
        evaluationObservedResult: plan.evaluationObservedResult,
        proposalLearningToReinforce: plan.proposalLearningToReinforce,
        proposalObjective: plan.proposalObjective,
        proposalActiveStrategy: plan.proposalActiveStrategy,
        proposalConcreteActivity: plan.proposalConcreteActivity,
        proposalResource: plan.proposalResource,
        proposalEvidence: plan.proposalEvidence,
        proposalEvaluation: plan.proposalEvaluation,
        proposalDurationFrequency: plan.proposalDurationFrequency,
        proposalExpectedResult: plan.proposalExpectedResult,
        proposalAuthority: plan.proposalAuthority,
        proposalTeacherConfirmed: false,
        skills: {
          create: plan.skills.map((s) => ({ curriculumSkillId: s.curriculumSkillId, competencyId: s.competencyId })),
        },
        participants: { create: plan.participants.map((p) => ({ studentId: p.studentId })) },
      },
      include: PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
    })
    return nextPlan
  }

  /** Junta los datos necesarios para renderizar el PDF del caso de refuerzo completo (motor TIGA). */
  async getReinforcementCasePdfData(id: string, institutionId: string) {
    const plan = await prisma.reinforcementPlan.findFirst({
      where: { id, institutionId, planType: 'academico' },
      include: {
        ...PrismaPedagogicRecoveryRepository.REINFORCEMENT_CASE_INCLUDE,
        courseAssignment: {
          include: {
            teacher: { include: { profile: true } },
            subject: true,
            parallel: { include: { level: true } },
          },
        },
      },
    })
    if (!plan) throw new NotFoundError('Caso de refuerzo no encontrado')

    const institution = await prisma.institution.findUnique({ where: { id: institutionId } })
    const settings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }

    const skill = plan.skills[0]
    const skillLabel = skill
      ? skill.curriculumSkill
        ? `${skill.curriculumSkill.code} — ${skill.curriculumSkill.description}`
        : skill.competency
          ? `${skill.competency.code} — ${skill.competency.text}`
          : ''
      : ''

    return {
      institutionName: institution?.name ?? '',
      logoUrl: settings.branding?.logoUrl ?? null,
      studentNames: plan.participants.map((p) =>
        p.student.profile ? `${p.student.profile.firstName} ${p.student.profile.lastName}` : p.studentId,
      ),
      teacherName: plan.courseAssignment.teacher.profile
        ? `${plan.courseAssignment.teacher.profile.firstName} ${plan.courseAssignment.teacher.profile.lastName}`
        : '',
      subjectName: plan.courseAssignment.subject.name,
      levelName: plan.courseAssignment.parallel.level.name,
      parallelName: plan.courseAssignment.parallel.name,
      periodName: plan.academicPeriod.name,
      mode: plan.mode as 'INDIVIDUAL' | 'GROUP',
      caseStatus: plan.caseStatus,
      cycleNumber: plan.cycleNumber,
      skillLabel,
      detection: {
        sourceLabel: plan.detectionSourceCode ? catalogLabel(DETECTION_SOURCES, plan.detectionSourceCode) : '',
        observation: plan.detectionObservation ?? '',
        evidenceValue: plan.detectionEvidenceValue ?? '',
        period: plan.detectionPeriod ?? '',
        initialResult: plan.detectionInitialResult ?? '',
      },
      needs: plan.needCodes.map((code) => catalogLabel(PEDAGOGICAL_NEEDS, code)),
      proposal: {
        learningToReinforce: plan.proposalLearningToReinforce ?? '',
        objective: plan.proposalObjective ?? '',
        activeStrategy: plan.proposalActiveStrategy ?? '',
        concreteActivity: plan.proposalConcreteActivity ?? '',
        resource: plan.proposalResource ?? '',
        evidence: plan.proposalEvidence ?? '',
        evaluation: plan.proposalEvaluation ?? '',
        durationFrequency: plan.proposalDurationFrequency ?? '',
        expectedResult: plan.proposalExpectedResult ?? '',
      },
      units: plan.units.map((u) => ({
        temporalIndex: u.temporalIndex,
        phase: u.phase,
        learningFocus: u.learningFocus,
        specificObjective: u.specificObjective,
        strategy: u.strategy,
        concreteActivity: u.concreteActivity,
        requiredResource: u.requiredResource,
        observableEvidence: u.observableEvidence,
        evaluationMechanism: u.evaluationMechanism,
      })),
      communications: plan.communications.map((c) => ({
        date: c.date,
        mediumLabel: c.mediumLabel,
        recipient: c.recipient,
        institutionalText: c.institutionalText,
      })),
      commitments: plan.commitments.map((c) => ({
        commitmentLabel: c.commitmentLabel,
        responsible: c.responsible,
        targetDate: c.targetDate,
        note: c.note,
      })),
      followUps: plan.followUps.map((f) => ({
        date: f.date,
        strategyApplied: f.strategyApplied,
        evidence: f.evidence,
        observation: f.observation,
      })),
      reevaluations: plan.reevaluations.map((r) => ({
        date: r.date,
        evaluation: r.evaluation,
        pedagogicalDecision: r.pedagogicalDecision ?? '',
        outcomes: r.outcomes.map((o) => ({
          studentName: o.student.profile ? `${o.student.profile.firstName} ${o.student.profile.lastName}` : o.studentId,
          result: o.result,
          observation: o.observation ?? '',
        })),
      })),
    }
  }
}
