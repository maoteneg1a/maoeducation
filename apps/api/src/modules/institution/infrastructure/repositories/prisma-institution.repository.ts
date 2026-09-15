import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  AiConfig,
  GradingConfig,
  InstitutionBranding,
  InstitutionSettingsDto,
  UpdateAiConfigDto,
  UpdateGradingConfigDto,
  UpdateInstitutionSettingsDto,
} from '../../application/dtos/institution.dto'
import { DEFAULT_AI_CONFIG, DEFAULT_GRADING_CONFIG } from '../../../platform/application/services/institution-bootstrap'

function extractBranding(settings: unknown): InstitutionBranding {
  const s = (settings ?? {}) as Record<string, unknown>
  const branding = (s.branding ?? {}) as Record<string, unknown>
  return {
    logoUrl: (branding.logoUrl as string | undefined) ?? null,
    primaryColor: (branding.primaryColor as string | undefined) ?? null,
    sidebarColor: (branding.sidebarColor as string | undefined) ?? null,
  }
}

/** Devuelve la config de calificación con fallback a los defaults MINEDUC. */
function extractGradingConfig(settings: unknown): GradingConfig {
  const s = (settings ?? {}) as Record<string, unknown>
  const gc = (s.gradingConfig ?? {}) as Partial<GradingConfig>
  return {
    gradingScaleMax: gc.gradingScaleMax ?? DEFAULT_GRADING_CONFIG.gradingScaleMax,
    qualitativeScale:
      gc.qualitativeScale && gc.qualitativeScale.length > 0
        ? gc.qualitativeScale
        : (DEFAULT_GRADING_CONFIG.qualitativeScale as unknown as GradingConfig['qualitativeScale']),
    behaviorScale:
      gc.behaviorScale && gc.behaviorScale.length > 0
        ? gc.behaviorScale
        : (DEFAULT_GRADING_CONFIG.behaviorScale as unknown as GradingConfig['behaviorScale']),
    promotion: { ...DEFAULT_GRADING_CONFIG.promotion, ...(gc.promotion ?? {}) },
    defaultExamWeight: gc.defaultExamWeight ?? DEFAULT_GRADING_CONFIG.defaultExamWeight,
    pedagogicRecovery: {
      ...DEFAULT_GRADING_CONFIG.pedagogicRecovery,
      ...(gc.pedagogicRecovery ?? {}),
    },
  }
}

/** Devuelve la config del asistente IA con fallback a los defaults (apagado). */
function extractAiConfig(settings: unknown): AiConfig {
  const s = (settings ?? {}) as Record<string, unknown>
  const ac = (s.aiConfig ?? {}) as Partial<AiConfig>
  return {
    enabled: ac.enabled ?? DEFAULT_AI_CONFIG.enabled,
    model: ac.model ?? DEFAULT_AI_CONFIG.model,
    monthlyTokenCap: ac.monthlyTokenCap ?? DEFAULT_AI_CONFIG.monthlyTokenCap,
  }
}

export class PrismaInstitutionRepository {
  async getSettings(institutionId: string): Promise<InstitutionSettingsDto> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { id: true, name: true, code: true, settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    return {
      id: inst.id,
      name: inst.name,
      code: inst.code,
      branding: extractBranding(inst.settings),
    }
  }

  async updateSettings(
    institutionId: string,
    dto: UpdateInstitutionSettingsDto,
  ): Promise<InstitutionSettingsDto> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')

    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const currentBranding = extractBranding(inst.settings)

    const nextBranding: InstitutionBranding = dto.branding
      ? { ...currentBranding, ...dto.branding }
      : currentBranding

    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        settings: { ...currentSettings, branding: nextBranding } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, name: true, code: true, settings: true },
    })

    return {
      id: updated.id,
      name: updated.name,
      code: updated.code,
      branding: extractBranding(updated.settings),
    }
  }

  async getGradingConfig(institutionId: string): Promise<GradingConfig> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    return extractGradingConfig(inst.settings)
  }

  async updateGradingConfig(
    institutionId: string,
    dto: UpdateGradingConfigDto,
  ): Promise<GradingConfig> {
    if (dto.gradingScaleMax !== undefined && (!Number.isFinite(dto.gradingScaleMax) || dto.gradingScaleMax <= 0)) {
      throw new BadRequestError('La nota máxima de la escala debe ser mayor a 0')
    }
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')

    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const current = extractGradingConfig(inst.settings)
    const next: GradingConfig = {
      gradingScaleMax: dto.gradingScaleMax ?? current.gradingScaleMax,
      qualitativeScale: dto.qualitativeScale ?? current.qualitativeScale,
      behaviorScale: dto.behaviorScale ?? current.behaviorScale,
      promotion: { ...current.promotion, ...(dto.promotion ?? {}) },
      defaultExamWeight: dto.defaultExamWeight ?? current.defaultExamWeight,
      pedagogicRecovery: { ...current.pedagogicRecovery, ...(dto.pedagogicRecovery ?? {}) },
    }

    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: {
        settings: { ...currentSettings, gradingConfig: next } as unknown as Prisma.InputJsonValue,
      },
      select: { settings: true },
    })
    return extractGradingConfig(updated.settings)
  }

  async getAiConfig(institutionId: string): Promise<AiConfig> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    return extractAiConfig(inst.settings)
  }

  async updateAiConfig(institutionId: string, dto: UpdateAiConfigDto): Promise<AiConfig> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')

    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const current = extractAiConfig(inst.settings)
    const next: AiConfig = {
      enabled: dto.enabled ?? current.enabled,
      model: dto.model ?? current.model,
      monthlyTokenCap: dto.monthlyTokenCap ?? current.monthlyTokenCap,
    }

    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: { settings: { ...currentSettings, aiConfig: next } as unknown as Prisma.InputJsonValue },
      select: { settings: true },
    })
    return extractAiConfig(updated.settings)
  }

  /** Guarda solo el logoUrl dentro de branding (tras subir el archivo). */
  async setLogoUrl(institutionId: string, logoUrl: string): Promise<string> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const currentBranding = extractBranding(inst.settings)
    await prisma.institution.update({
      where: { id: institutionId },
      data: {
        settings: {
          ...currentSettings,
          branding: { ...currentBranding, logoUrl },
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return logoUrl
  }
}
