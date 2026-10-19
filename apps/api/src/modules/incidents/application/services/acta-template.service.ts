import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { parseActaTemplate, resolveActaTemplate } from './commitment-document'

export async function getActaTemplate(institutionId: string) {
  const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  if (!institution) throw new NotFoundError('Institución no encontrada')
  return resolveActaTemplate(institution.settings)
}
export async function saveActaTemplate(institutionId: string, value: unknown) {
  const template = parseActaTemplate(value)
  return prisma.$transaction(async (tx) => {
    const institution = await tx.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
    if (!institution) throw new NotFoundError('Institución no encontrada')
    const settings = (institution.settings ?? {}) as Record<string, unknown>
    const templates = (settings.documentTemplates ?? {}) as Record<string, unknown>
    await tx.institution.update({
      where: { id: institutionId },
      data: { settings: { ...settings, documentTemplates: { ...templates, incidentCommitment: template } } as unknown as Prisma.InputJsonValue },
    })
    return template
  })
}
