import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { buildSituationTitle } from '../../domain/situation-title'
import { distributeCompetencyWeeks } from '../../domain/competency-week-distribution'
import type {
  ConfirmDistributionDto,
  ConfirmDistributionWeekDto,
  CreatePlanDto,
  CreateSituationDto,
  CreateTemplateDto,
  CreateWeekDto,
  PlanningTemplateType,
  SuggestDistributionDto,
  SuggestDistributionResult,
  UpdatePlanDto,
  UpdateSituationDto,
  UpdateTemplateDto,
  UpdateWeekDto,
} from '../../application/dtos/planning.dto'

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000

function calendarWeeksBetween(startDate: Date, endDate: Date): number {
  return Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / MS_PER_WEEK))
}

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
        // Solo el status de cada situación — la UI (PlanningListPage) deriva de
        // aquí el indicador de completitud del plan, nunca de CurriculumPlan.status.
        situations: { select: { status: true } },
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

  // Sin flujo de aprobación por terceros para el plan padre — el PCA/Planificación
  // por Competencias siempre es editable (ver comentario en CurriculumPlan.status
  // del schema). submitPlan/approvePlan eliminados junto con sus endpoints.
  async updatePlan(id: string, institutionId: string, dto: UpdatePlanDto) {
    const plan = await prisma.curriculumPlan.findFirst({ where: { id, institutionId } })
    if (!plan) throw new NotFoundError('Plan no encontrado')

    return prisma.curriculumPlan.update({
      where: { id },
      data: { ...(dto.data !== undefined && { data: dto.data as unknown as Prisma.InputJsonValue }) },
    })
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

    const period = await prisma.academicPeriod.findUnique({
      where: { id: dto.academicPeriodId },
      select: { name: true, startDate: true, endDate: true },
    })
    if (!period) throw new NotFoundError('Periodo académico no encontrado')

    const competencyIds = dto.competencyIds ?? []

    // El título se deriva de la competencia para que el docente no tenga que
    // escribir nada: solo selecciona periodo y competencia. Se resuelve aquí y
    // no en el cliente porque el texto de la competencia ya está en la base.
    let title = dto.title?.trim()
    if (!title && competencyIds.length) {
      const competency = await prisma.competency.findFirst({
        where: { id: { in: competencyIds }, area: { institutionId } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: { code: true, text: true },
      })
      if (competency) title = buildSituationTitle(competency.code, competency.text)
    }
    if (!title) title = period.name

    return prisma.learningSituation.create({
      data: {
        institutionId,
        planId: dto.planId,
        academicPeriodId: dto.academicPeriodId,
        title,
        description: dto.description,
        // Sin fechas explícitas, el bloque cubre el periodo completo — el docente
        // las ajusta después si el bloque es más corto.
        startDate: dto.startDate ? new Date(dto.startDate) : period.startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : period.endDate,
        interdisciplinaryAreaIds: dto.interdisciplinaryAreaIds ?? [],
        interdisciplinarySubjectIds: dto.interdisciplinarySubjectIds ?? [],
        competencyIds,
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
        ...(dto.competencyIds !== undefined && { competencyIds: dto.competencyIds }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        ...(dto.endDate !== undefined && { endDate: dto.endDate ? new Date(dto.endDate) : null }),
        ...(dto.interdisciplinaryAreaIds !== undefined && { interdisciplinaryAreaIds: dto.interdisciplinaryAreaIds }),
        ...(dto.interdisciplinarySubjectIds !== undefined && { interdisciplinarySubjectIds: dto.interdisciplinarySubjectIds }),
      },
    })
  }

  /** El docente marca la situación como terminada — sin aprobación de terceros (ver comentario en SituationStatus). */
  async markSituationReady(id: string, institutionId: string, actorId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'borrador') throw new ConflictError('Solo una situación en borrador puede marcarse como lista')

    const updated = await prisma.learningSituation.update({ where: { id }, data: { status: 'listo' } })
    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: actorId,
        action: 'planning.mark_situation_ready',
        resourceType: 'learning_situation',
        resourceId: id,
        newValue: { status: 'listo' },
      },
    })
    return updated
  }

  /** El docente puede volver a editar una situación ya marcada como lista. */
  async reopenSituation(id: string, institutionId: string, actorId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'listo') throw new ConflictError('Solo una situación lista puede volver a borrador')

    const updated = await prisma.learningSituation.update({ where: { id }, data: { status: 'borrador' } })
    await prisma.auditLog.create({
      data: {
        institutionId,
        userId: actorId,
        action: 'planning.reopen_situation',
        resourceType: 'learning_situation',
        resourceId: id,
        newValue: { status: 'borrador' },
      },
    })
    return updated
  }

  async deleteSituation(id: string, institutionId: string) {
    const situation = await prisma.learningSituation.findFirst({ where: { id, institutionId } })
    if (!situation) throw new NotFoundError('Situación de aprendizaje no encontrada')
    if (situation.status !== 'borrador') {
      throw new ConflictError('Solo una situación en borrador puede eliminarse')
    }
    // PlanningWeek no tiene onDelete: Cascade — se borran explícitamente primero.
    await prisma.$transaction([
      prisma.planningWeek.deleteMany({ where: { situationId: id } }),
      prisma.learningSituation.delete({ where: { id } }),
    ])
    return { ok: true }
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
        competencyIds: dto.competencyIds ?? [],
        competencyIndicatorIds: dto.competencyIndicatorIds ?? [],
        competencySaberIds: dto.competencySaberIds ?? [],
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
        ...(dto.competencyIds !== undefined && { competencyIds: dto.competencyIds }),
        ...(dto.competencyIndicatorIds !== undefined && { competencyIndicatorIds: dto.competencyIndicatorIds }),
        ...(dto.competencySaberIds !== undefined && { competencySaberIds: dto.competencySaberIds }),
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
    const interdisciplinarySubjects = situation.interdisciplinarySubjectIds.length
      ? await prisma.subject.findMany({ where: { id: { in: situation.interdisciplinarySubjectIds } } })
      : []

    const allSaberIds = Array.from(new Set(situation.weeks.flatMap((w) => w.saberIds)))
    const sabers = allSaberIds.length
      ? await prisma.curriculumSaber.findMany({ where: { id: { in: allSaberIds } } })
      : []
    const saberById = new Map(sabers.map((s) => [s.id, s]))

    // Modelo por competencias: cada semana que use competencyIds trae su propio banco de
    // saberes/competencias, en vez del de destrezas — se resuelven aparte y se combinan
    // en el mismo shape que el PDF ya sabe renderizar.
    const allCompetencyIds = Array.from(new Set(situation.weeks.flatMap((w) => w.competencyIds)))
    const allCompetencySaberIds = Array.from(new Set(situation.weeks.flatMap((w) => w.competencySaberIds)))
    const allCompetencyIndicatorIds = Array.from(new Set(situation.weeks.flatMap((w) => w.competencyIndicatorIds)))
    const [competencies, competencySabers, competencyIndicators] = await Promise.all([
      allCompetencyIds.length ? prisma.competency.findMany({ where: { id: { in: allCompetencyIds } } }) : [],
      allCompetencySaberIds.length
        ? prisma.competencySaber.findMany({ where: { id: { in: allCompetencySaberIds } } })
        : [],
      allCompetencyIndicatorIds.length
        ? prisma.competencyIndicator.findMany({ where: { id: { in: allCompetencyIndicatorIds } } })
        : [],
    ])
    const competencyById = new Map(competencies.map((c) => [c.id, c]))
    const competencySaberById = new Map(competencySabers.map((s) => [s.id, s]))
    const competencyIndicatorById = new Map(competencyIndicators.map((i) => [i.id, i]))

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
      interdisciplinarySubjectNames: interdisciplinarySubjects.map((s) => s.name),
      weeks: situation.weeks.map((week) => {
        // Si la semana usó el modelo por competencias, el texto de "competencias
        // específicas" se deriva de las competencias elegidas (no hay campo de texto
        // libre en ese modelo — es lo que ya seleccionó el docente).
        const competencyTexts = week.competencyIds
          .map((cid) => competencyById.get(cid))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => `[${c.code}] ${c.text}`)
        const competencySaberes = week.competencySaberIds
          .map((sid) => competencySaberById.get(sid))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({ type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description }))

        // Formato CNC/TIGA: "Competencia(s)"/"Indicador(es)"/"Saberes movilizados" se
        // imprimen como CÓDIGOS separados por coma bajo el título de semana — nunca
        // el texto/descripción completo, que ya se ve en el propio contenido de la
        // tabla. Solo aplica al modelo por competencias (isCompetencyModel).
        const competencyCodes = week.competencyIds.map((cid) => competencyById.get(cid)?.code).filter((c): c is string => !!c)
        // El generador embebe los códigos como "[CODE] texto" dentro de indicadoresEvaluacion
        // (ver formatIndicatorsWithCode en competency-pedagogical-generator.service.ts) — se
        // extraen de ahí en vez de depender de competencyIndicatorIds (que ese flujo no llena).
        // Si la semana sí tiene competencyIndicatorIds explícitos (edición manual futura), se
        // priorizan esos.
        const indicatorCodesForWeek = week.competencyIndicatorIds.length
          ? week.competencyIndicatorIds
              .map((iid) => competencyIndicatorById.get(iid)?.code)
              .filter((c): c is string => !!c)
          : [...(week.indicadoresEvaluacion ?? '').matchAll(/\[([^\]]+)\]/g)].map((m) => m[1])
        const saberCodesForWeek = competencySaberes.map((s) => s.code)
        const isCompetencyModel = week.competencyIds.length > 0

        return {
          weekNumber: week.weekNumber,
          name: week.name,
          startDate: week.startDate,
          endDate: week.endDate,
          competenciasEspecificas: competencyTexts.length ? competencyTexts.join('\n') : week.competenciasEspecificas,
          indicadoresEvaluacion: week.indicadoresEvaluacion,
          saberes: competencySaberes.length
            ? competencySaberes
            : week.saberIds
                .map((sid) => saberById.get(sid))
                .filter((s): s is NonNullable<typeof s> => !!s)
                .map((s) => ({ type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description })),
          momentos: (week.momentos ?? {}) as Record<string, { estrategiasDua?: string; recursos?: string; tecnica?: string; instrumento?: string }>,
          isCompetencyModel,
          competencyCodes,
          indicatorCodesForWeek,
          saberCodesForWeek,
          competencyMomentos: isCompetencyModel
            ? (week.momentos as unknown as import('../../../../shared/domain/pedagogical-methodology').CompetencyWeekMomentos)
            : undefined,
        }
      }),
      // El pie de firmas "Elaborado/Revisado/Aprobado" es parte del formato oficial
      // MINEDUC del documento — se conserva visualmente (no se elimina el layout),
      // pero ya no hay flujo de revisión/aprobación por terceros para esta Situación
      // de Aprendizaje (solo borrador/listo, ver SituationStatus): reviewedAt/
      // approvedAt quedan en desuso (no se escriben más) y las filas correspondientes
      // ya no traen fecha — quedan en blanco para llenado manual si la institución
      // igual las hace firmar en papel.
      signatories: [
        { role: 'Elaborado por: Docente(s)', name: teacherProfile ? `${teacherProfile.firstName} ${teacherProfile.lastName}` : null, date: null },
        { role: 'Revisado por: Director de área/subnivel', name: null, date: null },
        { role: 'Aprobado por: Subdirección', name: null, date: null },
      ],
    }
  }

  // ─── Distribución de competencias/saberes por semana ───────────────────
  // Reemplaza la elección manual de "situación de aprendizaje": el docente ya
  // eligió materia+grado (CourseAssignment) y aquí solo elige periodo + número
  // de semanas — el sistema sugiere la distribución, el docente la confirma o
  // edita, y SOLO entonces se genera el resto (ver draftSituationBlock).

  private async resolveAssignmentForDistribution(courseAssignmentId: string, institutionId: string) {
    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: courseAssignmentId, institutionId },
      include: { subject: true, parallel: { include: { level: true } } },
    })
    if (!assignment) throw new NotFoundError('Asignación de curso no encontrada')
    if (!assignment.subject.competencyAreaId) {
      throw new ConflictError('Esta materia no tiene área de competencias vinculada')
    }
    const subnivel = assignment.parallel.level.subnivel
    if (!subnivel) throw new ConflictError('El grado de esta asignación no tiene subnivel configurado')
    return { assignment, competencyAreaId: assignment.subject.competencyAreaId, subnivel }
  }

  /** Competencias del área+subnivel de la asignación, excluyendo las ya usadas en OTRAS situaciones (otros periodos) del mismo plan — progresión real a través del año. */
  private async availableCompetenciesForDistribution(
    courseAssignmentId: string,
    academicPeriodId: string,
    competencyAreaId: string,
    subnivel: string,
  ) {
    const plan = await prisma.curriculumPlan.findUnique({ where: { courseAssignmentId } })
    const usedElsewhere = plan
      ? await prisma.learningSituation.findMany({
          where: { planId: plan.id, academicPeriodId: { not: academicPeriodId } },
          select: { competencyIds: true },
        })
      : []
    const usedCompetencyIds = new Set(usedElsewhere.flatMap((s) => s.competencyIds))

    const competencies = await prisma.competency.findMany({
      where: { areaId: competencyAreaId, subnivel, isActive: true, id: { notIn: [...usedCompetencyIds] } },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: { sabers: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] } },
    })
    return competencies.map((c) => ({
      id: c.id,
      code: c.code,
      text: c.text,
      sabers: c.sabers.map((s) => ({ id: s.id, type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description })),
    }))
  }

  async suggestDistribution(
    institutionId: string,
    courseAssignmentId: string,
    academicPeriodId: string,
    dto: SuggestDistributionDto,
  ): Promise<SuggestDistributionResult> {
    if (dto.weeksCount < 2) throw new ConflictError('Un periodo académico debe tener al menos 2 semanas')

    const period = await prisma.academicPeriod.findFirst({ where: { id: academicPeriodId } })
    if (!period) throw new NotFoundError('Periodo académico no encontrado')

    const { competencyAreaId, subnivel } = await this.resolveAssignmentForDistribution(courseAssignmentId, institutionId)
    const competencies = await this.availableCompetenciesForDistribution(courseAssignmentId, academicPeriodId, competencyAreaId, subnivel)

    const calendarWeeks = calendarWeeksBetween(period.startDate, period.endDate)
    const { weeks, coverageWarning } = distributeCompetencyWeeks(competencies, dto.weeksCount)

    return {
      weeks,
      calendarWeeks,
      coverageWarning,
      weeksCountWarning:
        Math.abs(dto.weeksCount - calendarWeeks) > 2
          ? `El periodo "${period.name}" tiene aproximadamente ${calendarWeeks} semanas en el calendario — revisa si ${dto.weeksCount} es el número correcto.`
          : undefined,
    }
  }

  async confirmDistribution(
    institutionId: string,
    actorId: string,
    courseAssignmentId: string,
    academicPeriodId: string,
    dto: ConfirmDistributionDto,
  ) {
    if (dto.weeksCount < 2) throw new ConflictError('Un periodo académico debe tener al menos 2 semanas')
    if (dto.weeks.length === 0) throw new ConflictError('La distribución no puede estar vacía')

    await this.resolveAssignmentForDistribution(courseAssignmentId, institutionId)

    const period = await prisma.academicPeriod.findFirst({ where: { id: academicPeriodId } })
    if (!period) throw new NotFoundError('Periodo académico no encontrado')

    let plan = await prisma.curriculumPlan.findUnique({ where: { courseAssignmentId } })
    if (!plan) {
      const templateId = (await this.getDefaultTemplate(institutionId, 'pca')).id
      plan = await prisma.curriculumPlan.create({
        data: { institutionId, courseAssignmentId, templateId, createdBy: actorId },
      })
    }

    const competencyIds = [...new Set(dto.weeks.map((w) => w.competencyId))]

    // Como máximo UNA situación por plan+periodo — si ya existe (ej. el docente
    // vuelve a confirmar una distribución editada), se reutiliza en vez de
    // duplicar (mismo contrato implícito que multigrade-week-generator.ensureSituation).
    let situation = await prisma.learningSituation.findFirst({ where: { planId: plan.id, academicPeriodId } })
    if (situation) {
      situation = await prisma.learningSituation.update({
        where: { id: situation.id },
        data: { competencyIds },
      })
    } else {
      const anchorCompetency = await prisma.competency.findFirst({
        where: { id: { in: competencyIds } },
        orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        select: { code: true, text: true },
      })
      const title = anchorCompetency ? buildSituationTitle(anchorCompetency.code, anchorCompetency.text) : period.name
      situation = await prisma.learningSituation.create({
        data: {
          institutionId,
          planId: plan.id,
          academicPeriodId,
          title,
          startDate: period.startDate,
          endDate: period.endDate,
          interdisciplinaryAreaIds: [],
          interdisciplinarySubjectIds: [],
          competencyIds,
          createdBy: actorId,
        },
      })
    }

    const weeks = await Promise.all(
      dto.weeks.map((w: ConfirmDistributionWeekDto) =>
        prisma.planningWeek.upsert({
          where: { situationId_weekNumber: { situationId: situation!.id, weekNumber: w.weekNumber } },
          create: {
            institutionId,
            situationId: situation!.id,
            weekNumber: w.weekNumber,
            competencyIds: [w.competencyId],
            competencySaberIds: w.saberIds,
          },
          update: {
            competencyIds: [w.competencyId],
            competencySaberIds: w.saberIds,
          },
        }),
      ),
    )

    return { situation, weeks }
  }
}
