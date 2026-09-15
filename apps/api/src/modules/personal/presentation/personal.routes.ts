import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors/app.errors'
import { bootstrapInstitution } from '../../platform/application/services/institution-bootstrap'
import { buildAuthInstitution } from '../../auth/application/services/auth-institution.mapper'
import { PrismaAuthUserRepository } from '../../auth/infrastructure/repositories/prisma-auth-user.repository'
import { sendVerificationEmail } from '../../../shared/infrastructure/services/email.service'

const userRepo = new PrismaAuthUserRepository()

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
          // Marcar la institución como personal y pendiente de setup
          await tx.institution.update({
            where: { id: result.institutionId },
            data: {
              settings: {
                accountType: 'personal',
                setupComplete: false,
                modules: ['academic', 'enrollment', 'activities', 'grades', 'attendance', 'reports', 'branding'],
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

  // ─── Setup ────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      profile: 'subject-first' | 'classroom-first'
      yearName: string
      yearStart: string
      yearEnd: string
      workspaceName?: string
      // subject-first
      subjectName?: string
      groups?: Array<{ name: string }>
      // classroom-first
      parallelName?: string
      subjectNames?: string[]
    }
  }>(
    '/personal/setup',
    {
      preHandler: [authMiddleware],
      schema: {
        body: {
          type: 'object',
          required: ['profile', 'yearName', 'yearStart', 'yearEnd'],
          properties: {
            profile: { type: 'string', enum: ['subject-first', 'classroom-first'] },
            yearName: { type: 'string', minLength: 1 },
            yearStart: { type: 'string' },
            yearEnd: { type: 'string' },
            workspaceName: { type: 'string' },
            subjectName: { type: 'string' },
            groups: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
            parallelName: { type: 'string' },
            subjectNames: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (req, reply) => {
      const institutionId = req.user.institutionId
      const teacherId = req.user.sub

      const institution = await prisma.institution.findUnique({
        where: { id: institutionId },
        select: { settings: true },
      })
      const settings = (institution?.settings ?? {}) as Record<string, unknown>
      if (settings.accountType !== 'personal') {
        return reply.status(403).send({ message: 'Solo disponible para cuentas personales' })
      }

      const { profile, yearName, yearStart, yearEnd, workspaceName } = req.body

      // Update workspace name if provided
      if (workspaceName?.trim()) {
        await prisma.institution.update({ where: { id: institutionId }, data: { name: workspaceName.trim() } })
      }

      // Get period scheme for trimester generation
      const scheme = await prisma.academicPeriodScheme.findFirst({
        where: { institutionId },
        select: { id: true, periodsCount: true },
      })

      // Create academic year
      const year = await prisma.academicYear.create({
        data: { institutionId, name: yearName, startDate: new Date(yearStart), endDate: new Date(yearEnd) },
      })

      // Auto-generate trimester periods
      if (scheme) {
        const start = new Date(yearStart)
        const end = new Date(yearEnd)
        const totalMs = end.getTime() - start.getTime()
        const periodMs = totalMs / scheme.periodsCount
        const names = ['1er Trimestre', '2do Trimestre', '3er Trimestre', '1er Quimestre', '2do Quimestre']
        for (let i = 0; i < scheme.periodsCount; i++) {
          const pStart = new Date(start.getTime() + periodMs * i)
          const pEnd = new Date(start.getTime() + periodMs * (i + 1) - 1)
          await prisma.academicPeriod.create({
            data: {
              schemeId: scheme.id,
              academicYearId: year.id,
              name: names[i] ?? `Período ${i + 1}`,
              periodNumber: i + 1,
              startDate: pStart,
              endDate: pEnd,
            },
          })
        }
      }

      // Get or create default level for personal accounts
      let level = await prisma.level.findFirst({ where: { institutionId, code: 'PERSONAL' } })
      if (!level) {
        level = await prisma.level.create({
          data: { institutionId, code: 'PERSONAL', name: 'Mis Cursos', sortOrder: 99 },
        })
      }

      const assignmentIds: string[] = []
      const subjectIds: string[] = []
      const parallelIds: string[] = []

      if (profile === 'subject-first' && req.body.subjectName && req.body.groups?.length) {
        // One subject, multiple parallels
        const subject = await prisma.subject.create({
          data: { institutionId, name: req.body.subjectName },
        })
        subjectIds.push(subject.id)

        for (const g of req.body.groups) {
          const parallel = await prisma.parallel.create({
            data: { institutionId, name: g.name, levelId: level.id, academicYearId: year.id },
          })
          parallelIds.push(parallel.id)

          const assignment = await prisma.courseAssignment.create({
            data: { institutionId, subjectId: subject.id, parallelId: parallel.id, teacherId, academicYearId: year.id },
          })
          assignmentIds.push(assignment.id)
        }
      } else if (profile === 'classroom-first' && req.body.parallelName && req.body.subjectNames?.length) {
        // One parallel, multiple subjects
        const parallel = await prisma.parallel.create({
          data: { institutionId, name: req.body.parallelName, levelId: level.id, academicYearId: year.id },
        })
        parallelIds.push(parallel.id)

        for (const sName of req.body.subjectNames) {
          const subject = await prisma.subject.create({
            data: { institutionId, name: sName },
          })
          subjectIds.push(subject.id)

          const assignment = await prisma.courseAssignment.create({
            data: { institutionId, subjectId: subject.id, parallelId: parallel.id, teacherId, academicYearId: year.id },
          })
          assignmentIds.push(assignment.id)
        }
      }

      // Mark setup complete (preserve existing settings like branding)
      const currentSettings = (institution?.settings ?? {}) as Record<string, unknown>
      await prisma.institution.update({
        where: { id: institutionId },
        data: { settings: { ...currentSettings, setupComplete: true } as unknown as Parameters<typeof prisma.institution.update>[0]['data']['settings'] },
      })

      return reply.send({ yearId: year.id, parallelIds, subjectIds, assignmentIds })
    },
  )
}
