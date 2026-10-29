import { randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '@prisma/client'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../../shared/domain/errors/app.errors'
import {
  accessSchema,
  actionSchema,
  canReport,
  exclusionSchema,
  isEligibleReceiver,
  platformAllows,
  RECEIVER_ROLES,
  reportSchema,
  resolveSettings,
  roleMatches,
  safeReceivers,
  settingsSchema,
  statusSchema,
  type DeceActor,
} from '../domain/dece-policy'
import { z } from 'zod'

type Tx = Prisma.TransactionClient
const person = { id: true, profile: { select: { firstName: true, lastName: true } } }
const name = (user: { profile: { firstName: string; lastName: string } | null }) =>
  user.profile ? `${user.profile.firstName} ${user.profile.lastName}` : 'Sin nombre registrado'
function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new BadRequestError(
      'Revisa los campos obligatorios, las fechas y los límites del formulario',
    )
  return result.data
}

function storedContent<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success) throw new AppError('No se pudo abrir el registro DECE. Contacta al administrador técnico.', 503, 'DECE_CONTENT_INVALID')
  return result.data
}

export class DeceService {
  constructor(private db: PrismaClient = prisma) {}
  private async transaction<T>(operation: (tx: Tx) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(operation, {
          isolationLevel: 'Serializable',
          timeout: 20_000,
        })
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034' &&
          attempt < 2
        )
          continue
        throw error
      }
    }
  }
  async actor(userId: string, institutionId: string): Promise<DeceActor> {
    if (
      typeof userId !== 'string' ||
      typeof institutionId !== 'string' ||
      !userId ||
      !institutionId
    )
      throw new UnauthorizedError()
    const user = await this.db.user.findFirst({
      where: { id: userId, institutionId, isActive: true, institution: { isActive: true } },
      select: {
        userRoles: {
          include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
        },
      },
    })
    if (!user) throw new UnauthorizedError()
    const roles = user.userRoles
      .filter((link) => link.role.institutionId === institutionId)
      .map((link) => link.role.name)
    const canConfigure =
      roles.includes('admin') ||
      roles.includes('rector') ||
      user.userRoles.some(
        (link) =>
          link.role.institutionId === institutionId &&
          link.role.rolePermissions.some(
            ({ permission: p }) => p.resource === 'institution_config' && p.action === 'manage',
          ),
      )
    return { id: userId, institutionId, roles, canConfigure }
  }
  private async institution(tx: Tx, actor: DeceActor) {
    const institution = await tx.institution.findFirst({
      where: { id: actor.institutionId, isActive: true },
      select: { settings: true },
    })
    if (!institution) throw new NotFoundError()
    return {
      settings: resolveSettings(institution.settings),
      platformEnabled: platformAllows(institution.settings),
      raw: (institution.settings ?? {}) as Record<string, unknown>,
    }
  }
  private async staff(tx: Tx, institutionId: string) {
    const users = await tx.user.findMany({
      where: {
        institutionId,
        isActive: true,
        userRoles: {
          some: { role: { institutionId, name: { in: RECEIVER_ROLES } } },
          none: { role: { institutionId, name: { in: ['student', 'guardian'] } } },
        },
      },
      select: {
        ...person,
        userRoles: { select: { role: { select: { name: true, institutionId: true } } } },
      },
    })
    return users
      .map((user) => ({
        id: user.id,
        name: name(user),
        roles: user.userRoles
          .filter((link) => link.role.institutionId === institutionId)
          .map((link) => link.role.name),
      }))
      .filter((user) => isEligibleReceiver(user.roles))
  }
  private audit(tx: Tx, actor: DeceActor, action: string, caseId?: string) {
    return tx.deceAuditLog.create({
      data: { institutionId: actor.institutionId, actorId: actor.id, caseId, action },
    })
  }
  private readable(actor: DeceActor) {
    return {
      institutionId: actor.institutionId,
      exclusions: { none: { userId: actor.id } },
      access: { some: { userId: actor.id, revokedAt: null } },
    }
  }
  private async authorized(tx: Tx, actor: DeceActor, id: string, manage = false) {
    if (!isEligibleReceiver(actor.roles)) throw new NotFoundError('Expediente no disponible')
    await this.recoverFallback(tx, actor, id)
    const record = await tx.deceCase.findFirst({
      where: { id, ...this.readable(actor) },
      include: { access: { where: { userId: actor.id, revokedAt: null } } },
    })
    if (
      !isEligibleReceiver(actor.roles) ||
      !record ||
      (manage && record.access[0]?.access !== 'manager')
    )
      throw new NotFoundError('Expediente no disponible')
    return record
  }
  private requireConfig(actor: DeceActor) {
    if (!actor.canConfigure) throw new ForbiddenError()
  }
  async recordDenied(userId: string, institutionId: string) {
    const actor = await this.actor(userId, institutionId)
    await this.db.deceAuditLog.create({
      data: { institutionId: actor.institutionId, actorId: actor.id, action: 'access_denied' },
    })
  }
  async context(actor: DeceActor) {
    return this.transaction(async (tx) => {
      const { settings, platformEnabled } = await this.institution(tx, actor)
      await this.recoverFallback(tx, actor)
      const hasAssignments =
        isEligibleReceiver(actor.roles) &&
        !!(await tx.deceCase.findFirst({ where: this.readable(actor), select: { id: true } }))
      const visible =
        (settings.enabled && platformEnabled && roleMatches(actor.roles, settings.visibleRoles)) ||
        hasAssignments
      return {
        enabled: settings.enabled,
        platformEnabled,
        visible,
        hasAssignments,
        canReport: canReport(actor, settings, platformEnabled),
        canConfigure: actor.canConfigure,
        alternativeContact: visible ? settings.alternativeContact : '',
      }
    })
  }
  async getSettings(actor: DeceActor) {
    this.requireConfig(actor)
    return this.transaction(async (tx) => {
      const institution = await this.institution(tx, actor)
      const roles = await tx.role.findMany({
        where: { institutionId: actor.institutionId },
        select: { name: true, label: true },
        orderBy: { label: 'asc' },
      })
      await this.audit(tx, actor, 'settings_read')
      return {
        ...institution.settings,
        visibleRoles: institution.settings.visibleRoles.filter((role) =>
          roles.some((r) => r.name === role),
        ),
        reporterRoles: institution.settings.reporterRoles.filter((role) =>
          roles.some((r) => r.name === role),
        ),
        platformEnabled: institution.platformEnabled,
        roles,
        staff: await this.staff(tx, actor.institutionId),
      }
    })
  }
  async saveSettings(actor: DeceActor, input: unknown) {
    this.requireConfig(actor)
    const settings = parse(settingsSchema, input)
    return this.transaction(async (tx) => {
      const institution = await this.institution(tx, actor)
      const roles = await tx.role.findMany({
        where: { institutionId: actor.institutionId },
        select: { name: true },
      })
      if (
        settings.visibleRoles.some((role) => !roles.some((r) => r.name === role)) ||
        settings.reporterRoles.some((role) => !settings.visibleRoles.includes(role))
      )
        throw new BadRequestError(
          'Los roles deben pertenecer a la institución y los reportantes deben tener el módulo visible',
        )
      if (settings.enabled) {
        if (!institution.platformEnabled)
          throw new BadRequestError(
            'Habilita Rutas y protocolos DECE en los módulos de la institución desde plataforma',
          )
        const staff = await this.staff(tx, actor.institutionId)
        if (
          !settings.primaryReceiverId ||
          !settings.alternateReceiverId ||
          settings.primaryReceiverId === settings.alternateReceiverId ||
          [settings.primaryReceiverId, settings.alternateReceiverId].some(
            (id) => !staff.some((user) => user.id === id),
          )
        )
          throw new BadRequestError(
            'Selecciona dos responsables distintos y activos con rol DECE, rector o inspector',
          )
        if (!settings.alternativeContact.trim())
          throw new BadRequestError('Registra el canal alternativo de atención')
        if (!settings.reporterRoles.length)
          throw new BadRequestError('Habilita al menos un rol para reportar')
      }
      await tx.institution.update({
        where: { id: actor.institutionId },
        data: { settings: { ...institution.raw, deceRoutes: settings } as Prisma.InputJsonValue },
      })
      await this.audit(tx, actor, 'settings_updated')
      return settings
    })
  }
  async reportingContacts(actor: DeceActor) {
    return this.transaction(async (tx) => {
      const { settings, platformEnabled } = await this.institution(tx, actor)
      if (!canReport(actor, settings, platformEnabled))
        throw new ForbiddenError()
      return this.staff(tx, actor.institutionId)
    })
  }
  async createReport(actor: DeceActor, input: unknown) {
    const report = parse(reportSchema, input)
    try {
      return await this.transaction(async (tx) => {
        const { settings, platformEnabled } = await this.institution(tx, actor)
        if (!canReport(actor, settings, platformEnabled))
          throw new ForbiddenError('No está habilitada la recepción de nuevos reportes para tu rol')
        const existing = await tx.deceCase.findUnique({
          where: {
            institutionId_reporterId_requestId: {
              institutionId: actor.institutionId,
              reporterId: actor.id,
              requestId: report.requestId,
            },
          },
          select: { id: true, createdAt: true },
        })
        if (existing) return existing
        const staff = await this.staff(tx, actor.institutionId)
        if (report.excludedUserIds.some((id) => !staff.some((user) => user.id === id)))
          throw new BadRequestError('Revisa los responsables excluidos del reporte')
        const receivers = safeReceivers(
          settings,
          report.excludedUserIds,
          staff.map((user) => user.id),
        )
        if (!receivers.length)
          throw new ConflictError(
            'No hay un receptor seguro disponible. Utiliza el canal alternativo indicado; el reporte no se ha registrado.',
          )
        const id = randomUUID()
        const fallbackReceiverId =
          settings.alternateReceiverId &&
          !report.excludedUserIds.includes(settings.alternateReceiverId) &&
          staff.some((user) => user.id === settings.alternateReceiverId)
            ? settings.alternateReceiverId
            : null
        const reporter = await tx.user.findFirst({
          where: { id: actor.id, institutionId: actor.institutionId },
          select: person,
        })
        if (!reporter) throw new UnauthorizedError()
        const { requestId, excludedUserIds, ...content } = report
        const created = await tx.deceCase.create({
          data: {
            id,
            institutionId: actor.institutionId,
            reporterId: actor.id,
            requestId,
            fallbackReceiverId,
            urgency: report.immediateDanger,
            reportContent: { ...content, reporterName: name(reporter) },
            access: { create: receivers.map((userId) => ({ userId, access: 'manager' })) },
            exclusions: { create: [...new Set(excludedUserIds)].map((userId) => ({ userId })) },
          },
          select: { id: true, createdAt: true },
        })
        await this.audit(tx, actor, 'report_created', id)
        await tx.userNotification.createMany({
          data: receivers.map((userId) => ({
            userId,
            title: 'Nueva alerta confidencial',
            body: 'Tienes una alerta asignada. Ingresa al módulo protegido para revisarla.',
            url: `/dece/cases/${id}`,
          })),
        })
        return created
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.db.deceCase.findUnique({
          where: {
            institutionId_reporterId_requestId: {
              institutionId: actor.institutionId,
              reporterId: actor.id,
              requestId: report.requestId,
            },
          },
          select: { id: true, createdAt: true },
        })
        if (existing) return existing
      }
      throw error
    }
  }
  async receipts(actor: DeceActor) {
    return this.transaction(async (tx) => {
      const reports = await tx.deceCase.findMany({
        where: { institutionId: actor.institutionId, reporterId: actor.id },
        select: { id: true, createdAt: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 100,
      })
      await this.audit(tx, actor, 'receipts_read')
      return reports
    })
  }
  async list(actor: DeceActor) {
    return this.transaction(async (tx) => {
      await this.recoverFallback(tx, actor)
      const cases = isEligibleReceiver(actor.roles)
        ? await tx.deceCase.findMany({
            where: this.readable(actor),
            select: { id: true, status: true, urgency: true, createdAt: true, updatedAt: true },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 100,
          })
        : []
      await this.audit(tx, actor, 'inbox_read')
      return cases
    })
  }
  async detail(actor: DeceActor, id: string) {
    return this.transaction(async (tx) => {
      const record = await this.authorized(tx, actor, id)
      const actions = await tx.deceCaseAction.findMany({
        where: { institutionId: actor.institutionId, caseId: id },
        include: { actor: { select: person } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
      await this.audit(tx, actor, 'case_read', id)
      const report = storedContent(
        reportSchema.omit({ requestId: true, excludedUserIds: true }).extend({ reporterName: z.string() }),
        record.reportContent,
      )
      return {
        id: record.id,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        access: record.access[0].access,
        report,
        actions: actions.map((action) => ({
          id: action.id,
          type: action.type,
          createdAt: action.createdAt,
          actorName: name(action.actor),
          ...storedContent(z.object({ description: z.string().min(1) }), action.content),
        })),
      }
    })
  }
  private async appendAction(
    tx: Tx,
    actor: DeceActor,
    caseId: string,
    type: string,
    description: string,
  ) {
    const id = randomUUID()
    await tx.deceCaseAction.create({
      data: {
        id,
        institutionId: actor.institutionId,
        caseId,
        actorId: actor.id,
        type,
        content: { description },
      },
    })
    await tx.deceCase.update({ where: { id: caseId }, data: { updatedAt: new Date() } })
    await this.audit(tx, actor, type, caseId)
  }
  async addAction(actor: DeceActor, id: string, input: unknown) {
    const action = parse(actionSchema, input)
    return this.transaction(async (tx) => {
      const record = await this.authorized(tx, actor, id, true)
      if (record.status === 'internal_closed')
        throw new ConflictError('Reabre el seguimiento interno para agregar actuaciones')
      await this.appendAction(tx, actor, id, action.type, action.description)
      return { ok: true }
    })
  }
  async changeStatus(actor: DeceActor, id: string, input: unknown) {
    const update = parse(statusSchema, input)
    return this.transaction(async (tx) => {
      const record = await this.authorized(tx, actor, id, true)
      if (record.status === update.status)
        throw new ConflictError('El expediente ya tiene ese estado')
      await tx.deceCase.update({ where: { id }, data: { status: update.status } })
      await this.appendAction(
        tx,
        actor,
        id,
        'status_changed',
        `${record.status} → ${update.status}. ${update.reason}`,
      )
      return { ok: true }
    })
  }
  async access(actor: DeceActor, id: string) {
    return this.transaction(async (tx) => {
      await this.authorized(tx, actor, id, true)
      const access = await tx.deceCaseAccess.findMany({
        where: { institutionId: actor.institutionId, caseId: id, revokedAt: null },
        include: { user: { select: person } },
        orderBy: { createdAt: 'asc' },
      })
      const exclusions = await tx.deceCaseExclusion.findMany({
        where: { institutionId: actor.institutionId, caseId: id },
        include: { user: { select: person } },
      })
      await this.audit(tx, actor, 'access_read', id)
      return {
        members: access.map((member) => ({
          userId: member.userId,
          name: name(member.user),
          access: member.access,
        })),
        exclusions: exclusions.map((member) => ({
          userId: member.userId,
          name: name(member.user),
        })),
        candidates: await this.staff(tx, actor.institutionId),
      }
    })
  }
  async grant(actor: DeceActor, id: string, input: unknown) {
    const grant = parse(accessSchema, input)
    return this.transaction(async (tx) => {
      await this.authorized(tx, actor, id, true)
      const staff = await this.staff(tx, actor.institutionId)
      const target = staff.find((user) => user.id === grant.userId)
      if (!target)
        throw new BadRequestError(
          'El participante debe ser un responsable activo de esta institución',
        )
      const excluded = await tx.deceCaseExclusion.findUnique({
        where: { caseId_userId: { caseId: id, userId: grant.userId } },
      })
      if (excluded) throw new ConflictError('La persona está excluida por conflicto de interés')
      // No se permite perder al último gestor al degradar su acceso.
      await this.checkRemainingManager(tx, actor, id, grant.userId, grant.access === 'manager')
      await tx.deceCaseAccess.upsert({
        where: { caseId_userId: { caseId: id, userId: grant.userId } },
        create: {
          caseId: id,
          institutionId: actor.institutionId,
          userId: grant.userId,
          access: grant.access,
        },
        update: { access: grant.access, revokedAt: null },
      })
      if (grant.access === 'viewer')
        await tx.deceCase.updateMany({
          where: { id, institutionId: actor.institutionId, fallbackReceiverId: grant.userId },
          data: { fallbackReceiverId: null },
        })
      await this.appendAction(
        tx,
        actor,
        id,
        'access_granted',
        `Acceso ${grant.access === 'manager' ? 'de gestión' : 'de consulta'} para ${target.name}. Motivo: ${grant.reason}`,
      )
      await tx.userNotification.create({
        data: {
          userId: grant.userId,
          title: 'Acceso a expediente confidencial',
          body: 'Se te asignó acceso a un expediente. Ingresa para revisarlo.',
          url: `/dece/cases/${id}`,
        },
      })
      return { ok: true }
    })
  }
  /** Suplencia conservada por expediente; no concede acceso mientras exista un gestor apto. */
  private async recoverFallback(tx: Tx, actor: DeceActor, caseId?: string) {
    if (!isEligibleReceiver(actor.roles)) return
    const records = await tx.deceCase.findMany({
      where: {
        ...(caseId ? { id: caseId } : {}),
        institutionId: actor.institutionId,
        fallbackReceiverId: actor.id,
        status: { not: 'internal_closed' },
        exclusions: { none: { userId: actor.id } },
        access: {
          none: {
            access: 'manager',
            revokedAt: null,
            user: {
              isActive: true,
              userRoles: {
                some: {
                  role: { institutionId: actor.institutionId, name: { in: RECEIVER_ROLES } },
                },
                none: {
                  role: {
                    institutionId: actor.institutionId,
                    name: { in: ['student', 'guardian'] },
                  },
                },
              },
            },
          },
        },
      },
      select: { id: true },
      take: 100,
    })
    for (const record of records) {
      await tx.deceCaseAccess.upsert({
        where: { caseId_userId: { caseId: record.id, userId: actor.id } },
        create: {
          caseId: record.id,
          institutionId: actor.institutionId,
          userId: actor.id,
          access: 'manager',
        },
        update: { access: 'manager', revokedAt: null },
      })
      await this.appendAction(
        tx,
        actor,
        record.id,
        'backup_activated',
        'Se activó la suplencia registrada porque el expediente no tenía un gestor activo con función autorizada.',
      )
    }
  }
  private async checkRemainingManager(
    tx: Tx,
    actor: DeceActor,
    id: string,
    targetId: string,
    remainsManager: boolean,
  ) {
    if (remainsManager) return
    const members = await tx.deceCaseAccess.findMany({
      where: {
        institutionId: actor.institutionId,
        caseId: id,
        userId: { not: targetId },
        access: 'manager',
        revokedAt: null,
      },
    })
    const excluded = await tx.deceCaseExclusion.findMany({
      where: { institutionId: actor.institutionId, caseId: id },
      select: { userId: true },
    })
    const staff = await this.staff(tx, actor.institutionId)
    if (
      !members.some(
        (member) =>
          staff.some((user) => user.id === member.userId) &&
          !excluded.some((user) => user.userId === member.userId),
      )
    )
      throw new ConflictError(
        'Asigna primero otro gestor activo para no dejar el caso sin responsable',
      )
  }
  async revoke(actor: DeceActor, id: string, input: unknown, exclude = false) {
    const revoke = parse(exclusionSchema, input)
    return this.transaction(async (tx) => {
      await this.authorized(tx, actor, id, true)
      const target = (await this.staff(tx, actor.institutionId)).find(
        (user) => user.id === revoke.userId,
      )
      // Se puede revocar a una persona desactivada sin volver a habilitarla.
      const existing = await tx.deceCaseAccess.findUnique({
        where: { caseId_userId: { caseId: id, userId: revoke.userId } },
      })
      if (!target && !existing) throw new BadRequestError('Participante no disponible')
      await this.checkRemainingManager(tx, actor, id, revoke.userId, false)
      await tx.deceCaseAccess.updateMany({
        where: {
          institutionId: actor.institutionId,
          caseId: id,
          userId: revoke.userId,
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      })
      await tx.deceCase.updateMany({
        where: { id, institutionId: actor.institutionId, fallbackReceiverId: revoke.userId },
        data: { fallbackReceiverId: null },
      })
      if (exclude)
        await tx.deceCaseExclusion.upsert({
          where: { caseId_userId: { caseId: id, userId: revoke.userId } },
          create: { institutionId: actor.institutionId, caseId: id, userId: revoke.userId },
          update: {},
        })
      await this.appendAction(
        tx,
        actor,
        id,
        exclude ? 'conflict_excluded' : 'access_revoked',
        `${exclude ? 'Exclusión por conflicto de interés' : 'Revocación de acceso'}: ${target?.name ?? 'Participante desactivado'}. Motivo: ${revoke.reason}`,
      )
      return { ok: true }
    })
  }
  async auditLog(actor: DeceActor, id: string) {
    return this.transaction(async (tx) => {
      await this.authorized(tx, actor, id, true)
      await this.audit(tx, actor, 'audit_read', id)
      return tx.deceAuditLog.findMany({
        where: { institutionId: actor.institutionId, caseId: id },
        select: { id: true, action: true, createdAt: true, actor: { select: person } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      })
    })
  }
}
