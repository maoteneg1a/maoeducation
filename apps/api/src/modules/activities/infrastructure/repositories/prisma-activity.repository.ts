import { computePeriodGrades } from '../../../../shared/infrastructure/services/period-grades.service'
import { assertReinforcementGradesOpen, closedReinforcementPlans } from '../../../../shared/infrastructure/services/reinforcement-grade-lock.service'
import { loadFormativeApplications } from '../../../../shared/infrastructure/services/formative-reinforcement.service'
import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError, ConflictError, ValidationError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned, assertCompetenciesArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import { activityKind, effectiveActivityScore } from '../../../../shared/domain/grade-math'
import { improvedScore, resolveAgreement, type AgreementRules } from '../../../../shared/domain/agreement-rules'

const SUMMATIVE_IMPROVEMENT_MODES = ['agreement_direct', 'agreement_with_reinforcement'] as const
import { STUDENT_ENROLLMENT_ORDER } from '../../../../shared/infrastructure/services/enrollment-query'
import type {
  CreateActivityTypeDto,
  UpdateActivityTypeDto,
  CreateInsumoDto,
  UpdateInsumoDto,
  CreateActivityDto,
  UpdateActivityDto,
  BulkGradeDto,
  BulkManualInsumoAverageDto,
  ListActivitiesQueryDto,
} from '../../application/dtos/activity.dto'

const GRADE_STATUSES = new Set(['entregado', 'no_realizado', 'atrasado', 'excusado'])

export class PrismaActivityRepository {
  private async protectActivityCalculation(db: Prisma.TransactionClient, institutionId: string, activity: { id: string; courseAssignmentId: string; academicPeriodId: string }) {
    const grades = await db.grade.findMany({ where: { institutionId, activityId: activity.id }, select: { studentId: true, gradedAt: true, createdAt: true } })
    await assertReinforcementGradesOpen(db, institutionId, grades.map((grade) => ({ studentId: grade.studentId, courseAssignmentId: activity.courseAssignmentId, academicPeriodId: activity.academicPeriodId, recordedAt: grade.gradedAt ?? grade.createdAt })))
  }

  // ─── Activity Types ────────────────────────────────────────────────────────

  async listTypes(institutionId: string) {
    return prisma.activityType.findMany({
      where: { institutionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
  }

  async createType(institutionId: string, dto: CreateActivityTypeDto) {
    const existing = await prisma.activityType.findFirst({
      where: { institutionId, name: dto.name },
    })
    if (existing) throw new ConflictError(`Ya existe un tipo de actividad con el nombre "${dto.name}"`)

    const code = dto.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 50)
    const codeConflict = await prisma.activityType.findFirst({
      where: { institutionId, code },
    })
    const finalCode = codeConflict ? `${code}_${Date.now()}` : code

    return prisma.activityType.create({
      data: {
        institutionId,
        name: dto.name,
        code: finalCode,
        description: dto.description,
      },
    })
  }

  async updateType(id: string, institutionId: string, dto: UpdateActivityTypeDto) {
    const type = await prisma.activityType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de actividad no encontrado')

    if (dto.name && dto.name !== type.name) {
      const conflict = await prisma.activityType.findFirst({
        where: { institutionId, name: dto.name, id: { not: id } },
      })
      if (conflict) throw new ConflictError(`Ya existe un tipo de actividad con el nombre "${dto.name}"`)
    }

    return prisma.activityType.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    })
  }

  async toggleType(id: string, institutionId: string) {
    const type = await prisma.activityType.findFirst({ where: { id, institutionId } })
    if (!type) throw new NotFoundError('Tipo de actividad no encontrado')
    return prisma.activityType.update({
      where: { id },
      data: { isActive: !type.isActive },
    })
  }

  // ─── Insumos ───────────────────────────────────────────────────────────────

  async listInsumos(institutionId: string, courseAssignmentId: string, periodId: string) {
    return prisma.insumo.findMany({
      where: {
        institutionId,
        courseAssignmentId,
        academicPeriodId: periodId,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { activities: true } },
        creator: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
  }

  async createInsumo(institutionId: string, dto: CreateInsumoDto, createdById: string) {
    const [assignment, period] = await Promise.all([
      prisma.courseAssignment.findFirst({ where: { id: dto.courseAssignmentId, institutionId } }),
      prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } }),
    ])
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')
    if (!period) throw new NotFoundError('Período académico no encontrado')

    return prisma.insumo.create({
      data: {
        institutionId,
        name: dto.name,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        weight: dto.weight,
        sortOrder: dto.order ?? 0,
        createdBy: createdById,
      },
      include: { _count: { select: { activities: true } } },
    })
  }

  async updateInsumo(id: string, institutionId: string, dto: UpdateInsumoDto) {
    const insumo = await prisma.insumo.findFirst({ where: { id, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    return prisma.insumo.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.weight !== undefined && { weight: dto.weight }),
        ...(dto.order !== undefined && { sortOrder: dto.order }),
      },
      include: { _count: { select: { activities: true } } },
    })
  }

  async deleteInsumo(id: string, institutionId: string) {
    const insumo = await prisma.insumo.findFirst({ where: { id, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    const activityCount = await prisma.activity.count({ where: { insumoId: id } })
    if (activityCount > 0) {
      throw new ConflictError('No se puede eliminar un insumo que tiene actividades asociadas')
    }

    await prisma.insumo.delete({ where: { id } })
  }

  // ─── Activities ────────────────────────────────────────────────────────────

  async list(institutionId: string, query: ListActivitiesQueryDto) {
    return prisma.activity.findMany({
      where: {
        institutionId,
        courseAssignmentId: query.courseAssignmentId,
        academicPeriodId: query.periodId,
        ...(query.insumoId && { insumoId: query.insumoId }),
      },
      orderBy: [{ activityDate: 'asc' }, { name: 'asc' }],
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
        _count: { select: { grades: true } },
        creator: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })
  }

  async create(institutionId: string, dto: CreateActivityDto, createdById: string) {
    const [assignment, period, activityType] = await Promise.all([
      prisma.courseAssignment.findFirst({ where: { id: dto.courseAssignmentId, institutionId } }),
      prisma.academicPeriod.findFirst({ where: { id: dto.academicPeriodId } }),
      prisma.activityType.findFirst({ where: { id: dto.activityTypeId, institutionId } }),
    ])

    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')
    if (!period) throw new NotFoundError('Período académico no encontrado')
    if (!activityType) throw new NotFoundError('Tipo de actividad no encontrado')

    if (dto.insumoId) {
      const insumo = await prisma.insumo.findFirst({ where: { id: dto.insumoId, institutionId } })
      if (!insumo) throw new NotFoundError('Insumo no encontrado')
    }

    if (dto.taskId) {
      const task = await prisma.task.findFirst({ where: { id: dto.taskId, institutionId } })
      if (!task) throw new NotFoundError('Tarea no encontrada')
      if (task.courseAssignmentId !== dto.courseAssignmentId) {
        throw new ConflictError('La tarea pertenece a otra asignación de curso')
      }
      const linked = await prisma.activity.findUnique({ where: { taskId: dto.taskId } })
      if (linked) throw new ConflictError('Esta tarea ya tiene una actividad calificable')
    }

    if (dto.curriculumSkillId) {
      await assertSkillsArePlanned(dto.courseAssignmentId, dto.academicPeriodId, [dto.curriculumSkillId])
    }
    if (dto.competencyId) {
      await assertCompetenciesArePlanned(dto.courseAssignmentId, dto.academicPeriodId, [dto.competencyId])
    }

    return prisma.activity.create({
      data: {
        institutionId,
        courseAssignmentId: dto.courseAssignmentId,
        academicPeriodId: dto.academicPeriodId,
        activityTypeId: dto.activityTypeId,
        insumoId: dto.insumoId,
        taskId: dto.taskId,
        curriculumSkillId: dto.curriculumSkillId,
        competencyId: dto.competencyId,
        name: dto.name,
        description: dto.description,
        maxScore: dto.maxScore,
        activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
        metadata: (dto.metadata ?? {}) as Prisma.InputJsonValue,
        isPublished: false,
        createdBy: createdById,
      },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
        competency: { select: { id: true, code: true, text: true } },
      },
    })
  }

  async getById(id: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({
      where: { id, institutionId },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        courseAssignment: {
          include: {
            subject: true,
            parallel: { include: { level: true } },
          },
        },
        academicPeriod: { select: { id: true, name: true } },
        _count: { select: { grades: true } },
      },
    })
    if (!activity) throw new NotFoundError('Actividad no encontrada')
    return activity
  }

  async update(id: string, institutionId: string, dto: UpdateActivityDto) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    if (dto.curriculumSkillId) {
      await assertSkillsArePlanned(activity.courseAssignmentId, activity.academicPeriodId, [dto.curriculumSkillId])
    }
    if (dto.competencyId) {
      await assertCompetenciesArePlanned(activity.courseAssignmentId, activity.academicPeriodId, [dto.competencyId])
    }

    return prisma.$transaction(async (tx) => {
      if (dto.maxScore !== undefined || 'insumoId' in dto) await this.protectActivityCalculation(tx, institutionId, activity)
      return tx.activity.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.maxScore !== undefined && { maxScore: dto.maxScore }),
        ...(dto.activityDate !== undefined && {
          activityDate: dto.activityDate ? new Date(dto.activityDate) : null,
        }),
        ...(dto.metadata !== undefined && { metadata: dto.metadata as Prisma.InputJsonValue }),
        ...('insumoId' in dto && { insumoId: dto.insumoId ?? null }),
        ...('curriculumSkillId' in dto && { curriculumSkillId: dto.curriculumSkillId ?? null }),
        ...('competencyId' in dto && { competencyId: dto.competencyId ?? null }),
      },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
        curriculumSkill: { select: { id: true, code: true, description: true } },
        competency: { select: { id: true, code: true, text: true } },
      },
    })
    }, { timeout: 60000 })
  }

  /** Publica u oculta la actividad para estudiantes/representantes. */
  async publish(id: string, institutionId: string, isPublished = true) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    return prisma.$transaction(async (tx) => {
      if (activity.isPublished !== isPublished) await this.protectActivityCalculation(tx, institutionId, activity)
      return tx.activity.update({
      where: { id },
      data: { isPublished },
    })
    }, { timeout: 60000 })
  }

  async assignInsumo(id: string, institutionId: string, insumoId: string) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    const insumo = await prisma.insumo.findFirst({ where: { id: insumoId, institutionId } })
    if (!insumo) throw new NotFoundError('Insumo no encontrado')

    return prisma.$transaction(async (tx) => {
      if (activity.insumoId !== insumoId) await this.protectActivityCalculation(tx, institutionId, activity)
      return tx.activity.update({
      where: { id },
      data: { insumoId },
      include: {
        activityType: true,
        insumo: { select: { id: true, name: true } },
      },
    })
    }, { timeout: 60000 })
  }

  async delete(id: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({ where: { id, institutionId } })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    // No permitir borrar una actividad que ya tiene NOTAS registradas.
    const gradedCount = await prisma.grade.count({
      where: { activityId: id, score: { not: null } },
    })
    if (gradedCount > 0) {
      throw new ConflictError(
        'No se puede eliminar una actividad que ya tiene notas registradas. Primero borra las notas.',
      )
    }

    // Solo quedan filas de nota vacías (sin valor): se limpian para respetar la FK
    // (nota → actividad es RESTRICT) y luego se elimina la actividad.
    await prisma.$transaction([
      prisma.grade.deleteMany({ where: { activityId: id } }),
      prisma.activity.delete({ where: { id } }),
    ])
  }

  // ─── Grades ────────────────────────────────────────────────────────────────

  async getByActivity(activityId: string, institutionId: string) {
    const activity = await prisma.activity.findFirst({
      where: { id: activityId, institutionId },
      include: {
        courseAssignment: {
          select: { parallelId: true, academicYearId: true },
        },
      },
    })
    if (!activity) throw new NotFoundError('Actividad no encontrada')

    const { parallelId, academicYearId } = activity.courseAssignment

    // Get all enrolled students in the parallel/year
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId, academicYearId },
      orderBy: STUDENT_ENROLLMENT_ORDER,
      include: {
        student: {
          select: {
            id: true,
            profile: { select: { firstName: true, lastName: true, dni: true } },
          },
        },
      },
    })

    // Get existing grades for this activity
    const grades = await prisma.grade.findMany({
      where: { activityId, institutionId },
    })
    const gradeMap = new Map(grades.map((g) => [g.studentId, g]))
    const closedPlans = await closedReinforcementPlans(prisma, institutionId, enrollments.map((enrollment) => ({ studentId: enrollment.studentId, courseAssignmentId: activity.courseAssignmentId, academicPeriodId: activity.academicPeriodId, recordedAt: gradeMap.get(enrollment.studentId)?.gradedAt ?? gradeMap.get(enrollment.studentId)?.createdAt ?? new Date(8640000000000000) })))

    // Merge: cada estudiante activo recibe su nota (o null). Los retirados solo
    // aparecen si ya tenían nota registrada (historial), para no ensuciar la lista.
    return enrollments
      .filter((enrollment) => enrollment.status === 'active' || gradeMap.has(enrollment.studentId))
      .map((enrollment) => ({
      student: enrollment.student,
      enrollmentStatus: enrollment.status,
      closedPlanId: closedPlans.find((plan) => (gradeMap.get(enrollment.studentId)?.gradedAt ?? gradeMap.get(enrollment.studentId)?.createdAt ?? new Date(8640000000000000)) <= plan.updatedAt && (plan.studentId === enrollment.studentId || plan.participants.some((participant) => participant.studentId === enrollment.studentId)))?.id ?? null,
      grade: gradeMap.has(enrollment.studentId) ? { ...gradeMap.get(enrollment.studentId)!, score: effectiveActivityScore(gradeMap.get(enrollment.studentId)) } : null,
    }))
  }

  async bulkUpsert(
    institutionId: string,
    dto: BulkGradeDto,
    gradedById: string,
  ) {
    // Bloquear la captura si la actividad pertenece a un periodo cerrado
    const activityIds = [...new Set(dto.grades.map((g) => g.activityId))]
    if (activityIds.length > 0) {
      const closed = await prisma.activity.findFirst({
        where: { id: { in: activityIds }, institutionId, academicPeriod: { isClosed: true } },
        select: { id: true },
      })
      if (closed) throw new ConflictError('El período está cerrado: no se pueden modificar las notas')
    }

    const [activities, institution] = await Promise.all([
      prisma.activity.findMany({
        where: { id: { in: activityIds }, institutionId },
        select: {
          id: true,
          activityTypeId: true,
          academicPeriodId: true,
          maxScore: true,
          courseAssignmentId: true,
          activityType: { select: { code: true } },
          courseAssignment: { select: { academicYearId: true } },
        },
      }),
      prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } }),
    ])
    const activityById = new Map(activities.map((activity) => [activity.id, activity]))
    const settings = (institution?.settings ?? {}) as {
      gradingConfig?: {
        activityGradeReinforcement?: {
          mode?: 'replace' | 'average'
          eligibleActivityTypeIds?: string[]
        }
      }
    }
    const reinforcementConfig = settings.gradingConfig?.activityGradeReinforcement
    const eligibleTypeIds = new Set(reinforcementConfig?.eligibleActivityTypeIds ?? [])
    const configuredMode = reinforcementConfig?.mode ?? 'replace'
    // Reglas del Acuerdo 2026-00082-A por año lectivo (null = comportamiento histórico)
    const agreementByYear = new Map<string, AgreementRules | null>()
    const agreementOf = (activity: { courseAssignment: { academicYearId: string } }) => {
      const yearId = activity.courseAssignment.academicYearId
      if (!agreementByYear.has(yearId)) agreementByYear.set(yearId, resolveAgreement(institution?.settings, yearId))
      return agreementByYear.get(yearId) ?? null
    }
    const isSummative = (activity: { activityType: { code: string } }) => activityKind(activity.activityType.code) !== 'regular'

    // Validación previa (todo o nada): estados válidos, notas dentro de 0..máx
    // y estudiantes matriculados en el paralelo de la actividad.
    const enrollmentsByActivity = new Map<string, Set<string>>()
    const activityCtx = await prisma.activity.findMany({
      where: { id: { in: activityIds }, institutionId },
      select: { id: true, courseAssignment: { select: { parallelId: true, academicYearId: true } } },
    })
    for (const a of activityCtx) {
      const enrolled = await prisma.studentEnrollment.findMany({
        where: { institutionId, parallelId: a.courseAssignment.parallelId, academicYearId: a.courseAssignment.academicYearId },
        select: { studentId: true },
      })
      enrollmentsByActivity.set(a.id, new Set(enrolled.map((e) => e.studentId)))
    }
    for (const g of dto.grades) {
      const activity = activityById.get(g.activityId)
      if (!activity) throw new NotFoundError('Actividad no encontrada')
      const max = Number(activity.maxScore)
      if (g.status !== undefined && !GRADE_STATUSES.has(g.status)) {
        throw new ValidationError(`Estado de entrega inválido: ${g.status}`)
      }
      if (g.score != null && (!Number.isFinite(Number(g.score)) || Number(g.score) < 0 || Number(g.score) > max)) {
        throw new ValidationError(`La nota debe estar entre 0 y ${max}`)
      }
      if (!enrollmentsByActivity.get(g.activityId)?.has(g.studentId)) {
        throw new ValidationError('Hay estudiantes que no pertenecen al paralelo de la actividad')
      }
    }

    const existingGrades = await prisma.grade.findMany({
      where: {
        institutionId,
        activityId: { in: activityIds },
        studentId: { in: [...new Set(dto.grades.map((g) => g.studentId))] },
      },
    })
    const existingByKey = new Map(existingGrades.map((g) => [`${g.activityId}:${g.studentId}`, g]))

    // Límites anuales de mejora de SUMATIVAS (art. 11–12): se cuentan las notas
    // ya mejoradas del estudiante en el año, excluyendo las que se reescriben ahora.
    const improvementCounts = new Map<string, number>()
    const batchKeys = new Set(dto.grades.map((g) => `${g.activityId}:${g.studentId}`))
    const yearsWithAgreement = [...new Set(activities.filter((a) => agreementOf(a)).map((a) => a.courseAssignment.academicYearId))]
    if (yearsWithAgreement.length > 0) {
      const prior = await prisma.grade.findMany({
        where: {
          institutionId,
          studentId: { in: [...new Set(dto.grades.map((g) => g.studentId))] },
          reinforcementMode: { in: [...SUMMATIVE_IMPROVEMENT_MODES] },
          activity: { courseAssignment: { academicYearId: { in: yearsWithAgreement } } },
        },
        select: { activityId: true, studentId: true, reinforcementMode: true, activity: { select: { courseAssignmentId: true, courseAssignment: { select: { academicYearId: true } } } } },
      })
      for (const g of prior) {
        if (batchKeys.has(`${g.activityId}:${g.studentId}`)) continue
        const y = g.activity.courseAssignment.academicYearId
        for (const k of [`${g.reinforcementMode}:${g.studentId}:${y}`, `${g.reinforcementMode}:${g.studentId}:${y}:${g.activity.courseAssignmentId}`]) {
          improvementCounts.set(k, (improvementCounts.get(k) ?? 0) + 1)
        }
      }
    }

    const operations = dto.grades.map((g) => {
        const activity = activityById.get(g.activityId)
        if (!activity) throw new NotFoundError('Actividad no encontrada')
        if (g.reinforcementScore !== undefined && g.reinforcementScore !== null) {
          // Con el Acuerdo 2026-00082-A el refuerzo es un derecho (art. 10.4): si la institución
          // no restringió tipos, se permite en todos; si configuró una lista, se respeta.
          const agreementOpen = !!agreementOf(activity) && eligibleTypeIds.size === 0
          if (!agreementOpen && !eligibleTypeIds.has(activity.activityTypeId)) {
            throw new ConflictError('El tipo de esta actividad no permite registrar nota de refuerzo')
          }
          if (g.reinforcementScore < 0 || g.reinforcementScore > Number(activity.maxScore)) {
            throw new ConflictError('La nota de refuerzo está fuera del rango permitido')
          }
        }

        const existing = existingByKey.get(`${g.activityId}:${g.studentId}`)
        const status = g.status ?? 'entregado'
        const rules = agreementOf(activity)
        const summative = isSummative(activity)
        // Regla de negocio del estado de entrega:
        //  - no_realizado → cuenta como 0 si no se ingresó otra nota
        //  - excusado     → se ignora en el promedio (score null + isExcused)
        let score = g.score == null ? null : Number(g.score)
        let isExcused = false
        if (status === 'no_realizado') {
          // Art. 18: la evaluación (sumativa) no rendida sin justificación se registra con la nota configurada.
          const unjustified = rules && (rules.lateAssessment.applyTo === 'all' || summative)
            ? rules.lateAssessment.unjustifiedScore * (Number(activity.maxScore) / 10)
            : 0
          score = g.score ?? unjustified
        } else if (status === 'excusado') {
          score = null
          isExcused = true
        }

        const baseScore = score
        const reinforcementScore = g.reinforcementScore !== undefined
          ? (g.reinforcementScore == null ? null : Number(g.reinforcementScore))
          : existing?.reinforcementScore != null
            ? Number(existing.reinforcementScore)
            : null
        let reinforcementMode = g.reinforcementScore !== undefined
          ? (reinforcementScore == null ? null : configuredMode)
          : existing?.reinforcementMode ?? null
        if (baseScore != null && reinforcementScore != null && rules) {
          // Acuerdo 2026-00082-A: formativa → promedio con tope; sumativa → mejora directa o con refuerzo.
          const r = improvedScore(rules, baseScore, reinforcementScore, summative, Number(activity.maxScore))
          if (r.mode === null) {
            throw new ConflictError('La nota inicial de esta evaluación sumativa no habilita mejora según la configuración del acuerdo')
          }
          reinforcementMode = `agreement_${r.mode}`
          if (r.mode !== 'formative') {
            const rule = r.mode === 'direct' ? rules.summativeImprovement.direct : rules.summativeImprovement.withReinforcement
            const y = activity.courseAssignment.academicYearId
            const kYear = `${reinforcementMode}:${g.studentId}:${y}`
            const kSubject = `${kYear}:${activity.courseAssignmentId}`
            const nYear = (improvementCounts.get(kYear) ?? 0) + 1
            const nSubject = (improvementCounts.get(kSubject) ?? 0) + 1
            if (rule.perSubject > 0 && nSubject > rule.perSubject) {
              throw new ConflictError(`Se alcanzó el máximo de ${rule.perSubject} evaluación(es) sumativa(s) mejorada(s) en esta asignatura`)
            }
            if (rule.perYear > 0 && nYear > rule.perYear) {
              throw new ConflictError(`Se alcanzó el máximo de ${rule.perYear} evaluaciones sumativas mejoradas en el año`)
            }
            improvementCounts.set(kYear, nYear)
            improvementCounts.set(kSubject, nSubject)
          }
          score = r.score
        } else if (baseScore != null && reinforcementScore != null) {
          score = Math.max(baseScore, reinforcementMode === 'average' ? (baseScore + reinforcementScore) / 2 : reinforcementScore)
        }

        return {
          where: {
            activityId_studentId: {
              activityId: g.activityId,
              studentId: g.studentId,
            },
          },
          create: {
            institutionId,
            activityId: g.activityId,
            studentId: g.studentId,
            score,
            baseScore: reinforcementScore == null ? null : baseScore,
            reinforcementScore,
            reinforcementMode,
            reinforcementRecordedAt: reinforcementScore == null ? null : new Date(),
            status,
            isExcused,
            notes: g.notes,
            gradedBy: gradedById,
            gradedAt: new Date(),
          },
          update: {
            score,
            baseScore: reinforcementScore == null ? null : baseScore,
            reinforcementScore,
            reinforcementMode,
            ...(g.reinforcementScore !== undefined && {
              reinforcementRecordedAt: reinforcementScore == null ? null : new Date(),
            }),
            status,
            isExcused,
            notes: g.notes,
            gradedBy: gradedById,
            gradedAt: new Date(),
          },
        } satisfies Prisma.GradeUpsertArgs
      })
    // Una sola transacción: si algo falla no quedan notas guardadas a medias.
    return prisma.$transaction(async (tx) => {
      await assertReinforcementGradesOpen(tx, institutionId, dto.grades.map((grade) => ({ studentId: grade.studentId, courseAssignmentId: activityById.get(grade.activityId)!.courseAssignmentId, academicPeriodId: activityById.get(grade.activityId)!.academicPeriodId, recordedAt: existingByKey.get(`${grade.activityId}:${grade.studentId}`)?.gradedAt ?? existingByKey.get(`${grade.activityId}:${grade.studentId}`)?.createdAt ?? new Date(8640000000000000) })))
      const result = []
      for (const operation of operations) result.push(await tx.grade.upsert(operation))
      return result
    }, { timeout: 60000 })
  }

  async bulkUpsertManualInsumoAverages(
    institutionId: string,
    dto: BulkManualInsumoAverageDto,
    recordedBy: string,
    roles: string[],
  ) {
    if (dto.items.length === 0) return []
    const insumoIds = [...new Set(dto.items.map((item) => item.insumoId))]
    const insumos = await prisma.insumo.findMany({
      where: { id: { in: insumoIds }, institutionId },
      include: {
        academicPeriod: { select: { isClosed: true } },
        courseAssignment: { select: { teacherId: true, parallelId: true, academicYearId: true } },
      },
    })
    if (insumos.length !== insumoIds.length) throw new NotFoundError('Insumo no encontrado')
    if (insumos.some((insumo) => insumo.academicPeriod.isClosed)) {
      throw new ConflictError('El período está cerrado: no se pueden modificar los promedios')
    }
    const isTeacherOnly = roles.includes('teacher') && !roles.includes('admin') && !roles.includes('rector')
    if (isTeacherOnly) {
      const unauthorized = insumos.some((insumo) => insumo.courseAssignment.teacherId !== recordedBy)
      if (unauthorized) throw new ConflictError('Solo puedes ingresar promedios de tus propias materias')
    }
    const studentIds = [...new Set(dto.items.map((item) => item.studentId))]
    const validEnrollments = await prisma.studentEnrollment.findMany({
      where: {
        institutionId,
        studentId: { in: studentIds },
        OR: insumos.map((insumo) => ({
          parallelId: insumo.courseAssignment.parallelId,
          academicYearId: insumo.courseAssignment.academicYearId,
        })),
      },
      select: { studentId: true, parallelId: true, academicYearId: true },
    })
    for (const item of dto.items) {
      const insumo = insumos.find((candidate) => candidate.id === item.insumoId)!
      const enrolled = validEnrollments.some((enrollment) =>
        enrollment.studentId === item.studentId
        && enrollment.parallelId === insumo.courseAssignment.parallelId
        && enrollment.academicYearId === insumo.courseAssignment.academicYearId)
      if (!enrolled) throw new ConflictError('El estudiante no pertenece al paralelo de este insumo')
    }
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    const max = (institution?.settings as { gradingConfig?: { gradingScaleMax?: number } } | null)
      ?.gradingConfig?.gradingScaleMax ?? 10

    const formative = await loadFormativeApplications(
      institutionId,
      [...new Set(insumos.map((i) => i.courseAssignmentId))],
      [...new Set(insumos.map((i) => i.academicPeriodId))],
      studentIds,
    )
    const current = await computePeriodGrades(institutionId, { assignmentIds: [...new Set(insumos.map((insumo) => insumo.courseAssignmentId))], periodIds: [...new Set(insumos.map((insumo) => insumo.academicPeriodId))], studentIds, gradingScaleMax: max })
    for (const item of dto.items.filter((i) => i.score != null)) {
      const insumo = insumos.find((i) => i.id === item.insumoId)!
      const application = formative.get(`${item.studentId}:${insumo.courseAssignmentId}:${insumo.academicPeriodId}`)
      if ((application?.mode === 'activity_set' && application.score != null) || current.get(`${item.studentId}:${insumo.courseAssignmentId}:${insumo.academicPeriodId}`)?.formativeReinforcement?.mode === 'activity_set') {
        throw new ConflictError('Existe refuerzo por conjunto de actividades. Retira su aplicación antes de ingresar promedios manuales por insumo.')
      }
    }

    return prisma.$transaction(async (tx) => {
      await assertReinforcementGradesOpen(tx, institutionId, dto.items.map((item) => { const insumo = insumos.find((row) => row.id === item.insumoId)!; return { studentId: item.studentId, courseAssignmentId: insumo.courseAssignmentId, academicPeriodId: insumo.academicPeriodId } }))
      return Promise.all(dto.items.map((item) => {
        if (item.score == null) {
          return tx.manualInsumoAverage.upsert({
            where: { insumoId_studentId: { insumoId: item.insumoId, studentId: item.studentId } },
            create: { institutionId, insumoId: item.insumoId, studentId: item.studentId, score: null, reason: item.reason, recordedBy },
            update: { score: null, reason: item.reason, recordedBy },
          })
        }
        if (!Number.isFinite(item.score) || item.score < 0 || item.score > max) {
          throw new ConflictError(`El promedio manual debe estar entre 0 y ${max}`)
        }
        return tx.manualInsumoAverage.upsert({
          where: { insumoId_studentId: { insumoId: item.insumoId, studentId: item.studentId } },
          create: { institutionId, insumoId: item.insumoId, studentId: item.studentId, score: item.score, reason: item.reason, recordedBy },
          update: { score: item.score, reason: item.reason, recordedBy },
        })
      }))
    }, { timeout: 60000 })
  }

  async getStudentGrades(
    studentId: string,
    institutionId: string,
    courseAssignmentId?: string,
    periodId?: string,
  ) {
    const grades = await prisma.grade.findMany({
      where: {
        institutionId,
        studentId,
        activity: {
          ...(courseAssignmentId && { courseAssignmentId }),
          ...(periodId && { academicPeriodId: periodId }),
        },
      },
      include: {
        activity: {
          include: {
            activityType: true,
            insumo: { select: { id: true, name: true, sortOrder: true } },
            academicPeriod: { select: { id: true, name: true } },
            courseAssignment: {
              include: {
                subject: true,
                parallel: { include: { level: true } },
              },
            },
          },
        },
      },
      orderBy: [
        { activity: { insumo: { sortOrder: 'asc' } } },
        { activity: { activityDate: 'asc' } },
      ],
    })

    // Group by insumo
    type StudentGradeView = Omit<(typeof grades)[number], 'score'> & { score: number | null }
    const grouped = new Map<string, { insumo: object | null; activities: StudentGradeView[] }>()
    for (const grade of grades) {
      const key = grade.activity.insumoId ?? '__no_insumo__'
      if (!grouped.has(key)) {
        grouped.set(key, {
          insumo: grade.activity.insumo,
          activities: [],
        })
      }
      grouped.get(key)!.activities.push({ ...grade, score: effectiveActivityScore(grade) })
    }

    return Array.from(grouped.values())
  }

  async getGradesSummary(institutionId: string, courseAssignmentId: string, periodId: string) {
    const insumos = await prisma.insumo.findMany({
      where: {
        institutionId,
        courseAssignmentId,
        academicPeriodId: periodId,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        activities: {
          where: { isPublished: true },
          orderBy: { activityDate: 'asc' },
          include: {
            activityType: true,
            grades: {
              where: { institutionId },
              select: { score: true, baseScore: true, reinforcementScore: true, reinforcementMode: true, studentId: true },
            },
          },
        },
      },
    })

    return insumos.map((insumo) => ({
      id: insumo.id,
      name: insumo.name,
      weight: insumo.weight,
      sortOrder: insumo.sortOrder,
      activities: insumo.activities.map((activity) => {
        const scoredGrades = activity.grades.map((grade) => effectiveActivityScore(grade)).filter((score): score is number => score != null)
        const average =
          scoredGrades.length > 0
            ? scoredGrades.reduce((sum, score) => sum + score, 0) / scoredGrades.length
            : null

        return {
          id: activity.id,
          name: activity.name,
          maxScore: activity.maxScore,
          activityDate: activity.activityDate,
          activityType: activity.activityType,
          gradeCount: activity.grades.length,
          scoredCount: scoredGrades.length,
          average,
        }
      }),
    }))
  }
}
