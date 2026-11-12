import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForbiddenError } from '../../../shared/domain/errors/app.errors'

const { actor, transfer, assertScope } = vi.hoisted(() => ({
  actor: { sub: 'teacher', institutionId: 'school', roles: ['teacher'], permissions: ['enrollment:manage:own'], impersonatedBy: undefined as string | undefined },
  transfer: vi.fn(), assertScope: vi.fn(),
}))
vi.mock('../../../shared/infrastructure/middleware/auth.middleware', () => ({ authMiddleware: async (req: { user: unknown }) => { req.user = { ...actor } } }))
vi.mock('../../../shared/infrastructure/services/teacher-scope.service', () => ({
  assertParallelInScope: assertScope, getTeacherParallelIds: vi.fn(), isPrivilegedStaff: vi.fn(),
}))
vi.mock('../infrastructure/repositories/prisma-enrollment.repository', () => ({ PrismaEnrollmentRepository: class { transfer = transfer } }))
import enrollmentRoutes from './enrollment.routes'

const payload = { sourceParallelId: 'morning', targetParallelId: 'afternoon', enrollmentIds: ['e1'] }
let app: ReturnType<typeof Fastify>
beforeEach(async () => {
  vi.resetAllMocks()
  actor.roles = ['teacher']; actor.permissions = ['enrollment:manage:own']
  transfer.mockResolvedValue({ transferred: 1, sourceParallelId: 'morning', targetParallelId: 'afternoon' })
  app = Fastify()
  await app.register(enrollmentRoutes)
})
afterEach(async () => { await app.close() })

it('requires enrollment management permission', async () => {
  actor.permissions = ['enrollment:read:own']
  const response = await app.inject({ method: 'POST', url: '/enrollments/transfer', payload })
  expect(response.statusCode).toBe(403)
  expect(transfer).not.toHaveBeenCalled()
})

it.each(['morning', 'afternoon'])('rejects a parallel outside the actor scope: %s', async (deniedId) => {
  assertScope.mockImplementation(async (_req, id) => { if (id === deniedId) throw new ForbiddenError() })
  const response = await app.inject({ method: 'POST', url: '/enrollments/transfer', payload })
  expect(response.statusCode).toBe(403)
  expect(transfer).not.toHaveBeenCalled()
})

it('validates both scopes and uses the authenticated institution and actor', async () => {
  const response = await app.inject({ method: 'POST', url: '/enrollments/transfer', payload, headers: { 'user-agent': 'test-client' } })
  expect(response.statusCode).toBe(200)
  expect(assertScope.mock.calls.map((call) => call[1])).toEqual(['morning', 'afternoon'])
  expect(transfer).toHaveBeenCalledWith('school', payload, expect.objectContaining({ userId: 'teacher', userAgent: 'test-client' }))
  expect(response.json().transferred).toBe(1)
})

it.each([
  {}, { ...payload, enrollmentIds: [] }, { ...payload, enrollmentIds: ['e1', 'e1'] },
  { ...payload, enrollmentIds: Array.from({ length: 501 }, (_, i) => String(i)) },
  { ...payload, reason: 'x'.repeat(501) }, { ...payload, targetParallelId: '' },
])('rejects invalid request bodies', async (body) => {
  const response = await app.inject({ method: 'POST', url: '/enrollments/transfer', payload: body })
  expect(response.statusCode).toBe(400)
  expect(transfer).not.toHaveBeenCalled()
})
