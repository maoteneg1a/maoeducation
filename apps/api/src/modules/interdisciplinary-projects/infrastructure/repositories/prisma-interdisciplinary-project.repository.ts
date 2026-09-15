import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ConflictError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { assertSkillsArePlanned } from '../../../../shared/infrastructure/services/planned-curriculum.service'
import type {
  CreateInterdisciplinaryProjectDto,
  JoinProjectDto,
  ListInterdisciplinaryProjectsQuery,
  UpdateContributionDto,
  UpdateInterdisciplinaryProjectDto,
  UpsertWeekEntryDto,
} from '../../application/dtos/interdisciplinary-project.dto'

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
  listProjects(institutionId: string, query: ListInterdisciplinaryProjectsQuery) {
    return prisma.interdisciplinaryProject.findMany({
      where: { institutionId, parallelId: query.parallelId, academicPeriodId: query.academicPeriodId },
      include: { _count: { select: { contributions: true } } },
      orderBy: { createdAt: 'desc' },
    })
  }

  async getProject(id: string, institutionId: string) {
    const project = await prisma.interdisciplinaryProject.findFirst({
      where: { id, institutionId },
      include: PROJECT_INCLUDE,
    })
    if (!project) throw new NotFoundError('Proyecto interdisciplinario no encontrado')
    return project
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

    return prisma.interdisciplinaryContribution.update({
      where: { id: contributionId },
      data: {
        ...(dto.contribucion !== undefined && { contribucion: dto.contribucion }),
        ...(dto.responsabilidad !== undefined && { responsabilidad: dto.responsabilidad }),
        ...(dto.skillIds !== undefined && { skillIds: dto.skillIds }),
        ...(dto.saberIds !== undefined && { saberIds: dto.saberIds }),
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
    await prisma.interdisciplinaryContribution.delete({ where: { id: contributionId } })
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
        return {
          subjectName: c.courseAssignment.subject.name,
          teacherName: c.courseAssignment.teacher.profile
            ? `${c.courseAssignment.teacher.profile.firstName} ${c.courseAssignment.teacher.profile.lastName}`
            : '',
          contribucion: c.contribucion,
          responsabilidad: c.responsabilidad,
          competencias: contribSkills.map((s) => ({ code: s.criterion.code, description: s.criterion.description })),
          indicadores: contribSkills.map((s) => ({ code: s.code, text: s.indicatorText ?? s.description })),
          saberes: c.saberIds
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
