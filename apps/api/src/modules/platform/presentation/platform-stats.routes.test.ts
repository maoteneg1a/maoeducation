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
})
