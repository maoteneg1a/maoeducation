import { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  AiConfig,
  GradingConfig,
  InstitutionBranding,
  InstitutionSettingsDto,
  MicrocurricularTemplateConfig,
  PlanningModel,
  UpdateAiConfigDto,
  UpdateGradingConfigDto,
  UpdateInstitutionSettingsDto,
  UpdateMicrocurricularTemplateDto,
  UpdatePlanningModelDto,
} from '../../application/dtos/institution.dto'
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_GRADING_CONFIG,
  DEFAULT_MICROCURRICULAR_TEMPLATE,
} from '../../../platform/application/services/institution-bootstrap'

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

function extractMicrocurricularTemplate(settings: unknown): MicrocurricularTemplateConfig {
  const s = (settings ?? {}) as Record<string, unknown>
  const templates = (s.documentTemplates ?? {}) as Record<string, unknown>
  const t = (templates.microcurricular ?? {}) as Partial<MicrocurricularTemplateConfig>
  return {
    headerColor: t.headerColor ?? DEFAULT_MICROCURRICULAR_TEMPLATE.headerColor,
    headerColor2: t.headerColor2 ?? DEFAULT_MICROCURRICULAR_TEMPLATE.headerColor2,
    watermarkEnabled: t.watermarkEnabled ?? DEFAULT_MICROCURRICULAR_TEMPLATE.watermarkEnabled,
    phaseLabels: { ...DEFAULT_MICROCURRICULAR_TEMPLATE.phaseLabels, ...(t.phaseLabels ?? {}) },
    saberesOrder:
      t.saberesOrder && t.saberesOrder.length === 3
        ? t.saberesOrder
        : (DEFAULT_MICROCURRICULAR_TEMPLATE.saberesOrder as unknown as MicrocurricularTemplateConfig['saberesOrder']),
    weekLayout: t.weekLayout ?? DEFAULT_MICROCURRICULAR_TEMPLATE.weekLayout,
    sectionOrder:
      t.sectionOrder && t.sectionOrder.length > 0
        ? t.sectionOrder
        : (DEFAULT_MICROCURRICULAR_TEMPLATE.sectionOrder as unknown as string[]),
    hiddenSections: t.hiddenSections ?? (DEFAULT_MICROCURRICULAR_TEMPLATE.hiddenSections as unknown as string[]),
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

/** Modelo de planificación curricular activo — "destrezas" por defecto (compatibilidad con lo ya construido). */
function extractPlanningModel(settings: unknown): PlanningModel {
  const s = (settings ?? {}) as Record<string, unknown>
  return (s.planningModel as PlanningModel | undefined) ?? 'destrezas'
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

  async getMicrocurricularTemplate(institutionId: string): Promise<MicrocurricularTemplateConfig> {
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    return extractMicrocurricularTemplate(inst.settings)
  }

  async updateMicrocurricularTemplate(
    institutionId: string,
    dto: UpdateMicrocurricularTemplateDto,
  ): Promise<MicrocurricularTemplateConfig> {
    if (dto.saberesOrder && dto.saberesOrder.length !== 3) {
      throw new BadRequestError('saberesOrder debe incluir exactamente los 3 tipos de saberes')
    }
    const inst = await prisma.institution.findUnique({
      where: { id: institutionId },
      select: { settings: true },
    })
    if (!inst) throw new NotFoundError('Institución no encontrada')

    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const currentTemplates = (currentSettings.documentTemplates ?? {}) as Record<string, unknown>
    const current = extractMicrocurricularTemplate(inst.settings)
    const next: MicrocurricularTemplateConfig = {
      headerColor: dto.headerColor ?? current.headerColor,
      headerColor2: dto.headerColor2 ?? current.headerColor2,
      watermarkEnabled: dto.watermarkEnabled ?? current.watermarkEnabled,
      phaseLabels: { ...current.phaseLabels, ...(dto.phaseLabels ?? {}) },
      saberesOrder: dto.saberesOrder ?? current.saberesOrder,
      weekLayout: dto.weekLayout ?? current.weekLayout,
      sectionOrder: dto.sectionOrder ?? current.sectionOrder,
      hiddenSections: dto.hiddenSections ?? current.hiddenSections,
    }

    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: {
        settings: {
          ...currentSettings,
          documentTemplates: { ...currentTemplates, microcurricular: next },
        } as unknown as Prisma.InputJsonValue,
      },
      select: { settings: true },
    })
    return extractMicrocurricularTemplate(updated.settings)
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

  async getPlanningModel(institutionId: string): Promise<PlanningModel> {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
    if (!inst) throw new NotFoundError('Institución no encontrada')
    return extractPlanningModel(inst.settings)
  }

  async updatePlanningModel(institutionId: string, dto: UpdatePlanningModelDto): Promise<PlanningModel> {
    const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
    if (!inst) throw new NotFoundError('Institución no encontrada')

    const currentSettings = (inst.settings ?? {}) as Record<string, unknown>
    const updated = await prisma.institution.update({
      where: { id: institutionId },
      data: { settings: { ...currentSettings, planningModel: dto.planningModel } as unknown as Prisma.InputJsonValue },
      select: { settings: true },
    })
    return extractPlanningModel(updated.settings)
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
