import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ user: { findMany: vi.fn(), count: vi.fn() } }))
vi.mock('../../../shared/infrastructure/database/prisma', () => ({ prisma: db }))
vi.mock('../../../shared/infrastructure/middleware/platform-auth.middleware', () => ({
  platformAuthMiddleware: async () => {},
  requirePlatformRole: () => async () => {},
}))
vi.mock('../../../shared/infrastructure/services/token.service', () => ({ tokenService: {} }))
vi.mock('../../../shared/infrastructure/services/audit.service', () => ({ audit: vi.fn() }))

import platformStatsRoutes from './platform-stats.routes'

describe('usuarios de una institución en plataforma', () => {
  let app: ReturnType<typeof Fastify>

  beforeEach(async () => {
    vi.resetAllMocks()
    db.user.findMany.mockResolvedValue([])
    db.user.count.mockResolvedValue(25)
    app = Fastify()
    await app.register(platformStatsRoutes)
  })

  afterEach(async () => { await app.close() })

  it.each(['school-a', 'school-b'])('mantiene el filtro %s en búsqueda, paginación y total', async (institutionId) => {
    const response = await app.inject({
      method: 'GET',
      url: `/platform/users?institutionId=${institutionId}&search=Ana&page=2&limit=20`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ data: [], total: 25 })
    expect(db.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({
        institutionId,
        OR: expect.arrayContaining([
          { email: { contains: 'Ana', mode: 'insensitive' } },
        ]),
      }),
    }))
    expect(db.user.count).toHaveBeenCalledWith({ where: db.user.findMany.mock.calls[0][0].where })
  })

  it('rechaza un filtro de institución vacío', async () => {
    const response = await app.inject({ method: 'GET', url: '/platform/users?institutionId=' })
    expect(response.statusCode).toBe(400)
    expect(db.user.findMany).not.toHaveBeenCalled()
  })

  it('filtra por rol y documento antes de paginar y conserva el mismo filtro en el total', async () => {
    const response = await app.inject({ method: 'GET', url: '/platform/users?institutionId=school-a&role=teacher&search=E123456789&page=2&limit=20&sort=name_asc' })
    expect(response.statusCode).toBe(200)
    const query = db.user.findMany.mock.calls[0][0]
    expect(query).toMatchObject({ skip: 20, take: 20, where: {
      institutionId: 'school-a', userRoles: { some: { role: { name: 'teacher' } } },
      OR: expect.arrayContaining([{ profile: { dni: { contains: 'E123456789', mode: 'insensitive' } } }]),
    } })
    expect(query.orderBy).toEqual([{ profile: { lastName: 'asc' } }, { profile: { firstName: 'asc' } }, { email: 'asc' }, { id: 'asc' }])
    expect(db.user.count).toHaveBeenCalledWith({ where: query.where })
  })

  it('incluye autoridades con rol docente una sola vez al consultar personal', async () => {
    db.user.findMany.mockResolvedValue([{
      id: 'authority', email: 'authority@example.test', isActive: true,
      profile: { firstName: 'Ana', lastName: 'Pérez' },
      institution: { id: 'school-a', name: 'Escuela A', settings: {} },
      userRoles: [{ role: { name: 'rector' } }, { role: { name: 'teacher' } }],
      createdAt: new Date('2026-01-01'),
    }])
    db.user.count.mockResolvedValue(1)
    const response = await app.inject({ method: 'GET', url: '/platform/users?institutionId=school-a&role=staff&sort=name_desc' })
    expect(response.statusCode).toBe(200)
    expect(response.json().data).toHaveLength(1)
    expect(response.json().data[0].roles).toEqual(['rector', 'teacher'])
    expect(db.user.findMany.mock.calls[0][0].where).toMatchObject({
      institutionId: 'school-a', userRoles: { some: { role: { name: { in: ['admin', 'rector', 'inspector', 'dece', 'teacher'] } } } },
    })
    expect(db.user.findMany.mock.calls[0][0].orderBy[0]).toEqual({ profile: { lastName: 'desc' } })
  })

  it('mantiene un desempate estable en el orden de registros recientes', async () => {
    await app.inject({ method: 'GET', url: '/platform/users?institutionId=school-a' })
    expect(db.user.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'asc' }])
  })

  it.each(['role=unknown', 'sort=unknown'])('rechaza el filtro inválido %s sin consultar usuarios', async (filter) => {
    const response = await app.inject({ method: 'GET', url: '/platform/users?institutionId=school-a&'+filter })
    expect(response.statusCode).toBe(400)
    expect(db.user.findMany).not.toHaveBeenCalled()
  })
})
