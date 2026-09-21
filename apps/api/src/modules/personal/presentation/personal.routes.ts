import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors/app.errors'
import { bootstrapInstitution } from '../../platform/application/services/institution-bootstrap'
import { MultigradeDomainError, resolveMultigradeSelections } from '../../../shared/domain/multigrade'
import { buildAuthInstitution } from '../../auth/application/services/auth-institution.mapper'
import { PrismaAuthUserRepository } from '../../auth/infrastructure/repositories/prisma-auth-user.repository'
import { sendVerificationEmail } from '../../../shared/infrastructure/services/email.service'
import {
  getOrCreateSubjectForArea,
  listPersonalClasses,
  reconcilePersonalClasses,
  type PersonalClassSelection,
  type PlanningModel,
} from '../application/services/personal-structure.service'

const userRepo = new PrismaAuthUserRepository()

/**
 * Módulos que recibe una cuenta personal de docente al registrarse.
 *
 * Los tres primeros son el grupo de planificación — la razón por la que un
 * docente abre una cuenta personal. Antes faltaban aquí, así que el producto
 * quedaba oculto justo para ese público.
 *
 * Mantener en sync con PERSONAL_DEFAULT_MODULES en
 * apps/web/src/shared/lib/modules.ts (no hay paquete compartido todavía).
 */
const PERSONAL_DEFAULT_MODULES = [
  'planning',
  'interdisciplinary_projects',
  'reinforcement_plans',
  'academic',
  'enrollment',
  'activities',
  'grades',
  'attendance',
  'reports',
  'branding',
]

async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
  await prisma.verificationToken.deleteMany({ where: { userId } })
  await prisma.verificationToken.create({ data: { userId, token, expiresAt } })
  return token
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 60 * 60 * 24 * 7,
}

async function buildLoginResponse(userId: string) {
  const userWithPerms = await userRepo.getWithPermissions(userId)
  if (!userWithPerms) throw new UnauthorizedError()

  const institution = await prisma.institution.findUnique({
    where: { id: userWithPerms.institutionId },
    select: { id: true, name: true, settings: true },
  })
  if (!institution) throw new UnauthorizedError()

  const accessToken = tokenService.signAccess({
    sub: userWithPerms.id,
    institutionId: userWithPerms.institutionId,
    roles: userWithPerms.roles,
    permissions: userWithPerms.permissions,
  })
  const refreshToken = tokenService.signRefresh({ sub: userWithPerms.id })

  const tutoredParallels = await prisma.parallel.findMany({
    where: { tutorId: userWithPerms.id },
    select: { id: true },
  })

  const fullName = userWithPerms.profile
    ? `${userWithPerms.profile.firstName} ${userWithPerms.profile.lastName}`
    : userWithPerms.email

  return {
    accessToken,
    refreshToken,
    user: {
      id: userWithPerms.id,
      email: userWithPerms.email,
      fullName,
      avatarUrl: userWithPerms.profile?.avatarUrl ?? null,
      roles: userWithPerms.roles,
      permissions: userWithPerms.permissions,
      institutionId: userWithPerms.institutionId,
      institution: buildAuthInstitution(institution),
      tutorParallelIds: tutoredParallels.map((p) => p.id),
    },
  }
}

export default async function personalRoutes(app: FastifyInstance) {
  // ─── Register ─────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      firstName: string
      lastName: string
      email: string
      password: string
      workspaceName?: string
    }
  }>(
    '/personal/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['firstName', 'lastName', 'email', 'password'],
          properties: {
            firstName: { type: 'string', minLength: 1 },
            lastName: { type: 'string', minLength: 1 },
            email: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 6 },
            workspaceName: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const { firstName, lastName, email, password, workspaceName } = req.body

      // Email globally unique for personal accounts
      const existing = await prisma.user.findFirst({
        where: {
          email,
          institution: { settings: { path: ['accountType'], equals: 'personal' } },
        },
      })
      if (existing) throw new ConflictError('Ya existe una cuenta personal con ese email')

      const name = workspaceName?.trim() || `Aula de ${firstName} ${lastName}`
      const code = `PERSONAL_${Date.now()}`

      const { institutionId, adminUserId } = await prisma.$transaction(
        async (tx) => {
          const result = await bootstrapInstitution(
            tx,
            { name, code },
            { email, firstName, lastName, password },
          )
          // Marcar la institución como personal — setupComplete ya nace true:
          // el wizard de onboarding (PersonalSetupPage) se eliminó, "Mis
          // grados y materias" ya cubre lo mismo (grado+materia, año lectivo
          // ya existe por bootstrapInstitution) sin bloquear el dashboard.
          // planningModel arranca en 'competencias' — es hacia donde está
          // migrando toda la plataforma (Biología, el generador principal de
          // IA, etc.); el docente puede pedir cambiarlo después si hace falta.
          await tx.institution.update({
            where: { id: result.institutionId },
            data: {
              settings: {
                accountType: 'personal',
                setupComplete: true,
                planningModel: 'competencias',
                modules: PERSONAL_DEFAULT_MODULES,
              } as unknown as Parameters<typeof tx.institution.update>[0]['data']['settings'],
            },
          })
          // Asignar también rol teacher al usuario admin personal
          const teacherRole = await tx.role.findFirst({
            where: { institutionId: result.institutionId, name: 'teacher' },
            select: { id: true },
          })
          if (teacherRole) {
            await tx.userRole.create({ data: { userId: result.adminUserId, roleId: teacherRole.id } })
          }
          return result
        },
        // bootstrapInstitution siembra centenares de filas con creates secuenciales —
        // el timeout default de 5s se queda corto contra la latencia real de red en
        // producción y la transacción se cierra a medias (P2028).
        { timeout: 60_000 },
      )

      const token = await createVerificationToken(adminUserId)
      await sendVerificationEmail(email, firstName, token)
      return reply.status(201).send({ message: 'Revisa tu correo para activar tu cuenta.' })
    },
  )

  // ─── Login ────────────────────────────────────────────────────────────────
  app.post<{ Body: { email: string; password: string } }>(
    '/personal/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', minLength: 1 },
            password: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (req, reply) => {
      const { email, password } = req.body

      const user = await prisma.user.findFirst({
        where: {
          email,
          institution: { settings: { path: ['accountType'], equals: 'personal' } },
        },
        include: { profile: true },
      })

      if (!user || !user.isActive) throw new UnauthorizedError('Credenciales inválidas')

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) throw new UnauthorizedError('Credenciales inválidas')

      if (!user.emailVerifiedAt) {
        return reply.status(403).send({ code: 'EMAIL_NOT_VERIFIED', message: 'Confirma tu correo antes de ingresar.' })
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

      const result = await buildLoginResponse(user.id)
      reply.setCookie('refresh_token', result.refreshToken, COOKIE_OPTIONS)
      return reply.send({ accessToken: result.accessToken, user: result.user })
    },
  )

  // ─── Verify email ─────────────────────────────────────────────────────────
  app.get<{ Querystring: { token: string } }>(
    '/personal/verify-email',
    async (req, reply) => {
      const { token } = req.query
      if (!token) return reply.status(400).send({ message: 'Token requerido' })

      const record = await prisma.verificationToken.findUnique({ where: { token } })
      if (!record) return reply.status(400).send({ message: 'Enlace inválido o ya utilizado.' })
      if (record.expiresAt < new Date()) {
        await prisma.verificationToken.delete({ where: { token } })
        return reply.status(400).send({ message: 'El enlace expiró. Solicita uno nuevo.' })
      }

      await prisma.$transaction([
        prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
        prisma.verificationToken.delete({ where: { token } }),
      ])

      return reply.send({ message: 'Correo verificado. Ya puedes iniciar sesión.' })
    },
  )

  // ─── Resend verification ───────────────────────────────────────────────────
  app.post<{ Body: { email: string } }>(
    '/personal/resend-verification',
    {
      schema: {
        body: { type: 'object', required: ['email'], properties: { email: { type: 'string' } } },
      },
    },
    async (req, reply) => {
      const { email } = req.body

      const user = await prisma.user.findFirst({
        where: { email, institution: { settings: { path: ['accountType'], equals: 'personal' } } },
        include: { profile: true },
      })

      // Always return success to prevent user enumeration
      if (!user || user.emailVerifiedAt) {
        return reply.send({ message: 'Si el correo existe, recibirás un nuevo enlace.' })
      }

      const token = await createVerificationToken(user.id)
      const firstName = user.profile?.firstName ?? 'Profe'
      await sendVerificationEmail(email, firstName, token)

      return reply.send({ message: 'Nuevo enlace enviado. Revisa tu bandeja.' })
    },
  )

  // ─── Edición de grados/materias + modo multigrado + modelo curricular ────
  // Único punto de administración de la estructura académica de una cuenta
  // personal (agregar/quitar grado+materia, prender/apagar multigrado,
  // cambiar destrezas/competencias) — no hay wizard de onboarding separado.

  // El wizard de onboarding (/personal/setup) fijaba planningModel una sola
  // vez en el paso "Currículo" — eliminado ese wizard, esta es la única vía
  // para que una cuenta personal lo cambie después de registrarse (arranca
  // en 'competencias' por defecto, ver POST /personal/register).
  app.put<{ Body: { planningModel: 'destrezas' | 'competencias' } }>(
    '/personal/planning-model',
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['planningModel'],
          properties: { planningModel: { type: 'string', enum: ['destrezas', 'competencias'] } },
        },
      },
    },
    async (req, reply) => {
      const institutionId = req.user.institutionId
      const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
      const settings = (institution?.settings ?? {}) as Record<string, unknown>
      if (settings.accountType !== 'personal') {
        return reply.status(403).send({ message: 'Solo disponible para cuentas personales' })
      }
      await prisma.institution.update({
        where: { id: institutionId },
        data: { settings: { ...settings, planningModel: req.body.planningModel } },
      })
      return reply.send({ planningModel: req.body.planningModel })
    },
  )

  app.get('/personal/classes', { preHandler: [authMiddleware] }, async (req, reply) => {
    const institutionId = req.user.institutionId
    const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
    const settings = (institution?.settings ?? {}) as Record<string, unknown>
    if (settings.accountType !== 'personal') {
      return reply.status(403).send({ message: 'Solo disponible para cuentas personales' })
    }
    const state = await listPersonalClasses(institutionId)
    return reply.send(state)
  })

  app.put<{
    Body: {
      selections: PersonalClassSelection[]
      multigradeEnabled: boolean
      allowSuperiorExtension?: boolean
    }
  }>(
    '/personal/classes',
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['selections', 'multigradeEnabled'],
          properties: {
            selections: {
              type: 'array',
              items: {
                type: 'object',
                required: ['gradeCode', 'subjectAreaId'],
                properties: {
                  gradeCode: { type: 'string' },
                  subjectAreaId: { type: 'string' },
                  weeklyPeriodsOverride: { type: ['number', 'null'] },
                },
              },
            },
            multigradeEnabled: { type: 'boolean' },
            allowSuperiorExtension: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const institutionId = req.user.institutionId
      const teacherId = req.user.sub
      const institution = await prisma.institution.findUnique({ where: { id: institutionId }, select: { settings: true } })
      const settings = (institution?.settings ?? {}) as Record<string, unknown>
      if (settings.accountType !== 'personal') {
        return reply.status(403).send({ message: 'Solo disponible para cuentas personales' })
      }

      try {
        const result = await reconcilePersonalClasses(
          institutionId,
          teacherId,
          req.body.selections,
          req.body.multigradeEnabled,
          req.body.allowSuperiorExtension ?? false,
        )
        return reply.send(result)
      } catch (error) {
        if (error instanceof MultigradeDomainError) {
          return reply.status(400).send({ message: error.message, code: error.code, gradeCode: error.gradeCode })
        }
        throw error
      }
    },
  )
}
