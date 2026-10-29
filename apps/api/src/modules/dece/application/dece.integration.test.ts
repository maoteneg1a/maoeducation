import { randomUUID } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: undefined }))
vi.mock('../../../config/env', () => ({
  env: {
    JWT_SECRET: 'test-secret-only-never-production-0123456789',
    JWT_REFRESH_SECRET: 'test-refresh-only-never-production-0123456789',
    JWT_ACCESS_EXPIRES: '15m',
  },
}))
import { DeceService } from './dece.service'
import { DEFAULT_SETTINGS, type DeceActor } from '../domain/dece-policy'
import { createDeceRoutes } from '../presentation/dece.routes'
import { tokenService } from '../../../shared/infrastructure/services/token.service'

const testUrl = process.env.DECE_TEST_DATABASE_URL
// Nunca usar DATABASE_URL: esta suite solo admite una base efímera local conocida.
if (testUrl) {
  const parsed = new URL(testUrl)
  if (
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '55439' ||
    parsed.pathname !== '/dece_test'
  )
    throw new Error('DECE integration tests require the isolated local dece_test database')
}
const suite = testUrl ? describe : describe.skip
suite('DECE: PostgreSQL y API autenticada', () => {
  let db: PrismaClient
  let service: DeceService
  let app: FastifyInstance
  let school: string
  let actors: Record<string, DeceActor>
  const report = (extra: Record<string, unknown> = {}) => ({
    requestId: randomUUID(),
    concern: 'other',
    immediateDanger: 'unknown',
    affectedPerson: 'Persona ficticia',
    narrative: 'Relato confidencial ficticio para pruebas de aislamiento.',
    safeContact: 'Contacto de prueba',
    privacyAcknowledged: true,
    ...extra,
  })
  const headers = (actor: DeceActor) => ({
    authorization: `Bearer ${tokenService.signAccess({ sub: actor.id, institutionId: actor.institutionId, roles: ['admin'], permissions: ['*:manage:all'] })}`,
  })
  const request = (
    actor: DeceActor,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    path: string,
    payload?: unknown,
  ) =>
    app.inject({
      method,
      url: `/api/v1/dece${path}`,
      headers: headers(actor),
      ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }),
    })
  const open = () => service.createReport(actors.teacher, report())
  beforeAll(() => {
    db = new PrismaClient({ datasources: { db: { url: testUrl! } }, log: [] })
    service = new DeceService(db)
  })
  beforeEach(async () => {
    const institution = await db.institution.create({
      data: {
        name: 'Escuela ficticia',
        code: `TEST_${randomUUID()}`,
        settings: { modules: ['dece_routes'], branding: { primaryColor: 'blue' } },
      },
    })
    school = institution.id
    const other = await db.institution.create({
      data: { name: 'Otra escuela ficticia', code: `TEST_${randomUUID()}` },
    })
    actors = {}
    for (const [key, roleName] of Object.entries({
      admin: 'admin',
      primary: 'dece',
      backup: 'dece',
      unrelated: 'dece',
      rector: 'rector',
      teacher: 'teacher',
      student: 'student',
      guardian: 'guardian',
      outsider: 'dece',
    })) {
      const institutionId = key === 'outsider' ? other.id : school
      const role = await db.role.upsert({
        where: { institutionId_name: { institutionId, name: roleName } },
        create: { institutionId, name: roleName, label: roleName },
        update: {},
      })
      const user = await db.user.create({
        data: {
          institutionId,
          email: `${key}@example.test`,
          passwordHash: 'unused-test-only',
          profile: { create: { firstName: key, lastName: 'Ficticio' } },
          userRoles: { create: { roleId: role.id } },
        },
      })
      actors[key] = await service.actor(user.id, institutionId)
    }
    await db.role.create({ data: { institutionId: school, name: 'inspector', label: 'Inspector' } })
    await service.saveSettings(actors.admin, {
      ...DEFAULT_SETTINGS,
      enabled: true,
      primaryReceiverId: actors.primary.id,
      alternateReceiverId: actors.backup.id,
      alternativeContact: 'Oficina alternativa ficticia',
    })
    app = Fastify({ logger: false })
    await app.register(createDeceRoutes(service), { prefix: '/api/v1' })
    await app.ready()
  }, 20_000)
  // Solo se cierra la conexión. El contenedor de pruebas se elimina externamente;
  // no hay limpieza destructiva que pueda alcanzar bases ajenas.
  afterEach(async () => {
    await app?.close()
  })
  afterAll(async () => {
    await db?.$disconnect()
  })

  it('registra una alerta sin clave adicional, devuelve un acuse mínimo y avisa únicamente al receptor', async () => {
    const response = await request(actors.student, 'POST', '/reports', report())
    expect(response.statusCode).toBe(201)
    expect(Object.keys(response.json()).sort()).toEqual(['createdAt', 'id'])
    expect(response.headers['cache-control']).toBe('no-store')
    const id = response.json().id
    const saved = await db.deceCase.findUniqueOrThrow({ where: { id } })
    expect(saved.reportContent).toMatchObject({ narrative: expect.stringContaining('Relato confidencial') })
    const detail = await request(actors.primary, 'GET', `/cases/${id}`)
    expect(detail.statusCode).toBe(200)
    expect(detail.json().report.reporterName).toBe('student Ficticio')
    expect(detail.json().report.narrative).toContain('Relato confidencial')
    const notifications = await db.userNotification.findMany({
      where: { user: { institutionId: school } },
    })
    expect(notifications).toHaveLength(1)
    expect(notifications[0].userId).toBe(actors.primary.id)
    expect(notifications[0].body).not.toContain('Persona ficticia')
    expect((await request(actors.student, 'GET', '/receipts')).json()).toEqual([response.json()])
  })
  it('no concede expedientes al administrador, roles sin asignación o a otra institución, aunque el JWT declare privilegios', async () => {
    const { id } = await open()
    for (const key of ['admin', 'unrelated', 'teacher', 'student', 'guardian', 'outsider']) {
      expect((await request(actors[key], 'GET', `/cases/${id}`)).statusCode).toBe(404)
      expect((await request(actors[key], 'GET', '/cases')).json()).toEqual([])
    }
    expect(
      await db.deceAuditLog.count({ where: { institutionId: school, action: 'access_denied' } }),
    ).toBeGreaterThan(0)
    const invalidTenantToken = tokenService.signPlatformAccess({ sub: actors.admin.id })
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/dece/context',
          headers: { authorization: `Bearer ${invalidTenantToken}` },
        })
      ).statusCode,
    ).toBe(401)
  })
  it('excluye al receptor implicado, usa el alternativo y deniega incluso una concesión accidental en la BD', async () => {
    const { id } = await service.createReport(
      actors.teacher,
      report({ excludedUserIds: [actors.primary.id] }),
    )
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(404)
    expect((await request(actors.backup, 'GET', `/cases/${id}`)).statusCode).toBe(200)
    await db.deceCaseAccess.create({
      data: { institutionId: school, caseId: id, userId: actors.primary.id, access: 'manager' },
    })
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(404)
    expect(await db.userNotification.count({ where: { userId: actors.primary.id } })).toBe(0)
    await expect(
      service.grant(actors.backup, id, {
        userId: actors.primary.id,
        access: 'manager',
        reason: 'Intento de acceso',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
  it('no deja una alerta sin receptor seguro y conserva el canal alternativo', async () => {
    const response = await request(
      actors.teacher,
      'POST',
      '/reports',
      report({ excludedUserIds: [actors.primary.id, actors.backup.id] }),
    )
    expect(response.statusCode).toBe(409)
    expect(await db.deceCase.count({ where: { institutionId: school } })).toBe(0)
    expect((await request(actors.teacher, 'GET', '/context')).json().alternativeContact).toBe(
      'Oficina alternativa ficticia',
    )
  })
  it('evita duplicados ante dos envíos concurrentes de la misma alerta', async () => {
    const input = report()
    const responses = await Promise.all([
      request(actors.teacher, 'POST', '/reports', input),
      request(actors.teacher, 'POST', '/reports', input),
    ])
    expect(responses.map((r) => r.statusCode)).toEqual([201, 201])
    expect(responses[0].json().id).toBe(responses[1].json().id)
    expect(await db.deceCase.count({ where: { institutionId: school } })).toBe(1)
    expect(
      await db.deceAuditLog.count({ where: { institutionId: school, action: 'report_created' } }),
    ).toBe(1)
    expect(await db.userNotification.count({ where: { userId: actors.primary.id } })).toBe(1)
  })
  it('distingue consulta de gestión y rechaza concesiones a otra institución', async () => {
    const { id } = await open()
    await service.grant(actors.primary, id, {
      userId: actors.rector.id,
      access: 'viewer',
      reason: 'Revisar medidas institucionales',
    })
    expect((await request(actors.rector, 'GET', `/cases/${id}`)).statusCode).toBe(200)
    expect(
      (
        await request(actors.rector, 'POST', `/cases/${id}/actions`, {
          type: 'note',
          description: 'No autorizado',
        })
      ).statusCode,
    ).toBe(404)
    expect((await request(actors.rector, 'GET', `/cases/${id}/access`)).statusCode).toBe(404)
    await expect(
      service.grant(actors.primary, id, {
        userId: actors.outsider.id,
        access: 'viewer',
        reason: 'No corresponde',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
  })
  it('impide retirar al último gestor y conserva las exclusiones tras revocar', async () => {
    const { id } = await open()
    await expect(
      service.revoke(actors.primary, id, {
        userId: actors.primary.id,
        reason: 'Cambio de responsable',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await service.grant(actors.primary, id, {
      userId: actors.backup.id,
      access: 'manager',
      reason: 'Responsable de reemplazo',
    })
    await service.revoke(
      actors.backup,
      id,
      { userId: actors.primary.id, reason: 'Conflicto de interés detectado' },
      true,
    )
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(404)
    await expect(
      service.grant(actors.backup, id, {
        userId: actors.primary.id,
        access: 'viewer',
        reason: 'Intento de acceso',
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
  })
  it('desactivar o quitar visibilidad impide nuevos reportes sin abandonar los expedientes abiertos', async () => {
    const { id } = await open()
    await service.saveSettings(actors.admin, {
      ...DEFAULT_SETTINGS,
      enabled: false,
      visibleRoles: [],
      reporterRoles: [],
      primaryReceiverId: null,
      alternateReceiverId: null,
      alternativeContact: 'Alternativa',
    })
    expect((await request(actors.teacher, 'POST', '/reports', report())).statusCode).toBe(403)
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(200)
    expect((await request(actors.primary, 'GET', '/context')).json()).toMatchObject({
      visible: true,
      hasAssignments: true,
      canReport: false,
    })
    expect(
      Object.keys((await request(actors.teacher, 'GET', '/receipts')).json()[0]).sort(),
    ).toEqual(['createdAt', 'id'])
  })
  it('activa suplencia auditada si se desactiva al único gestor', async () => {
    const { id } = await open()
    expect((await service.context(actors.backup)).hasAssignments).toBe(false)
    await db.user.update({ where: { id: actors.primary.id }, data: { isActive: false } })
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(401)
    expect((await service.context(actors.backup)).hasAssignments).toBe(true)
    expect((await request(actors.backup, 'GET', `/cases/${id}`)).statusCode).toBe(200)
    expect(await db.deceAuditLog.count({ where: { caseId: id, action: 'backup_activated' } })).toBe(
      1,
    )
  })
  it('usa los roles actuales y activa suplencia cuando se retira la función DECE al gestor', async () => {
    const { id } = await open()
    await db.userRole.deleteMany({ where: { userId: actors.primary.id } })
    expect((await request(actors.primary, 'GET', `/cases/${id}`)).statusCode).toBe(404)
    expect((await request(actors.backup, 'GET', `/cases/${id}`)).statusCode).toBe(200)
  })
  it('el cierre solo afecta al seguimiento interno y puede reabrirse con motivo', async () => {
    const { id } = await open()
    await service.changeStatus(actors.primary, id, {
      status: 'internal_closed',
      reason: 'Verificadas las actuaciones internas',
    })
    await expect(
      service.addAction(actors.primary, id, { type: 'note', description: 'Nota' }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await service.changeStatus(actors.primary, id, {
      status: 'follow_up',
      reason: 'Nueva necesidad de acompañamiento',
    })
    await service.addAction(actors.primary, id, {
      type: 'referral',
      description: 'Constancia ficticia de una derivación externa ya realizada.',
    })
    const detail = await service.detail(actors.primary, id)
    expect(detail.status).toBe('follow_up')
    expect(detail.actions).toHaveLength(3)
    const stored = await db.deceCaseAction.findMany({ where: { caseId: id } })
    expect(stored.every((a) => typeof a.content === 'object' && a.content !== null)).toBe(true)
  })
  it('conserva otras configuraciones y rechaza una recepción sin responsables distintos', async () => {
    const stored = await db.institution.findUniqueOrThrow({ where: { id: school } })
    expect(stored.settings).toMatchObject({ branding: { primaryColor: 'blue' } })
    await expect(
      service.saveSettings(actors.admin, {
        ...DEFAULT_SETTINGS,
        enabled: true,
        primaryReceiverId: actors.primary.id,
        alternateReceiverId: actors.primary.id,
        alternativeContact: 'Alternativa',
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect((await request(actors.teacher, 'GET', '/settings')).statusCode).toBe(403)
    expect((await request(actors.teacher, 'PUT', '/settings', DEFAULT_SETTINGS)).statusCode).toBe(
      403,
    )
  })
  it('la BD bloquea modificar/borrar auditorías y actuaciones; las lecturas dejan traza', async () => {
    const { id } = await open()
    await service.addAction(actors.primary, id, { type: 'note', description: 'Actuación ficticia' })
    const before = await db.deceAuditLog.count({ where: { caseId: id, action: 'case_read' } })
    await service.detail(actors.primary, id)
    expect(await db.deceAuditLog.count({ where: { caseId: id, action: 'case_read' } })).toBe(
      before + 1,
    )
    await expect(
      db.$executeRaw`UPDATE dece_audit_logs SET action = 'altered' WHERE case_id = ${id}`,
    ).rejects.toThrow('append-only')
    await expect(
      db.$executeRaw`DELETE FROM dece_case_actions WHERE case_id = ${id}`,
    ).rejects.toThrow('append-only')
    await expect(db.$executeRaw`TRUNCATE dece_audit_logs`).rejects.toThrow('append-only')
  })
  it('una exclusión se respeta durante la suplencia y un permiso de consulta no se eleva tras revocarlo', async () => {
    const { id } = await open()
    await service.grant(actors.primary, id, {
      userId: actors.rector.id,
      access: 'manager',
      reason: 'Responsable adicional de prueba',
    })
    await service.revoke(
      actors.rector,
      id,
      { userId: actors.backup.id, reason: 'Suplente implicado en el caso' },
      true,
    )
    await db.user.updateMany({
      where: { id: { in: [actors.primary.id, actors.rector.id] } },
      data: { isActive: false },
    })
    expect((await request(actors.backup, 'GET', `/cases/${id}`)).statusCode).toBe(404)
  })
  it('la visibilidad por rol también bloquea reportes directos por API', async () => {
    await service.saveSettings(actors.admin, {
      ...DEFAULT_SETTINGS,
      enabled: true,
      visibleRoles: ['dece', 'student'],
      reporterRoles: ['student'],
      primaryReceiverId: actors.primary.id,
      alternateReceiverId: actors.backup.id,
      alternativeContact: 'Alternativa de prueba',
    })
    expect((await service.context(actors.teacher)).visible).toBe(false)
    expect((await request(actors.teacher, 'POST', '/reports', report())).statusCode).toBe(403)
    expect((await request(actors.student, 'POST', '/reports', report())).statusCode).toBe(201)
  })
  it('permite configurar y reportar sin una clave de cifrado DECE', async () => {
    const standalone = new DeceService(db)
    await standalone.saveSettings(actors.admin, {
      ...DEFAULT_SETTINGS, enabled: true,
      primaryReceiverId: actors.primary.id, alternateReceiverId: actors.backup.id,
      alternativeContact: 'Alternativa',
    })
    await standalone.createReport(actors.teacher, report())
    expect(await db.deceCase.count({ where: { institutionId: school } })).toBe(1)
  })
  it('la referencia de un expediente no puede asociarse a otra institución mediante la BD', async () => {
    const { id } = await open()
    await expect(
      db.deceCaseAccess.create({
        data: {
          institutionId: actors.outsider.institutionId,
          caseId: id,
          userId: actors.outsider.id,
          access: 'manager',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2003' })
  })
  it('un contenido inválido no filtra datos ni marca como exitosa la lectura', async () => {
    const { id } = await open()
    await db.deceCase.update({ where: { id }, data: { reportContent: 'contenido inválido' } })
    await expect(service.detail(actors.primary, id)).rejects.toMatchObject({
      statusCode: 503,
    })
    expect(await db.deceAuditLog.count({ where: { caseId: id, action: 'case_read' } })).toBe(0)
  })
})
