import type { Prisma } from '@prisma/client'
import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import {
  AGREEMENT_00082A_PRESET,
  AGREEMENT_00082A_QUALITATIVE_BANDS,
  AGREEMENT_00082A_VALUE_SCALE,
  FRAMEWORKS,
  SOSTENIMIENTOS,
  SUBNIVELES,
  complianceWarnings,
  deepMerge,
  extractAgreementRules,
  extractNormativeProfile,
  type AgreementRules,
  type NormativeProfile,
} from '../../../../shared/domain/agreement-rules'
import {
  DEFAULT_REPORTS_FLOW,
  extractReportsFlow,
  validateReportsFlow,
  type ReportsFlowConfig,
} from '../../../../shared/domain/reports-flow'

async function loadSettings(institutionId: string): Promise<Record<string, unknown>> {
  const inst = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
  if (!inst) throw new NotFoundError('Institución no encontrada')
  return (inst.settings ?? {}) as Record<string, unknown>
}

async function saveSettings(institutionId: string, settings: Record<string, unknown>) {
  await prisma.institution.update({
    where: { id: institutionId },
    data: { settings: settings as unknown as Prisma.InputJsonValue },
  })
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)

function validateRules(r: AgreementRules): string[] {
  const e: string[] = []
  const score = (v: unknown, label: string) => { if (!num(v) || (v as number) < 0 || (v as number) > 10) e.push(`${label}: debe estar entre 0 y 10`) }
  if (![0, 1, 2, 3].includes(r.decimals.places)) e.push('Decimales: entre 0 y 3')
  if (!['truncate', 'round'].includes(r.decimals.method)) e.push('Método de decimales inválido')
  if (!['formative', 'period_total'].includes(r.earlyAlert.source)) e.push('Fuente de alerta inválida')
  if (!['live', 'period_close'].includes(r.earlyAlert.moment)) e.push('Momento de alerta inválido')
  score(r.earlyAlert.quantitativeMin, 'Alerta (mínimo)')
  score(r.earlyAlert.quantitativeMax, 'Alerta (máximo)')
  if (r.earlyAlert.quantitativeMin > r.earlyAlert.quantitativeMax) e.push('Alerta: el mínimo supera al máximo')
  if (!['average', 'replace'].includes(r.formativeReinforcement.method)) e.push('Método de refuerzo formativo inválido')
  if (r.formativeReinforcement.cap != null) score(r.formativeReinforcement.cap, 'Tope del refuerzo formativo')
  for (const [k, rule] of Object.entries(r.summativeImprovement)) {
    score(rule.min, `Mejora ${k} (mínimo)`); score(rule.max, `Mejora ${k} (máximo)`); score(rule.cap, `Mejora ${k} (tope)`)
    if (rule.min > rule.max) e.push(`Mejora ${k}: el mínimo supera al máximo`)
    if (!Number.isInteger(rule.perSubject) || rule.perSubject < 0) e.push(`Mejora ${k}: límite por asignatura inválido`)
    if (!Number.isInteger(rule.perYear) || rule.perYear < 0) e.push(`Mejora ${k}: límite anual inválido`)
  }
  if (!['average', 'replace_if_higher'].includes(r.periodRecovery.method)) e.push('Método de recuperación del periodo inválido')
  if (r.periodRecovery.cap != null) score(r.periodRecovery.cap, 'Tope de la recuperación del periodo')
  score(r.lateAssessment.unjustifiedScore, 'Nota por evaluación atrasada no justificada')
  const p = r.promotion
  score(p.minToPass, 'Nota mínima de promoción'); score(p.supletorioMin, 'Supletorio (mínimo)'); score(p.supletorioMax, 'Supletorio (máximo)')
  score(p.supletorioCap, 'Tope del supletorio'); score(p.directRepeatMax, 'Repitencia directa')
  if (p.supletorioMin > p.supletorioMax) e.push('Supletorio: el mínimo supera al máximo')
  if (p.supletorioMax >= p.minToPass) e.push('Supletorio: el máximo debe ser menor a la nota de promoción')
  if (p.directRepeatMax >= p.supletorioMin) e.push('La repitencia directa debe ser menor al mínimo de supletorio')
  const subs = [...p.automaticSubniveles, ...p.directRepeatSubniveles, ...p.juntaDecisionSubniveles, ...r.earlyAlert.qualitativeSubniveles, ...r.earlyAlert.excludedSubniveles]
  for (const s of subs) if (!SUBNIVELES.includes(s)) e.push(`Subnivel desconocido: ${s}`)
  if (r.weights.formative + r.weights.summative !== 100) e.push('La ponderación formativa + sumativa debe sumar 100')
  return e
}

export class PrismaNormativeRepository {
  async get(institutionId: string) {
    const settings = await loadSettings(institutionId)
    const profile = extractNormativeProfile(settings)
    const rules = extractAgreementRules(settings)
    const gc = (settings.gradingConfig ?? {}) as { defaultExamWeight?: number }
    const years = await prisma.academicYear.findMany({
      where: { institutionId },
      select: { id: true, name: true, isActive: true },
      orderBy: { startDate: 'desc' },
    })
    return {
      profile,
      rules,
      preset: AGREEMENT_00082A_PRESET,
      warnings: complianceWarnings(profile, rules, gc.defaultExamWeight),
      years,
      options: { sostenimientos: SOSTENIMIENTOS, frameworks: FRAMEWORKS, subniveles: SUBNIVELES },
    }
  }

  async update(institutionId: string, dto: { profile?: Partial<NormativeProfile>; rules?: unknown }) {
    const settings = await loadSettings(institutionId)
    const profile = { ...extractNormativeProfile(settings), ...(dto.profile ?? {}) }
    if (!SOSTENIMIENTOS.includes(profile.sostenimiento)) throw new BadRequestError('Sostenimiento inválido')
    if (!['SIERRA_AMAZONIA', 'COSTA_GALAPAGOS'].includes(profile.regime)) throw new BadRequestError('Régimen inválido')
    if (!FRAMEWORKS.includes(profile.framework)) throw new BadRequestError('Marco normativo inválido')
    const byYear: Record<string, string> = {}
    for (const [yearId, fw] of Object.entries(profile.frameworkByYear ?? {})) {
      if (!FRAMEWORKS.includes(fw)) throw new BadRequestError('Marco normativo por año inválido')
      byYear[yearId] = fw
    }
    if (Object.keys(byYear).length) {
      const owned = await prisma.academicYear.count({ where: { institutionId, id: { in: Object.keys(byYear) } } })
      if (owned !== Object.keys(byYear).length) throw new BadRequestError('Año lectivo inválido')
    }
    const rules = dto.rules !== undefined ? deepMerge(extractAgreementRules(settings), dto.rules) : extractAgreementRules(settings)
    const errors = validateRules(rules)
    if (errors.length) throw new BadRequestError(errors.join(' · '))
    await saveSettings(institutionId, { ...settings, normativeProfile: { ...profile, frameworkByYear: byYear }, agreementRules: rules })
    return this.get(institutionId)
  }

  /**
   * Aplica el preset del acuerdo a las reglas y alinea la configuración de
   * calificación existente (escala A+…E-, supletorio, refuerzo, ponderación).
   * Es una acción explícita del administrador: nunca se ejecuta sola.
   */
  async applyPreset(institutionId: string, dto: { includeWeights?: boolean; includeScales?: boolean }) {
    const settings = await loadSettings(institutionId)
    const gc = { ...((settings.gradingConfig ?? {}) as Record<string, unknown>) }
    const P = AGREEMENT_00082A_PRESET
    gc.promotion = {
      ...((gc.promotion ?? {}) as object),
      minToPass: P.promotion.minToPass,
      supletorioMin: P.promotion.supletorioMin,
      supletorioMax: P.promotion.supletorioMax,
      passWithExam: P.promotion.supletorioCap,
      maxFailedSubjects: 0,
    }
    gc.pedagogicRecovery = { ...((gc.pedagogicRecovery ?? {}) as object), mode: P.periodRecovery.method }
    gc.activityGradeReinforcement = { ...((gc.activityGradeReinforcement ?? {}) as object), mode: P.formativeReinforcement.method }
    if (dto.includeScales !== false) {
      gc.qualitativeValueScale = AGREEMENT_00082A_VALUE_SCALE
      gc.qualitativeScale = AGREEMENT_00082A_QUALITATIVE_BANDS
    }
    await prisma.$transaction(async (tx) => {
      if (dto.includeWeights) {
        gc.defaultExamWeight = P.weights.summative
        gc.defaultProjectWeight = P.weights.summative / 2
        await tx.courseAssignment.updateMany({
          where: { institutionId },
          data: { examWeight: P.weights.summative, projectWeight: P.weights.summative / 2 },
        })
      }
      await tx.institution.update({
        where: { id: institutionId },
        data: { settings: { ...settings, gradingConfig: gc, agreementRules: P } as unknown as Prisma.InputJsonValue },
      })
    })
    return this.get(institutionId)
  }

  async getReportsFlow(institutionId: string) {
    const settings = await loadSettings(institutionId)
    const roles = await prisma.role.findMany({
      where: { institutionId },
      select: { name: true, label: true },
      orderBy: { label: 'asc' },
    })
    return { config: extractReportsFlow(settings), defaults: DEFAULT_REPORTS_FLOW, roles }
  }

  async updateReportsFlow(institutionId: string, config: ReportsFlowConfig) {
    if (!config || typeof config !== 'object') throw new BadRequestError('Configuración inválida')
    const settings = await loadSettings(institutionId)
    const next = extractReportsFlow({ reportsFlow: config })
    const errors = validateReportsFlow(next)
    // Usuarios de instancias "users" deben pertenecer a la institución
    const userIds = [...new Set(next.instances.flatMap((i) => (i.resolver === 'users' ? i.userIds ?? [] : [])))]
    if (userIds.length) {
      const count = await prisma.user.count({ where: { institutionId, id: { in: userIds } } })
      if (count !== userIds.length) errors.push('Hay usuarios de instancias que no pertenecen a la institución')
    }
    const roleNames = [...new Set(next.instances.flatMap((i) => (i.resolver === 'role' && i.role ? [i.role] : [])))]
    if (roleNames.length) {
      const count = await prisma.role.count({ where: { institutionId, name: { in: roleNames } } })
      if (count !== roleNames.length) errors.push('Hay instancias que apuntan a roles inexistentes')
    }
    if (errors.length) throw new BadRequestError(errors.join(' · '))
    await saveSettings(institutionId, { ...settings, reportsFlow: next })
    return this.getReportsFlow(institutionId)
  }

  async resetReportsFlow(institutionId: string) {
    const settings = await loadSettings(institutionId)
    const { reportsFlow: _drop, ...rest } = settings
    await saveSettings(institutionId, rest)
    return this.getReportsFlow(institutionId)
  }
}
