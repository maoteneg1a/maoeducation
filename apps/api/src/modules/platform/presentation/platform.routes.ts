import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import { platformAuthMiddleware } from '../../../shared/infrastructure/middleware/platform-auth.middleware'
import { UnauthorizedError } from '../../../shared/domain/errors/app.errors'
import { PrismaPlatformRepository } from '../infrastructure/repositories/prisma-platform.repository'
import { PlatformLoginUseCase } from '../application/use-cases/platform-login.use-case'
import { PlatformRefreshUseCase } from '../application/use-cases/platform-refresh.use-case'
import { CreateInstitutionUseCase } from '../application/use-cases/create-institution.use-case'
import { ListInstitutionsUseCase } from '../application/use-cases/list-institutions.use-case'
import { ToggleInstitutionUseCase } from '../application/use-cases/toggle-institution.use-case'
import { ListInstitutionAdminsUseCase } from '../application/use-cases/list-institution-admins.use-case'
import { CreateInstitutionAdminUseCase } from '../application/use-cases/create-institution-admin.use-case'
import { UpdateInstitutionAdminUseCase } from '../application/use-cases/update-institution-admin.use-case'
import {
  CreateInstitutionAdminBody,
  CreateInstitutionBody,
  PlatformLoginBody,
  UpdateInstitutionAdminBody,
} from './validators/platform.schema'
import { seedTestData } from '../application/services/seed-test-data.service'

const repo = new PrismaPlatformRepository()
const loginUseCase = new PlatformLoginUseCase(repo, tokenService)
const refreshUseCase = new PlatformRefreshUseCase(repo, tokenService)
const createInstitution = new CreateInstitutionUseCase(repo)
const listInstitutions = new ListInstitutionsUseCase(repo)
const toggleInstitution = new ToggleInstitutionUseCase(repo)
const listAdmins = new ListInstitutionAdminsUseCase(repo)
const createAdmin = new CreateInstitutionAdminUseCase(repo)
const updateAdmin = new UpdateInstitutionAdminUseCase(repo)

const REFRESH_COOKIE = 'platform_refresh_token'
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/platform',
  maxAge: 60 * 60 * 24 * 7, // 7 días en segundos
}

const adminUserBody = {
  type: 'object',
  required: ['email', 'firstName', 'lastName', 'password'],
  properties: {
    email: { type: 'string', format: 'email' },
    firstName: { type: 'string', minLength: 1 },
    lastName: { type: 'string', minLength: 1 },
    password: { type: 'string', minLength: 8 },
  },
} as const

export default async function platformRoutes(app: FastifyInstance) {
  // ----- Auth de plataforma (público) -----
  app.post<{ Body: PlatformLoginBody }>(
    '/platform/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const result = await loginUseCase.execute(req.body)
      reply.setCookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS)
      return reply.send({ accessToken: result.accessToken, admin: result.admin })
    },
  )

  app.post('/platform/refresh', async (req, reply) => {
    const refreshToken = req.cookies[REFRESH_COOKIE]
    if (!refreshToken) throw new UnauthorizedError('Refresh token no encontrado')
    const result = await refreshUseCase.execute(refreshToken)
    return reply.send(result)
  })

  app.post('/platform/logout', async (_req, reply) => {
    reply.clearCookie(REFRESH_COOKIE, { path: '/api/v1/platform' })
    return reply.status(204).send()
  })

  // ----- Instituciones (protegido) -----
  const protectedOpts = { preHandler: [platformAuthMiddleware] }

  app.get('/platform/institutions', protectedOpts, async (_req, reply) => {
    return reply.send(await listInstitutions.execute())
  })

  app.post<{ Body: CreateInstitutionBody }>(
    '/platform/institutions',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'code', 'admin'],
          properties: {
            name: { type: 'string', minLength: 2 },
            code: { type: 'string', minLength: 2 },
            admin: adminUserBody,
            regime: { type: 'string', enum: ['SIERRA_AMAZONIA', 'COSTA_GALAPAGOS'] },
          },
        },
      },
    },
    async (req, reply) => {
      const result = await createInstitution.execute(req.body)
      return reply.status(201).send(result)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/platform/institutions/:id/toggle',
    protectedOpts,
    async (req, reply) => {
      return reply.send(await toggleInstitution.execute(req.params.id))
    },
  )

  app.patch<{ Params: { id: string }; Body: { modules: string[] } }>(
    '/platform/institutions/:id/modules',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['modules'],
          properties: { modules: { type: 'array', items: { type: 'string' } } },
        },
      },
    },
    async (req, reply) => {
      const institution = await prisma.institution.findUnique({
        where: { id: req.params.id },
        select: { settings: true },
      })
      if (!institution) return reply.status(404).send({ message: 'Institución no encontrada' })
      const current = (institution.settings ?? {}) as Record<string, unknown>
      const updated = await prisma.institution.update({
        where: { id: req.params.id },
        data: { settings: { ...current, modules: req.body.modules } as unknown as Parameters<typeof prisma.institution.update>[0]['data']['settings'] },
        select: { id: true, settings: true },
      })
      return reply.send({ id: updated.id, modules: (updated.settings as Record<string, unknown>).modules })
    },
  )

  app.patch<{ Params: { id: string }; Body: { isTestInstitution: boolean } }>(
    '/platform/institutions/:id/test-flag',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          required: ['isTestInstitution'],
          properties: { isTestInstitution: { type: 'boolean' } },
        },
      },
    },
    async (req, reply) => {
      const institution = await prisma.institution.findUnique({
        where: { id: req.params.id },
        select: { settings: true },
      })
      if (!institution) return reply.status(404).send({ message: 'Institución no encontrada' })
      const current = (institution.settings ?? {}) as Record<string, unknown>
      const updated = await prisma.institution.update({
        where: { id: req.params.id },
        data: {
          settings: { ...current, isTestInstitution: req.body.isTestInstitution } as unknown as Parameters<
            typeof prisma.institution.update
          >[0]['data']['settings'],
        },
        select: { id: true, settings: true },
      })
      return reply.send({ id: updated.id, isTestInstitution: (updated.settings as Record<string, unknown>).isTestInstitution })
    },
  )

  app.post<{ Params: { id: string } }>(
    '/platform/institutions/:id/seed-test-data',
    protectedOpts,
    async (req, reply) => {
      return reply.send(await seedTestData(req.params.id))
    },
  )

  // ----- Admins de una institución (protegido) -----
  app.get<{ Params: { id: string } }>(
    '/platform/institutions/:id/admins',
    protectedOpts,
    async (req, reply) => {
      return reply.send(await listAdmins.execute(req.params.id))
    },
  )

  app.post<{ Params: { id: string }; Body: CreateInstitutionAdminBody }>(
    '/platform/institutions/:id/admins',
    { ...protectedOpts, schema: { body: adminUserBody } },
    async (req, reply) => {
      const result = await createAdmin.execute(req.params.id, req.body)
      return reply.status(201).send(result)
    },
  )

  app.patch<{ Params: { id: string; userId: string }; Body: UpdateInstitutionAdminBody }>(
    '/platform/institutions/:id/admins/:userId',
    {
      ...protectedOpts,
      schema: {
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            isActive: { type: 'boolean' },
            password: { type: 'string', minLength: 8 },
          },
        },
      },
    },
    async (req: FastifyRequest<{ Params: { id: string; userId: string }; Body: UpdateInstitutionAdminBody }>, reply: FastifyReply) => {
      const result = await updateAdmin.execute(req.params.id, req.params.userId, req.body)
      return reply.send(result)
    },
  )
}
