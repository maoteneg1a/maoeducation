import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreatePlanDto,
  CreateSituationDto,
  CreateTemplateDto,
  CreateWeekDto,
  PlanningTemplateType,
  UpdatePlanDto,
  UpdateSituationDto,
  UpdateTemplateDto,
  UpdateWeekDto,
} from '../../application/dtos/planning.dto'

export class PrismaPlanningRepository {
  // ─── Plantillas (solo PCA) ──────────────────────────────────────────────
  listTemplates(institutionId: string, type?: PlanningTemplateType) {
    return prisma.planningTemplate.findMany({
      where: { institutionId, ...(type && { type }) },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    })
  }

  async getDefaultTemplate(institutionId: string, type: PlanningTemplateType) {
    const t =
      (await prisma.planningTemplate.findFirst({
        where: { institutionId, type, isDefault: true, isActive: true },
      })) ?? (await prisma.planningTemplate.findFirst({ where: { institutionId, type, isActive: true } }))
    if (!t) throw new NotFoundError(`No hay plantilla de ${type.toUpperCase()} configurada`)
    return t
  }

  createTemplate(institutionId: string, dto: CreateTemplateDto) {
    return prisma.planningTemplate.create({
      data: {
        institutionId,
        type: dto.type,
        name: dto.name,
        schema: dto.schema as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async updateTemplate(id: string, institutionId: string, dto: UpdateTemplateDto) {
    const t = await prisma.planningTemplate.findFirst({ where: { id, institutionId } })
    if (!t) throw new NotFoundError('Plantilla no encontrada')

    if (dto.isDefault) {
      await prisma.planningTemplate.updateMany({
        where: { institutionId, type: t.type, id: { not: id } },
        data: { isDefault: false },
      })
    }

    return prisma.planningTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.schema !== undefined && { schema: dto.schema as unknown as Prisma.InputJsonValue }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }

  // ─── PCA (CurriculumPlan) ───────────────────────────────────────────────
  listPlans(institutionId: string, courseAssignmentIds?: string[]) {
    return prisma.curriculumPlan.findMany({
      where: {
        institutionId,
        ...(courseAssignmentIds && { courseAssignmentId: { in: courseAssignmentIds } }),
      },
      include: {
        courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } },
        template: true,
        _count: { select: { situations: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getPlan(id: string, institutionId: string) {
    const plan = await prisma.curriculumPlan.findFirst({
      where: { id, institutionId },
      include: {
        courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } },
        template: true,
        situations: { orderBy: { createdAt: 'asc' }, include: { _count: { select: { weeks: true } } } },
      },
    })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    return plan
  }

  async createPlan(institutionId: string, actorId: string, dto: CreatePlanDto) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')

    const existing = await prisma.curriculumPlan.findUnique({
      where: { courseAssignmentId: dto.courseAssignmentId },
    })
    if (existing) throw new ConflictError('Ya existe un PCA para esta asignación')

    const templateId = dto.templateId ?? (await this.getDefaultTemplate(institutionId, 'pca')).id

    return prisma.curriculumPlan.create({
      data: {
        institutionId,
        courseAssignmentId: dto.courseAssignmentId,
        templateId,
        data: (dto.data ?? {}) as unknown as Prisma.InputJsonValue,
        createdBy: actorId,
      },
      include: { template: true },
    })
  }

  async updatePlan(id: string, institutionId: string, dto: UpdatePlanDto) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    if (plan.status === 'aprobado') throw new ConflictError('El plan ya fue aprobado y no se puede editar')

    return prisma.curriculumPlan.update({
      where: { id },
      data: { ...(dto.data !== undefined && { data: dto.data as unknown as Prisma.InputJsonValue }) },
    })
  }

  async submitPlan(id: string, institutionId: string) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    if (plan.status !== 'borrador') throw new ConflictError('Solo un plan en borrador puede enviarse')
    return prisma.curriculumPlan.update({ where: { id }, data: { status: 'enviado' } })
  }

  async approvePlan(id: string, institutionId: string, approverId: string) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    if (plan.status !== 'enviado') throw new ConflictError('Solo un plan enviado puede aprobarse')

    const updated = await prisma.curriculumPlan.update({
      where: { id },
      data: { status: 'aprobado', approvedBy: approverId, approvedAt: new Date() },
    })
    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: approverId,
        action: 'planning.approve_pca',
        resourceType: 'curriculum_plan',
        resourceId: id,
        newValue: { status: 'aprobado' },
      },
    })
    return updated
  }

  // ─── Situación de aprendizaje ───────────────────────────────────────────
  async listSituations(planId: string, institutionId: string) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id: planId, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')
    return prisma.learningSituation.findMany({
      where: { planId },
      include: { academicPeriod: true, _count: { select: { weeks: true } } },
      orderBy: { createdAt: 'asc' },
    })
  }

  async getSituation(id: string, institutionId: string) {
    const situation = await prisma.learningSituation.findFirst({
      where: { id, institutionId },
      include: {
        academicPeriod: true,
        plan: { include: { courseAssignment: { include: { subject: true, parallel: { include: { level: true } } } } } },
        weeks: { orderBy: { weekNumber: 'asc' } },
      },
    })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    return situation
  }

  async createSituation(institutionId: string, actorId: string, dto: CreateSituationDto) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id: dto.planId, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')

    return prisma.learningSituation.create({
      data: {
        institutionId,
        planId: dto.planId,
        academicPeriodId: dto.academicPeriodId,
        title: dto.title,
        description: dto.description,
        interdisciplinaryAreaIds: dto.interdisciplinaryAreaIds ?? [],
        createdBy: actorId,
      },
    })
  }

  async updateSituation(id: string, institutionId: string, dto: UpdateSituationDto) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status === 'aprobado') throw new ConflictError('Ya fue aprobada y no se puede editar')

    return prisma.learningSituation.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.interdisciplinaryAreaIds !== undefined && { interdisciplinaryAreaIds: dto.interdisciplinaryAreaIds }),
      },
    })
  }

  async submitSituation(id: string, institutionId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'borrador') throw new ConflictError('Solo una situación en borrador puede enviarse')
    return prisma.learningSituation.update({ where: { id }, data: { status: 'enviado' } })
  }

  async reviewSituation(id: string, institutionId: string, reviewerId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'enviado') throw new ConflictError('Solo una situación enviada puede revisarse')

    const updated = await prisma.learningSituation.update({
      where: { id },
      data: { status: 'revisado', reviewedBy: reviewerId, reviewedAt: new Date() },
    })
    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: reviewerId,
        action: 'planning.review_situation',
        resourceType: 'learning_situation',
        resourceId: id,
        newValue: { status: 'revisado' },
      },
    })
    return updated
  }

  async approveSituation(id: string, institutionId: string, approverId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'revisado') throw new ConflictError('Solo una situación revisada puede aprobarse')

    const updated = await prisma.learningSituation.update({
      where: { id },
      data: { status: 'aprobado', approvedBy: approverId, approvedAt: new Date() },
    })
    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: approverId,
        action: 'planning.approve_situation',
        resourceType: 'learning_situation',
        resourceId: id,
        newValue: { status: 'aprobado' },
      },
    })
    return updated
  }

  // ─── Semana (PlanningWeek) ──────────────────────────────────────────────
  async listWeeks(situationId: string, institutionId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id: situationId, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    return prisma.planningWeek.findMany({ where: { situationId }, orderBy: { weekNumber: 'asc' } })
  }

  async getWeek(id: string, institutionId: string) {
    const week = await prisma.planningWeek.findFirst({
      where: { id, institutionId },
      include: { situation: true },
    })
    if (!week) throw new NotFoundError('Semana no encontrada')
    return week
  }

  private assertSituationEditable(status: string) {
    if (status !== 'borrador') {
      throw new ConflictError('La situación de aprendizaje ya no está en borrador — no se pueden editar sus semanas')
    }
  }

  async createWeek(institutionId: string, dto: CreateWeekDto) {
    const situation = await prisma.learningSituation.findFirst({ where: { id: dto.situationId, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    this.assertSituationEditable(situation.status)

    const existing = await prisma.planningWeek.findUnique({
      where: { situationId_weekNumber: { situationId: dto.situationId, weekNumber: dto.weekNumber } },
    })
    if (existing) throw new ConflictError(`Ya existe la semana ${dto.weekNumber} en esta situación`)

    return prisma.planningWeek.create({
      data: {
        institutionId,
        situationId: dto.situationId,
        weekNumber: dto.weekNumber,
        name: dto.name,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        competenciasEspecificas: dto.competenciasEspecificas,
        indicadoresEvaluacion: dto.indicadoresEvaluacion,
        skillIds: dto.skillIds ?? [],
        saberIds: dto.saberIds ?? [],
        momentos: (dto.momentos ?? {}) as unknown as Prisma.InputJsonValue,
      },
    })
  }

  async updateWeek(id: string, institutionId: string, dto: UpdateWeekDto) {
    const week = await prisma.planningWeek.findFirst({ where: { id, institutionId }, include: { situation: true } })
    if (!week) throw new NotFoundError('Semana no encontrada')
    this.assertSituationEditable(week.situation.status)

    return prisma.planningWeek.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.competenciasEspecificas !== undefined && { competenciasEspecificas: dto.competenciasEspecificas }),
        ...(dto.indicadoresEvaluacion !== undefined && { indicadoresEvaluacion: dto.indicadoresEvaluacion }),
        ...(dto.skillIds !== undefined && { skillIds: dto.skillIds }),
        ...(dto.saberIds !== undefined && { saberIds: dto.saberIds }),
        ...(dto.momentos !== undefined && { momentos: dto.momentos as unknown as Prisma.InputJsonValue }),
      },
    })
  }

  async deleteWeek(id: string, institutionId: string) {
    const week = await prisma.planningWeek.findFirst({ where: { id, institutionId }, include: { situation: true } })
    if (!week) throw new NotFoundError('Semana no encontrada')
    this.assertSituationEditable(week.situation.status)
    await prisma.planningWeek.delete({ where: { id } })
    return { ok: true }
  }

  /** Junta todos los datos necesarios para renderizar el PDF de Planificación Microcurricular. */
  async getSituationPdfData(id: string, institutionId: string) {
    const situation = await prisma.learningSituation.findFirst({
      where: { id, institutionId },
      include: {
        academicPeriod: true,
        plan: {
          include: {
            courseAssignment: {
              include: {
                teacher: { include: { profile: true } },
                subject: true,
                parallel: { include: { level: true } },
                academicYear: true,
              },
            },
          },
        },
        weeks: { orderBy: { weekNumber: 'asc' } },
      },
    })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')

    const institution = await prisma.institution.findUnique({ where: { id: institutionId } })
    const settings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }

    const interdisciplinaryAreas = situation.interdisciplinaryAreaIds.length
      ? await prisma.curriculumArea.findMany({ where: { id: { in: situation.interdisciplinaryAreaIds } } })
      : []

    const allSaberIds = Array.from(new Set(situation.weeks.flatMap((w) => w.saberIds)))
    const sabers = allSaberIds.length
      ? await prisma.curriculumSaber.findMany({ where: { id: { in: allSaberIds } } })
      : []
    const saberById = new Map(sabers.map((s) => [s.id, s]))

    const teacherProfile = situation.plan.courseAssignment.teacher.profile

    return {
      institutionName: institution?.name ?? '',
      logoUrl: settings.branding?.logoUrl ?? null,
      yearName: situation.plan.courseAssignment.academicYear.name,
      teacherName: teacherProfile ? `${teacherProfile.firstName} ${teacherProfile.lastName}` : '',
      subjectName: situation.plan.courseAssignment.subject.name,
      levelName: situation.plan.courseAssignment.parallel.level.name,
      parallelName: situation.plan.courseAssignment.parallel.name,
      periodName: situation.academicPeriod.name,
      situationTitle: situation.title,
      situationDescription: situation.description,
      interdisciplinaryAreaNames: interdisciplinaryAreas.map((a) => a.name),
      weeks: situation.weeks.map((week) => ({
        weekNumber: week.weekNumber,
        name: week.name,
        startDate: week.startDate,
        endDate: week.endDate,
        competenciasEspecificas: week.competenciasEspecificas,
        indicadoresEvaluacion: week.indicadoresEvaluacion,
        saberes: week.saberIds
          .map((sid) => saberById.get(sid))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({ type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description })),
        momentos: (week.momentos ?? {}) as Record<string, { estrategiasDua?: string; recursos?: string; tecnica?: string; instrumento?: string }>,
      })),
      signatories: [
        { role: 'Elaborado por: Docente(s)', name: teacherProfile ? `${teacherProfile.firstName} ${teacherProfile.lastName}` : null, date: null },
        { role: 'Revisado por: Director de área/subnivel', name: null, date: situation.reviewedAt },
        { role: 'Aprobado por: Subdirección', name: null, date: situation.approvedAt },
      ],
    }
  }
}
