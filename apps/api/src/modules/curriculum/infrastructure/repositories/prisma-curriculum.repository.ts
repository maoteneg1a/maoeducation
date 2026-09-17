import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import type {
  CreateCustomSkillDto,
  CreateSaberDto,
  UpdateSaberDto,
  UpdateSkillDto,
} from '../../application/dtos/curriculum.dto'

export class PrismaCurriculumRepository {
  /** CurriculumArea es GLOBAL (catálogo oficial MINEDUC, una sola copia compartida) — no filtra por institución. */
  listAreas() {
    return prisma.curriculumArea.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  async listCriteria(areaId: string, institutionId: string, subnivel: string) {
    const area = await prisma.curriculumArea.findFirst({ where: { id: areaId } })
    if (!area) throw new NotFoundError('Área curricular no encontrada')

    return prisma.curriculumCriterion.findMany({
      where: { areaId, subnivel },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        // Destrezas oficiales (institutionId null) + las personalizadas de ESTA institución.
        skills: {
          where: { isActive: true, OR: [{ institutionId: null }, { institutionId }] },
          orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
        },
      },
    })
  }

  /** Destrezas disponibles para una asignatura (via su área vinculada) + subnivel — oficiales + personalizadas de esta institución. */
  async listSkillsForSubject(subjectId: string, institutionId: string, subnivel: string) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId } })
    if (!subject) throw new NotFoundError('Materia no encontrada')
    if (!subject.curriculumAreaId) return []

    return prisma.curriculumSkill.findMany({
      where: {
        isActive: true,
        criterion: { areaId: subject.curriculumAreaId, subnivel },
        OR: [{ institutionId: null }, { institutionId }],
      },
      include: { criterion: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
  }

  async createCustomSkill(institutionId: string, dto: CreateCustomSkillDto) {
    const criterion = await prisma.curriculumCriterion.findFirst({ where: { id: dto.criterionId } })
    if (!criterion) throw new NotFoundError('Criterio de evaluación no encontrado')

    return prisma.curriculumSkill.create({
      data: {
        criterionId: dto.criterionId,
        code: dto.code,
        description: dto.description,
        indicatorText: dto.indicatorText,
        competencyTags: dto.competencyTags ?? [],
        insercionTags: dto.insercionTags ?? [],
        isCustom: true,
        institutionId,
      },
    })
  }

  /** Solo se pueden editar destrezas PROPIAS de la institución (isCustom) — el banco oficial es de solo lectura por tenant. */
  async updateSkill(id: string, institutionId: string, dto: UpdateSkillDto) {
    const skill = await prisma.curriculumSkill.findFirst({ where: { id, institutionId } })
    if (!skill) throw new NotFoundError('Destreza no encontrada')

    return prisma.curriculumSkill.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.indicatorText !== undefined && { indicatorText: dto.indicatorText }),
        ...(dto.competencyTags !== undefined && { competencyTags: dto.competencyTags }),
        ...(dto.insercionTags !== undefined && { insercionTags: dto.insercionTags }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }

  // ─── Saberes (declarativo/procedimental/actitudinal) ────────────────────
  async listSaberesForSkill(skillId: string, institutionId: string) {
    const skill = await prisma.curriculumSkill.findFirst({
      where: { id: skillId, OR: [{ institutionId: null }, { institutionId }] },
    })
    if (!skill) throw new NotFoundError('Destreza no encontrada')

    return prisma.curriculumSaber.findMany({
      where: { skillId, isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    })
  }

  /** Solo se pueden agregar saberes a destrezas PROPIAS de la institución (isCustom) — el banco oficial no se modifica por tenant. */
  async createSaber(institutionId: string, dto: CreateSaberDto) {
    const skill = await prisma.curriculumSkill.findFirst({ where: { id: dto.skillId, institutionId } })
    if (!skill) throw new NotFoundError('Destreza no encontrada')

    return prisma.curriculumSaber.create({
      data: { skillId: dto.skillId, type: dto.type, code: dto.code, description: dto.description },
    })
  }

  async updateSaber(id: string, institutionId: string, dto: UpdateSaberDto) {
    const saber = await prisma.curriculumSaber.findFirst({
      where: { id, skill: { institutionId } },
    })
    if (!saber) throw new NotFoundError('Saber no encontrado')

    return prisma.curriculumSaber.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    })
  }
}
