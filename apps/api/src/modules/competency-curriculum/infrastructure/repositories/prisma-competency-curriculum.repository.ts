import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'

export class PrismaCompetencyCurriculumRepository {
  listAreas(institutionId: string) {
    return prisma.competencyArea.findMany({
      where: { institutionId, isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  async listCompetencies(areaId: string, institutionId: string, subnivel: string) {
    const area = await prisma.competencyArea.findFirst({ where: { id: areaId, institutionId } })
    if (!area) throw new NotFoundError('Área de competencias no encontrada')

    return prisma.competency.findMany({
      where: { areaId, subnivel, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        indicators: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      },
    })
  }

  /** Competencias disponibles para una asignatura (vía su área vinculada) + subnivel — para el selector del PUD. */
  async listCompetenciesForSubject(subjectId: string, institutionId: string, subnivel: string) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId } })
    if (!subject) throw new NotFoundError('Materia no encontrada')
    if (!subject.competencyAreaId) return []

    return prisma.competency.findMany({
      where: { areaId: subject.competencyAreaId, subnivel, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
  }

  listSaberesForCompetency(competencyId: string) {
    return prisma.competencySaber.findMany({
      where: { competencyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
  }

  async createSaber(
    institutionId: string,
    dto: { competencyId: string; type: string; code: string; description: string },
  ) {
    const competency = await prisma.competency.findFirst({
      where: { id: dto.competencyId, area: { institutionId } },
    })
    if (!competency) throw new NotFoundError('Competencia no encontrada')

    return prisma.competencySaber.create({
      data: { competencyId: dto.competencyId, type: dto.type, code: dto.code, description: dto.description },
    })
  }

  listKeyCompetencies() {
    return prisma.keyCompetency.findMany({ orderBy: { sortOrder: 'asc' } })
  }
}
