import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { ILeadRepository } from '../../domain/repositories/lead.repository'
import { Lead } from '../../domain/entities/lead.entity'
import { CreateLeadDto } from '../../application/dtos/create-lead.dto'

export class PrismaLeadRepository implements ILeadRepository {
  async create(data: CreateLeadDto): Promise<Lead> {
    return prisma.lead.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        institutionName: data.institutionName ?? null,
        city: data.city ?? null,
        role: data.role ?? null,
        studentsCount: data.studentsCount ?? null,
        message: data.message ?? null,
        source: data.source ?? 'landing',
      },
    })
  }

  async list(): Promise<Lead[]> {
    return prisma.lead.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async updateStatus(id: string, status: string): Promise<Lead> {
    return prisma.lead.update({ where: { id }, data: { status } })
  }

  /** Seguimiento comercial (CRM): estado, notas, responsable, próximo contacto, conversión. */
  async update(
    id: string,
    data: Partial<Pick<Lead, 'status' | 'notes' | 'ownerAdminId' | 'nextFollowUpAt' | 'convertedInstitutionId'>>,
  ): Promise<Lead> {
    return prisma.lead.update({ where: { id }, data })
  }
}
