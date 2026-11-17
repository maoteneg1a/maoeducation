import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { randomUUID } from 'node:crypto'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned, assertCompetenciesArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import type {
  CreateInterdisciplinaryProjectDto,
  ConfigureProjectGradeSharingDto,
  JoinProjectDto,
  ListInterdisciplinaryProjectsQuery,
  UpdateContributionDto,
  UpdateInterdisciplinaryProjectDto,
  UpsertWeekEntryDto,
  SaveProjectGradesDto,
} from '../../application/dtos/interdisciplinary-project.dto'

type ProjectActivityMetadata = {
  interdisciplinaryProjectId?: string
  interdisciplinaryContributionId?: string
  projectGradeShareGroupId?: string
}

const PROJECT_INCLUDE = {
  parallel: { include: { level: true } },
  contributions: {
    include: {
      courseAssignment: {
        include: {
          subject: true,
          teacher: { include: { profile: true } },
        },
      },
      weekEntries: { orderBy: { weekNumber: 'asc' as const } },
    },
  },
}

export class PrismaInterdisciplinaryProjectRepository {
  private async gradingContext(projectId: string, institutionId: string, teacherId: string) {
    const project = await prisma.interdisciplinaryProject.findFirst({
      where: { id: projectId, institutionId },
      include: {
        institution: { select: { settings: true } },
        academicPeriod: { select: { isClosed: true } },
        contributions: {
          where: { courseAssignment: { teacherId } },
          include: { courseAssignment: { include: { subject: true } } },
        },
      },
    })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
    if (project.contributions.length === 0) throw new ConflictError('No tienes materias asignadas en este proyecto')
    return project
  }

  private gradingScale(project: Awaited<ReturnType<PrismaInterdisciplinaryProjectRepository['gradingContext']>>) {
    return (project.institution.settings as { gradingConfig?: { gradingScaleMax?: number } } | null)?.gradingConfig?.gradingScaleMax ?? 10
  }

  private async projectActivities(projectId: string, institutionId: string, assignmentIds: string[]) {
    const rows = await prisma.activity.findMany({
      where: { institutionId, courseAssignmentId: { in: assignmentIds }, activityType: { code: 'project' } },
      include: { grades: true },
    })
    return rows.filter((row) => (row.metadata as ProjectActivityMetadata).interdisciplinaryProjectId === projectId)
  }

  private async ensureProjectActivity(
    project: Awaited<ReturnType<PrismaInterdisciplinaryProjectRepository['gradingContext']>>,
    contributionId: string,
    institutionId: string,
    actorId: string,
  ) {
    const contribution = project.contributions.find((row) => row.id === contributionId)
    if (!contribution) throw new ConflictError('Solo puedes calificar materias tuyas de este proyecto')
    const activities = await this.projectActivities(project.id, institutionId, [contribution.courseAssignmentId])
    const existing = activities.find((row) => (row.metadata as ProjectActivityMetadata).interdisciplinaryContributionId === contributionId)
    if (existing) return existing
    const type = await prisma.activityType.findFirst({ where: { institutionId, code: 'project', isActive: true } })
    if (!type) throw new ConflictError('La institución no tiene habilitado el tipo de actividad Proyecto')
    return prisma.activity.create({
      data: {
        institutionId,
        courseAssignmentId: contribution.courseAssignmentId,
        academicPeriodId: project.academicPeriodId,
        activityTypeId: type.id,
        name: project.title,
        description: 'Nota individual del proyecto interdisciplinario',
        maxScore: this.gradingScale(project),
        isPublished: true,
        createdBy: actorId,
        metadata: { interdisciplinaryProjectId: project.id, interdisciplinaryContributionId: contribution.id },
      },
      include: { grades: true },
    })
  }

  async getProjectGrading(projectId: string, institutionId: string, teacherId: string) {
    const project = await this.gradingContext(projectId, institutionId, teacherId)
    const assignmentIds = project.contributions.map((row) => row.courseAssignmentId)
    const [activities, enrollments] = await Promise.all([
      this.projectActivities(projectId, institutionId, assignmentIds),
      prisma.studentEnrollment.findMany({
        where: { institutionId, parallelId: project.parallelId, academicYearId: project.contributions[0].courseAssignment.academicYearId, status: 'active' },
        include: { student: { include: { profile: true } } },
      }),
    ])
    return {
      isClosed: project.academicPeriod.isClosed,
      gradingScaleMax: this.gradingScale(project),
      contributions: project.contributions.map((contribution) => {
        const activity = activities.find((row) => (row.metadata as ProjectActivityMetadata).interdisciplinaryContributionId === contribution.id)
        return {
          id: contribution.id,
          subjectName: contribution.courseAssignment.subject.name,
          activityId: activity?.id ?? null,
          shareGroupId: activity ? (activity.metadata as ProjectActivityMetadata).projectGradeShareGroupId ?? null : null,
          grades: Object.fromEntries((activity?.grades ?? []).map((grade) => [grade.studentId, grade.score == null ? null : Number(grade.score)])),
        }
      }),
      students: enrollments
        .map((row) => ({ id: row.studentId, name: row.student.profile ? `${row.student.profile.lastName} ${row.student.profile.firstName}`.trim() : row.student.email }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }
  }

  async configureProjectGradeSharing(projectId: string, institutionId: string, teacherId: string, dto: ConfigureProjectGradeSharingDto) {
    const project = await this.gradingContext(projectId, institutionId, teacherId)
    if (project.academicPeriod.isClosed) throw new ConflictError('El período está cerrado')
    const allowed = new Set(project.contributions.map((row) => row.id))
    const selected = [...new Set([dto.sourceContributionId, ...dto.sharedContributionIds])]
    if (selected.some((id) => !allowed.has(id))) throw new ConflictError('Solo puedes compartir notas entre materias tuyas de este proyecto')
    const source = await this.ensureProjectActivity(project, dto.sourceContributionId, institutionId, teacherId)
    const targets = [source]
    for (const id of selected.filter((candidate) => candidate !== dto.sourceContributionId)) {
      targets.push(await this.ensureProjectActivity(project, id, institutionId, teacherId))
    }
    const oldGroup = (source.metadata as ProjectActivityMetadata).projectGradeShareGroupId
    const groupId = selected.length > 1 ? oldGroup ?? randomUUID() : undefined
    const allActivities = await this.projectActivities(projectId, institutionId, [...allowed].map((id) => project.contributions.find((row) => row.id === id)!.courseAssignmentId))
    await prisma.$transaction(async (tx) => {
      // Reversar significa retirar el vínculo, nunca borrar la actividad ni sus notas.
      if (oldGroup) {
        for (const activity of allActivities.filter((row) => (row.metadata as ProjectActivityMetadata).projectGradeShareGroupId === oldGroup && !targets.some((target) => target.id === row.id))) {
          const metadata = { ...(activity.metadata as ProjectActivityMetadata) }
          delete metadata.projectGradeShareGroupId
          await tx.activity.update({ where: { id: activity.id }, data: { metadata } })
        }
      }
      for (const activity of targets) {
        const metadata = { ...(activity.metadata as ProjectActivityMetadata) }
        if (groupId) metadata.projectGradeShareGroupId = groupId
        else delete metadata.projectGradeShareGroupId
        await tx.activity.update({ where: { id: activity.id }, data: { metadata } })
        if (activity.id !== source.id) {
          for (const grade of source.grades) {
            await tx.grade.upsert({
              where: { activityId_studentId: { activityId: activity.id, studentId: grade.studentId } },
              create: { institutionId, activityId: activity.id, studentId: grade.studentId, score: grade.score, status: grade.status, isExcused: grade.isExcused, notes: grade.notes, gradedBy: teacherId, gradedAt: new Date() },
              update: { score: grade.score, status: grade.status, isExcused: grade.isExcused, notes: grade.notes, gradedBy: teacherId, gradedAt: new Date() },
            })
          }
        }
      }
    })
    return this.getProjectGrading(projectId, institutionId, teacherId)
  }

  async saveProjectGrades(projectId: string, institutionId: string, teacherId: string, dto: SaveProjectGradesDto) {
    const project = await this.gradingContext(projectId, institutionId, teacherId)
    if (project.academicPeriod.isClosed) throw new ConflictError('El período está cerrado')
    const source = await this.ensureProjectActivity(project, dto.contributionId, institutionId, teacherId)
    const enrolled = new Set((await prisma.studentEnrollment.findMany({ where: { institutionId, parallelId: project.parallelId, academicYearId: project.contributions[0].courseAssignment.academicYearId, status: 'active' }, select: { studentId: true } })).map((row) => row.studentId))
    if (dto.grades.some((grade) => !enrolled.has(grade.studentId))) throw new BadRequestError('Hay estudiantes que no pertenecen al paralelo')
    const scale = this.gradingScale(project)
    if (dto.grades.some((grade) => grade.score != null && (!Number.isFinite(grade.score) || grade.score < 0 || grade.score > scale))) throw new BadRequestError(`Las notas deben estar entre 0 y ${scale}`)
    const groupId = (source.metadata as ProjectActivityMetadata).projectGradeShareGroupId
    const activities = groupId
      ? (await this.projectActivities(projectId, institutionId, project.contributions.map((row) => row.courseAssignmentId))).filter((row) => (row.metadata as ProjectActivityMetadata).projectGradeShareGroupId === groupId)
      : [source]
    await prisma.$transaction(async (tx) => {
      for (const activity of activities) for (const grade of dto.grades) {
        await tx.grade.upsert({
          where: { activityId_studentId: { activityId: activity.id, studentId: grade.studentId } },
          create: { institutionId, activityId: activity.id, studentId: grade.studentId, score: grade.score, status: 'entregado', gradedBy: teacherId, gradedAt: new Date() },
          update: { score: grade.score, status: 'entregado', gradedBy: teacherId, gradedAt: new Date() },
        })
      }
    })
    return this.getProjectGrading(projectId, institutionId, teacherId)
  }
  listProjects(institutionId: string, query: ListInterdisciplinaryProjectsQuery) {
    return prisma.interdisciplinaryProject.findMany({
      where: { institutionId, parallelId: query.parallelId, academicPeriodId: query.academicPeriodId },
      include: { _count: { select: { contributions: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  /**
   * Situaciones de aprendizaje del paralelo/periodo dado que ya marcaron ≥2 materias
   * propias del docente con conexión interdisciplinar (interdisciplinarySubjectIds,
   * vía el selector de WeekCard/PlanningSituationPage) y tienen al menos 1 semana —
   * candidatas válidas para el generador con IA (POST /interdisciplinary-projects/draft).
   */
  async listEligibleSituations(institutionId: string, parallelId: string, academicPeriodId: string) {
    const situations = await prisma.learningSituation.findMany({
      where: {
        institutionId,
        academicPeriodId,
        plan: { courseAssignment: { parallelId } },
      },
      include: { _count: { select: { weeks: true } } },
      orderBy: { createdAt: 'desc' },
    })
    return situations.filter((s) => s.interdisciplinarySubjectIds.length >= 2 && s._count.weeks > 0)
  }

  async getProject(id: string, institutionId: string) {
    const project = await prisma.interdisciplinaryProject.findFirst({
      where: { id, institutionId },
      include: PROJECT_INCLUDE,
    })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
    return project
  }

  /** Borra el proyecto y en cascada sus contribuciones/semanas (onDelete: Cascade en el schema). */
  async deleteProject(id: string, institutionId: string) {
    const project = await prisma.interdisciplinaryProject.findFirst({ where: { id, institutionId }, include: { contributions: true } })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
    const activities = await this.projectActivities(id, institutionId, project.contributions.map((row) => row.courseAssignmentId))
    if (activities.some((row) => row.grades.length > 0)) throw new ConflictError('No se puede eliminar un proyecto que ya tiene notas registradas')
    await prisma.$transaction(async (tx) => {
      if (activities.length) await tx.activity.deleteMany({ where: { id: { in: activities.map((row) => row.id) } } })
      await tx.interdisciplinaryProject.delete({ where: { id } })
    })
  }

  async createProject(institutionId: string, actorId: string, dto: CreateInterdisciplinaryProjectDto) {
    if (dto.title.trim().length > 200) {
      throw new BadRequestError('El título no puede superar los 200 caracteres')
    }

    const parallel = await prisma.parallel.findFirst({ where: { id: dto.parallelId, institutionId } })
    if (!parallel) throw new NotFoundError('Paralelo no encontrado')

    const existing = await prisma.interdisciplinaryProject.findFirst({
      where: { parallelId: dto.parallelId, academicPeriodId: dto.academicPeriodId, title: dto.title },
    })
    if (existing) throw new ConflictError('Ya existe un proyecto con ese título en este paralelo y periodo')

    return prisma.interdisciplinaryProject.create({
      data: {
        institutionId,
        parallelId: dto.parallelId,
        academicPeriodId: dto.academicPeriodId,
        title: dto.title,
        situacionReto: dto.situacionReto,
        contexto: dto.contexto,
        propositoComun: dto.propositoComun,
        productoFinal: dto.productoFinal,
        weeksCount: dto.weeksCount,
        createdBy: actorId,
      },
      include: PROJECT_INCLUDE,
    })
  }

  async updateProject(id: string, institutionId: string, dto: UpdateInterdisciplinaryProjectDto) {
    if (dto.title !== undefined && dto.title.trim().length > 200) {
      throw new BadRequestError('El título no puede superar los 200 caracteres')
    }

    const project = await prisma.interdisciplinaryProject.findFirst({ where: { id, institutionId } })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
    if (project.status === 'aprobado') throw new ConflictError('El proyecto ya fue aprobado y no se puede editar')

    return prisma.interdisciplinaryProject.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.situacionReto !== undefined && { situacionReto: dto.situacionReto }),
        ...(dto.contexto !== undefined && { contexto: dto.contexto }),
        ...(dto.propositoComun !== undefined && { propositoComun: dto.propositoComun }),
        ...(dto.productoFinal !== undefined && { productoFinal: dto.productoFinal }),
        ...(dto.weeksCount !== undefined && { weeksCount: dto.weeksCount }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: PROJECT_INCLUDE,
    })
  }

  // ─── Contribuciones (unirse con una asignatura) ─────────────────────────
  async joinProject(projectId: string, institutionId: string, dto: JoinProjectDto) {
    const project = await prisma.interdisciplinaryProject.findFirst({ where: { id: projectId, institutionId } })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')

    const assignment = await prisma.courseAssignment.findFirst({
      where: { id: dto.courseAssignmentId, institutionId, parallelId: project.parallelId },
    })
    if (!assignment) {
      throw new NotFoundError('La asignación no existe o no pertenece al paralelo de este proyecto')
    }

    const existing = await prisma.interdisciplinaryContribution.findUnique({
      where: { projectId_courseAssignmentId: { projectId, courseAssignmentId: dto.courseAssignmentId } },
    })
    if (existing) throw new ConflictError('Esta asignatura ya participa en el proyecto')

    return prisma.interdisciplinaryContribution.create({
      data: { projectId, courseAssignmentId: dto.courseAssignmentId, skillIds: [], saberIds: [] },
      include: {
        courseAssignment: { include: { subject: true, teacher: { include: { profile: true } } } },
        weekEntries: true,
      },
    })
  }

  async updateContribution(contributionId: string, institutionId: string, dto: UpdateContributionDto) {
    const contribution = await prisma.interdisciplinaryContribution.findFirst({
      where: { id: contributionId, project: { institutionId } },
      include: { project: true },
    })
    if (!contribution) throw new NotFoundError('Aporte no encontrado')
    if (contribution.project.status === 'aprobado') {
      throw new ConflictError('El proyecto ya fue aprobado y no se puede editar')
    }

    if (dto.skillIds !== undefined) {
      await assertSkillsArePlanned(contribution.courseAssignmentId, contribution.project.academicPeriodId, dto.skillIds)
    }
    if (dto.competencyIds !== undefined) {
      await assertCompetenciesArePlanned(contribution.courseAssignmentId, contribution.project.academicPeriodId, dto.competencyIds)
    }

    return prisma.interdisciplinaryContribution.update({
      where: { id: contributionId },
      data: {
        ...(dto.contribucion !== undefined && { contribucion: dto.contribucion }),
        ...(dto.responsabilidad !== undefined && { responsabilidad: dto.responsabilidad }),
        ...(dto.skillIds !== undefined && { skillIds: dto.skillIds }),
        ...(dto.saberIds !== undefined && { saberIds: dto.saberIds }),
        ...(dto.competencyIds !== undefined && { competencyIds: dto.competencyIds }),
        ...(dto.competencySaberIds !== undefined && { competencySaberIds: dto.competencySaberIds }),
      },
      include: {
        courseAssignment: { include: { subject: true, teacher: { include: { profile: true } } } },
        weekEntries: { orderBy: { weekNumber: 'asc' } },
      },
    })
  }

  async removeContribution(contributionId: string, institutionId: string) {
    const contribution = await prisma.interdisciplinaryContribution.findFirst({
      where: { id: contributionId, project: { institutionId } },
      include: { project: true },
    })
    if (!contribution) throw new NotFoundError('Aporte no encontrado')
    if (contribution.project.status === 'aprobado') {
      throw new ConflictError('El proyecto ya fue aprobado y no se puede editar')
    }
    const activities = await this.projectActivities(contribution.projectId, institutionId, [contribution.courseAssignmentId])
    const activity = activities.find((row) => (row.metadata as ProjectActivityMetadata).interdisciplinaryContributionId === contributionId)
    if (activity?.grades.length) throw new ConflictError('No puedes retirar una materia que ya tiene notas del proyecto')
    await prisma.$transaction(async (tx) => {
      if (activity) await tx.activity.delete({ where: { id: activity.id } })
      await tx.interdisciplinaryContribution.delete({ where: { id: contributionId } })
    })
    return { ok: true }
  }

  // ─── Entradas de semana (integración por hitos) ─────────────────────────
  async upsertWeekEntry(contributionId: string, institutionId: string, dto: UpsertWeekEntryDto) {
    const contribution = await prisma.interdisciplinaryContribution.findFirst({
      where: { id: contributionId, project: { institutionId } },
      include: { project: true },
    })
    if (!contribution) throw new NotFoundError('Aporte no encontrado')
    if (contribution.project.status === 'aprobado') {
      throw new ConflictError('El proyecto ya fue aprobado y no se puede editar')
    }
    if (dto.weekNumber < 1 || dto.weekNumber > contribution.project.weeksCount) {
      throw new ConflictError(`La semana debe estar entre 1 y ${contribution.project.weeksCount}`)
    }

    return prisma.interdisciplinaryWeekEntry.upsert({
      where: { contributionId_weekNumber: { contributionId, weekNumber: dto.weekNumber } },
      update: {
        weekProposito: dto.weekProposito,
        faseInicio: dto.faseInicio,
        faseDesarrollo: dto.faseDesarrollo,
        faseCierre: dto.faseCierre,
        propositoPedagogico: dto.propositoPedagogico,
        evidencias: dto.evidencias,
      },
      create: {
        contributionId,
        weekNumber: dto.weekNumber,
        weekProposito: dto.weekProposito,
        faseInicio: dto.faseInicio,
        faseDesarrollo: dto.faseDesarrollo,
        faseCierre: dto.faseCierre,
        propositoPedagogico: dto.propositoPedagogico,
        evidencias: dto.evidencias,
      },
    })
  }

  /** Junta los datos necesarios para renderizar el PDF/Word del proyecto (secciones 6 y 7). */
  async getProjectPdfData(id: string, institutionId: string) {
    const project = await prisma.interdisciplinaryProject.findFirst({
      where: { id, institutionId },
      include: {
        parallel: { include: { level: true } },
        academicPeriod: true,
        contributions: {
          include: {
            courseAssignment: { include: { subject: true, teacher: { include: { profile: true } } } },
            weekEntries: { orderBy: { weekNumber: 'asc' } },
          },
        },
      },
    })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')

    const institution = await prisma.institution.findUnique({ where: { id: institutionId } })
    const settings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }

    const allSkillIds = Array.from(new Set(project.contributions.flatMap((c) => c.skillIds)))
    const allSaberIds = Array.from(new Set(project.contributions.flatMap((c) => c.saberIds)))
    const skills = allSkillIds.length
      ? await prisma.curriculumSkill.findMany({ where: { id: { in: allSkillIds } }, include: { criterion: true } })
      : []
    const sabers = allSaberIds.length
      ? await prisma.curriculumSaber.findMany({ where: { id: { in: allSaberIds } } })
      : []
    const skillById = new Map(skills.map((s) => [s.id, s]))
    const saberById = new Map(sabers.map((s) => [s.id, s]))

    // Modelo por competencias: mismo shape del PDF, resuelto desde el banco de competencias.
    const allCompetencyIds = Array.from(new Set(project.contributions.flatMap((c) => c.competencyIds)))
    const allCompetencySaberIds = Array.from(new Set(project.contributions.flatMap((c) => c.competencySaberIds)))
    const [competencies, competencySabers] = await Promise.all([
      allCompetencyIds.length
        ? prisma.competency.findMany({ where: { id: { in: allCompetencyIds } }, include: { indicators: true } })
        : [],
      allCompetencySaberIds.length
        ? prisma.competencySaber.findMany({ where: { id: { in: allCompetencySaberIds } } })
        : [],
    ])
    const competencyById = new Map(competencies.map((c) => [c.id, c]))
    const competencySaberById = new Map(competencySabers.map((s) => [s.id, s]))

    return {
      institutionName: institution?.name ?? '',
      logoUrl: settings.branding?.logoUrl ?? null,
      levelName: project.parallel.level.name,
      parallelName: project.parallel.name,
      periodName: project.academicPeriod.name,
      title: project.title,
      situacionReto: project.situacionReto,
      contexto: project.contexto,
      propositoComun: project.propositoComun,
      productoFinal: project.productoFinal,
      weeksCount: project.weeksCount,
      status: project.status,
      contributions: project.contributions.map((c) => {
        const contribSkills = c.skillIds.map((sid) => skillById.get(sid)).filter((s): s is NonNullable<typeof s> => !!s)
        const contribCompetencies = c.competencyIds
          .map((cid) => competencyById.get(cid))
          .filter((comp): comp is NonNullable<typeof comp> => !!comp)
        const usesCompetencyModel = contribCompetencies.length > 0
        const contribCompetencySaberes = c.competencySaberIds
          .map((sid) => competencySaberById.get(sid))
          .filter((s): s is NonNullable<typeof s> => !!s)
          .map((s) => ({ type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description }))
        return {
          subjectName: c.courseAssignment.subject.name,
          teacherName: c.courseAssignment.teacher.profile
            ? `${c.courseAssignment.teacher.profile.lastName} ${c.courseAssignment.teacher.profile.firstName}`
            : '',
          contribucion: c.contribucion,
          responsabilidad: c.responsabilidad,
          competencias: usesCompetencyModel
            ? contribCompetencies.map((comp) => ({ code: comp.code, description: comp.text }))
            : contribSkills.map((s) => ({ code: s.criterion.code, description: s.criterion.description })),
          indicadores: usesCompetencyModel
            ? contribCompetencies.flatMap((comp) => comp.indicators.map((i) => ({ code: i.code, text: i.text })))
            : contribSkills.map((s) => ({ code: s.code, text: s.indicatorText ?? s.description })),
          saberes: usesCompetencyModel
            ? contribCompetencySaberes
            : c.saberIds
                .map((sid) => saberById.get(sid))
                .filter((s): s is NonNullable<typeof s> => !!s)
                .map((s) => ({ type: s.type as 'declarativo' | 'procedimental' | 'actitudinal', code: s.code, description: s.description })),
          weekEntries: c.weekEntries.map((w) => ({
            weekNumber: w.weekNumber,
            weekProposito: w.weekProposito,
            faseInicio: w.faseInicio,
            faseDesarrollo: w.faseDesarrollo,
            faseCierre: w.faseCierre,
            propositoPedagogico: w.propositoPedagogico,
            evidencias: w.evidencias,
          })),
        }
      }),
    }
  }
}
