import { prisma } from '../database/prisma'
import { resolveAgreement, type AgreementRules } from '../../domain/agreement-rules'
import { extractReportsFlow, type ReportsFlowConfig } from '../../domain/reports-flow'

/** Settings crudos de la institución (JSON). */
export async function institutionSettings(institutionId: string): Promise<Record<string, unknown>> {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  return (inst?.settings ?? {}) as Record<string, unknown>
}

/**
 * Reglas del Acuerdo 2026-00082-A activas para la institución y el año lectivo,
 * o `null` si ese año sigue con el marco anterior (el motor no cambia).
 */
export async function agreementFor(institutionId: string, academicYearId?: string | null): Promise<AgreementRules | null> {
  return resolveAgreement(await institutionSettings(institutionId), academicYearId)
}

export async function reportsFlowFor(institutionId: string): Promise<ReportsFlowConfig> {
  return extractReportsFlow(await institutionSettings(institutionId))
}
