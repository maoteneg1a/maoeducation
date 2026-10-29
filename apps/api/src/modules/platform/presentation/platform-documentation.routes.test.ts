import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5434/test'
  process.env.JWT_SECRET = 'documentation-test-secret-'.repeat(3)
  process.env.JWT_REFRESH_SECRET = 'documentation-refresh-secret-'.repeat(3)
})

import platformDocumentationRoutes from './platform-documentation.routes'
import { tokenService } from '../../../shared/infrastructure/services/token.service'

describe('documentación privada de operaciones', () => {
  let app: ReturnType<typeof Fastify>
  beforeEach(async () => {
    app = Fastify()
    await app.register(platformDocumentationRoutes)
  })
  afterEach(async () => { await app.close() })

  it.each([undefined, 'invalid-token'])('rechaza acceso sin sesión válida (%s)', async token => {
    const response = await app.inject({ method: 'GET', url: '/platform/documentation',
      headers: token ? { authorization: `Bearer ${token}` } : {} })
    expect(response.statusCode).toBe(401)
    expect(response.body).not.toContain('pg_restore')
  })

  it('rechaza sesiones de usuarios de instituciones aunque sean administradores', async () => {
    const token = tokenService.signAccess({ sub: 'tenant-admin', institutionId: 'school', roles: ['admin'], permissions: ['*'] })
    const response = await app.inject({ method: 'GET', url: '/platform/documentation', headers: { authorization: `Bearer ${token}` } })
    expect(response.statusCode).toBe(401)
    expect(response.body).not.toContain('pg_restore')
  })

  it.each(['support', 'billing'])('rechaza el rol de plataforma %s', async role => {
    const token = tokenService.signPlatformAccess({ sub: 'operator', role })
    const response = await app.inject({ method: 'GET', url: '/platform/documentation', headers: { authorization: `Bearer ${token}` } })
    expect(response.statusCode).toBe(403)
    expect(response.body).not.toContain('pg_restore')
  })

  it.each(['owner', undefined])('sirve la guía al propietario (%s) sin caché compartida', async role => {
    const token = tokenService.signPlatformAccess({ sub: 'owner', role })
    const response = await app.inject({ method: 'GET', url: '/platform/documentation', headers: { authorization: `Bearer ${token}` } })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
    const guide = response.json().guides[0]
    expect(guide.id).toBe('restore-local-database')
    expect(guide.content).toContain('--single-transaction')
    expect(guide.content).toContain('localhost:5434')
    expect(guide.content).not.toContain('AGE-SECRET-KEY-')
  })
})
