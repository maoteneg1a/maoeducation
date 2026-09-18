import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'

export class PrismaCompetencyCurriculumRepository {
  /** CompetencyArea es GLOBAL (catálogo oficial MINEDUC, una sola copia compartida) — no filtra por institución. */
  listAreas() {
    return prisma.competencyArea.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    })
  }

  async listCompetencies(areaId: string, institutionId: string, subnivel: string) {
    const area = await prisma.competencyArea.findFirst({ where: { id: areaId } })
    if (!area) throw new NotFoundError('Área de competencias no encontrada')

    return prisma.competency.findMany({
      where: { areaId, subnivel, isActive: true, OR: [{ institutionId: null }, { institutionId }] },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
      include: {
        indicators: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      },
    })
  }

  /** Competencias disponibles para una asignatura (vía su área vinculada) + subnivel — oficiales + personalizadas de esta institución. */
  async listCompetenciesForSubject(subjectId: string, institutionId: string, subnivel: string) {
    const subject = await prisma.subject.findFirst({ where: { id: subjectId, institutionId } })
    if (!subject) throw new NotFoundError('Materia no encontrada')
    if (!subject.competencyAreaId) return []

    return prisma.competency.findMany({
      where: {
        areaId: subject.competencyAreaId,
        subnivel,
        isActive: true,
        OR: [{ institutionId: null }, { institutionId }],
      },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
  }

  /**
   * `gradeCode` opcional: si se pasa, filtra igual que `availableCompetenciesForDistribution`
   * (prisma-planning.repository.ts) — un saber con `gradeCodes` no vacío solo se incluye si
   * `gradeCode` está en esa lista (granularidad TIGA por grado dentro de un subnivel
   * compartido). Sin `gradeCode`, mantiene el comportamiento histórico (todos los saberes) —
   * retrocompatible para consumidores que no conocen el grado real de la asignación.
   */
  async listSaberesForCompetency(competencyId: string, gradeCode?: string) {
    const sabers = await prisma.competencySaber.findMany({
      where: { competencyId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    })
    if (!gradeCode) return sabers
    return sabers.filter((s) => s.gradeCodes.length === 0 || s.gradeCodes.includes(gradeCode))
  }

  /** Solo se pueden agregar saberes a competencias PROPIAS de la institución — el banco oficial no se modifica por tenant. */
  async createSaber(
    institutionId: string,
    dto: { competencyId: string; type: string; code: string; description: string },
  ) {
    const competency = await prisma.competency.findFirst({
      where: { id: dto.competencyId, institutionId },
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
