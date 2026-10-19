import { FastifyInstance } from 'fastify'
import { AUTH_RATE_LIMIT } from '../../../shared/infrastructure/plugins/rate-limit'
import { authController } from './controllers/auth.controller'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { loginSchema } from './validators/auth.schema'

export default async function authRoutes(app: FastifyInstance) {
  app.post(
    '/auth/login',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'institutionCode'],
          properties: {
            // "email" admite correo o cédula como identificador.
            email:           { type: 'string', minLength: 1 },
            password:        { type: 'string', minLength: 1 },
            institutionCode: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    authController.login,
  )

  app.post('/auth/refresh', authController.refresh)
  app.post('/auth/logout', authController.logout)

  app.get(
    '/auth/me',
    { preHandler: [authMiddleware] },
    authController.me,
  )

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/auth/change-password',
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 1 },
            newPassword: { type: 'string', minLength: 6 },
          },
        },
      },
    },
    authController.changePassword,
  )
}
