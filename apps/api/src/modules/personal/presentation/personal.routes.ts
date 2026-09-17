import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { tokenService } from '../../../shared/infrastructure/services/token.service'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { BadRequestError, ConflictError, NotFoundError, UnauthorizedError } from '../../../shared/domain/errors/app.errors'
import { bootstrapInstitution } from '../../platform/application/services/institution-bootstrap'
import {
  MultigradeDomainError,
  MULTIGRADE_GRADE_NAME,
  MULTIGRADE_GRADE_SORT_ORDER,
  resolveMultigradeSelections,
} from '../../../shared/domain/multigrade'
import { buildAuthInstitution } from '../../auth/application/services/auth-institution.mapper'
import { PrismaAuthUserRepository } from '../../auth/infrastructure/repositories/prisma-auth-user.repository'
import { sendVerificationEmail } from '../../../shared/infrastructure/services/email.service'

const userRepo = new PrismaAuthUserRepository()

/**
 * Subniveles MINEDUC válidos para el wizard de setup personal — mismo catálogo
 * que usa el admin en Configuración > Niveles (ver SUBNIVEL_LABEL en
 * apps/web/src/features/academic/pages/LevelsPage.tsx).
 */
const VALID_SUBNIVELES = ['inicial', 'preparatoria', 'elemental', 'media', 'superior', 'bgu']

/**
 * El wizard nunca deja escribir el nombre de una materia a mano: el profesor
 * elige de un catálogo oficial (banco de destrezas o de competencias, según
 * el planningModel del paso "Currículo") y aquí resolvemos el/los área(s)
 * seleccionadas contra ese catálogo real de la institución — sin heurística
 * de texto de ningún tipo. El código MINEDUC (M, LL, CN, CS, ECA, EF, EFL,
 * EG...) es compartido entre ambos bancos, así que además de vincular el área
 * del modelo elegido, intentamos enlazar también la equivalente del otro
 * banco por code exacto — no por keywords — para que si el profesor cambia
 * de planningModel más adelante la materia ya quede enlazada en ambos.
 */
async function resolveSubjectAreaLinks(
  institutionId: string,
  planningModel: 'destrezas' | 'competencias',
  areaId: string,
): Promise<{ name: string; curriculumAreaId?: string; competencyAreaId?: string }> {
  if (planningModel === 'competencias') {
    const competencyArea = await prisma.competencyArea.findFirst({ where: { id: areaId, institutionId } })
    if (!competencyArea) throw new NotFoundError('Área de competencias no encontrada en el catálogo de la institución')
    const curriculumArea = await prisma.curriculumArea.findFirst({
      where: { institutionId, code: competencyArea.code },
      select: { id: true },
    })
    return {
      name: competencyArea.name,
      competencyAreaId: competencyArea.id,
      ...(curriculumArea ? { curriculumAreaId: curriculumArea.id } : {}),
    }
  }

  const curriculumArea = await prisma.curriculumArea.findFirst({ where: { id: areaId, institutionId } })
  if (!curriculumArea) throw new NotFoundError('Área curricular no encontrada en el catálogo de la institución')
  const competencyArea = await prisma.competencyArea.findFirst({
    where: { institutionId, code: curriculumArea.code },
    select: { id: true },
  })
  return {
    name: curriculumArea.name,
    curriculumAreaId: curriculumArea.id,
    ...(competencyArea ? { competencyAreaId: competencyArea.id } : {}),
  }
}

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
          // Marcar la institución como personal y pendiente de setup
          await tx.institution.update({
            where: { id: result.institutionId },
            data: {
              settings: {
                accountType: 'personal',
                setupComplete: false,
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

  // ─── Setup ────────────────────────────────────────────────────────────────
  app.post<{
    Body: {
      profile: 'subject-first' | 'classroom-first' | 'multigrade'
      yearName: string
      yearStart: string
      yearEnd: string
      workspaceName?: string
      // subject-first — una sola materia (elegida del catálogo oficial), varios grupos
      subjectAreaId?: string
      groups?: Array<{ name: string }>
      // classroom-first — un solo grupo, varias materias (elegidas del catálogo oficial)
      parallelName?: string
      subjectAreaIds?: string[]
      // multigrado — selección explícita grado+materia (unidocente/pluridocente), calcado
      // de las reglas TIGA Multigrado v1.0 (ver shared/domain/multigrade.ts). Mínimo 2
      // selecciones; 8vo-10mo EGB requiere allowSuperiorExtension=true explícito; BGU rechazado.
      multigradeName?: string
      multigradeSelections?: Array<{ gradeCode: string; subjectAreaId: string }>
      allowSuperiorExtension?: boolean
      // paso de competencias — fijan de una vez el modelo de planificación para
      // que el profesor nunca tenga que tocar Configuración > Calificación.
      subnivel?: string
      planningModel?: 'destrezas' | 'competencias'
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
            profile: { type: 'string', enum: ['subject-first', 'classroom-first', 'multigrade'] },
            yearName: { type: 'string', minLength: 1 },
            yearStart: { type: 'string' },
            yearEnd: { type: 'string' },
            workspaceName: { type: 'string' },
            subjectAreaId: { type: 'string' },
            groups: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
            parallelName: { type: 'string' },
            subjectAreaIds: { type: 'array', items: { type: 'string' } },
            multigradeName: { type: 'string' },
            multigradeSelections: {
              type: 'array',
              items: {
                type: 'object',
                required: ['gradeCode', 'subjectAreaId'],
                properties: { gradeCode: { type: 'string' }, subjectAreaId: { type: 'string' } },
              },
            },
            allowSuperiorExtension: { type: 'boolean' },
            subnivel: { type: 'string', enum: VALID_SUBNIVELES },
            planningModel: { type: 'string', enum: ['destrezas', 'competencias'] },
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

      const { profile, yearName, yearStart, yearEnd, workspaceName, subnivel } = req.body
      // Multigrado SIEMPRE usa el modelo por COMPETENCIAS (CNC): es el único banco
      // que cubre el subnivel "preparatoria" (1ro EGB reutiliza su currículo integrado,
      // ver shared/domain/multigrade.ts) y es el formato ya calcado de TIGA
      // (Inicio/Desarrollo/Cierre con actividades numeradas + DUA) que el generador
      // multigrado necesita — nunca se le pregunta al docente, se decide aquí.
      const planningModel: 'destrezas' | 'competencias' | undefined =
        profile === 'multigrade' ? 'competencias' : req.body.planningModel

      // Multigrado: valida TODAS las selecciones grado+materia ANTES de escribir nada
      // en la base — all-or-nothing, calcado del orquestador de TIGA (si una sola
      // selección es inválida — BGU, fuera de rango, o 8vo-10mo sin confirmar la
      // extensión superior — se rechaza la lista completa con 400 explícito, sin
      // dejar creado ningún Level/Parallel/CourseAssignment a medias).
      let resolvedMultigradeSelections: ReturnType<typeof resolveMultigradeSelections> = []
      if (profile === 'multigrade') {
        try {
          resolvedMultigradeSelections = resolveMultigradeSelections(
            req.body.multigradeSelections ?? [],
            req.body.allowSuperiorExtension === true,
          )
        } catch (error) {
          if (error instanceof MultigradeDomainError) throw new BadRequestError(error.message)
          throw error
        }
      }

      // Update workspace name if provided
      if (workspaceName?.trim()) {
        await prisma.institution.update({ where: { id: institutionId }, data: { name: workspaceName.trim() } })
      }

      // Get period scheme for trimester generation
      const scheme = await prisma.academicPeriodScheme.findFirst({
        where: { institutionId },
        select: { id: true, periodsCount: true },
      })

      // Create academic year — bootstrapInstitution (en /personal/register) ya crea
      // un año lectivo activo con el nombre por defecto del régimen (ej. "2026-2027")
      // más sus 3 períodos, para que la app no salga vacía antes del wizard. Si el
      // docente deja ese mismo nombre en este paso, create() chocaba con el
      // constraint único (institution_id, name) — se reusa ese año existente
      // (actualizando fechas si las cambió) en vez de duplicar.
      const existingYear = await prisma.academicYear.findFirst({ where: { institutionId, name: yearName } })
      const year = existingYear
        ? await prisma.academicYear.update({
            where: { id: existingYear.id },
            data: { startDate: new Date(yearStart), endDate: new Date(yearEnd) },
          })
        : await prisma.academicYear.create({
            data: { institutionId, name: yearName, startDate: new Date(yearStart), endDate: new Date(yearEnd) },
          })
      const yearHadPeriods = existingYear
        ? (await prisma.academicPeriod.count({ where: { academicYearId: year.id } })) > 0
        : false

      // Auto-generate trimester periods — solo si el año es nuevo o no tenía
      // períodos todavía (el año que ya trae bootstrapInstitution ya tiene los suyos).
      if (scheme && !yearHadPeriods) {
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

      // Get or create default level for personal accounts. El subnivel elegido
      // en el wizard (paso Competencias) decide qué banco curricular (destrezas
      // o competencias) le ofrece luego el selector de la planificación semanal
      // — así el profesor nunca necesita ir a Configuración > Niveles a fijarlo.
      // Multigrado NO usa este nivel único "PERSONAL": cada grado necesita SU
      // PROPIO Level con el subnivel correcto (1B=preparatoria, 2B-4B=elemental,
      // 5B-7B=media, 8B-10B=superior) — se resuelve en la rama multigrado abajo.
      const resolvedSubnivel = subnivel && VALID_SUBNIVELES.includes(subnivel) ? subnivel : 'media'
      let level: Awaited<ReturnType<typeof prisma.level.findFirst>> = null
      if (profile !== 'multigrade') {
        level = await prisma.level.findFirst({ where: { institutionId, code: 'PERSONAL' } })
        if (!level) {
          level = await prisma.level.create({
            data: { institutionId, code: 'PERSONAL', name: 'Mis Cursos', sortOrder: 99, subnivel: resolvedSubnivel },
          })
        } else if (subnivel && level.subnivel !== resolvedSubnivel) {
          level = await prisma.level.update({ where: { id: level.id }, data: { subnivel: resolvedSubnivel } })
        }
      }

      const assignmentIds: string[] = []
      const subjectIds: string[] = []
      const parallelIds: string[] = []
      let multigradeGroupId: string | null = null
      const resolvedPlanningModel: 'destrezas' | 'competencias' =
        planningModel ?? ((settings.planningModel as 'destrezas' | 'competencias' | undefined) ?? 'destrezas')

      // Reusa una materia existente con el mismo área en vez de duplicarla si el
      // profesor ya la había creado antes (ej. reintenta el wizard, o eligió la
      // misma área en ambos perfiles) — el catálogo de áreas es fijo por
      // institución, así que dos Subjects con la misma área serían redundantes.
      async function getOrCreateSubjectForArea(areaId: string) {
        const { name, curriculumAreaId, competencyAreaId } = await resolveSubjectAreaLinks(
          institutionId,
          resolvedPlanningModel,
          areaId,
        )
        const existing = await prisma.subject.findFirst({
          where: {
            institutionId,
            ...(curriculumAreaId ? { curriculumAreaId } : {}),
            ...(competencyAreaId ? { competencyAreaId } : {}),
          },
        })
        if (existing) return existing
        return prisma.subject.create({
          data: { institutionId, name, curriculumAreaId, competencyAreaId },
        })
      }

      if (profile === 'subject-first' && req.body.subjectAreaId && req.body.groups?.length) {
        // One subject (del catálogo oficial), multiple parallels
        const subject = await getOrCreateSubjectForArea(req.body.subjectAreaId)
        subjectIds.push(subject.id)

        for (const g of req.body.groups) {
          const parallel = await prisma.parallel.create({
            // level siempre existe aquí: solo es null en la rama 'multigrade' (que
            // usa su propio Level por grado más abajo, nunca este bloque).
            data: { institutionId, name: g.name, levelId: level!.id, academicYearId: year.id },
          })
          parallelIds.push(parallel.id)

          const assignment = await prisma.courseAssignment.create({
            data: { institutionId, subjectId: subject.id, parallelId: parallel.id, teacherId, academicYearId: year.id },
          })
          assignmentIds.push(assignment.id)
        }
      } else if (profile === 'classroom-first' && req.body.parallelName && req.body.subjectAreaIds?.length) {
        // One parallel, multiple subjects (cada una del catálogo oficial)
        const parallel = await prisma.parallel.create({
          data: { institutionId, name: req.body.parallelName, levelId: level!.id, academicYearId: year.id },
        })
        parallelIds.push(parallel.id)

        for (const areaId of req.body.subjectAreaIds) {
          const subject = await getOrCreateSubjectForArea(areaId)
          subjectIds.push(subject.id)

          const assignment = await prisma.courseAssignment.create({
            data: { institutionId, subjectId: subject.id, parallelId: parallel.id, teacherId, academicYearId: year.id },
          })
          assignmentIds.push(assignment.id)
        }
      } else if (profile === 'multigrade') {
        // Unidocente/pluridocente: N selecciones explícitas grado+materia, ya
        // validadas all-or-nothing arriba (resolvedMultigradeSelections). Deja
        // TODO listo de una sola pasada — Level por grado (ya existe desde
        // bootstrapInstitution vía DEFAULT_LEVELS, se reusa; nunca se duplica),
        // UN Parallel por grado (aunque tenga varias materias), y UN
        // CourseAssignment por combinación grado×materia — el profesor nunca
        // pasa por Configuración > Niveles ni por Configuración > Calificación.
        const group = await prisma.multigradeGroup.create({
          data: {
            institutionId,
            teacherId,
            academicYearId: year.id,
            name: req.body.multigradeName?.trim() || 'Aula multigrado',
            allowSuperiorExtension: req.body.allowSuperiorExtension === true,
            createdBy: teacherId,
          },
        })
        multigradeGroupId = group.id

        const parallelIdByGrade = new Map<string, string>()

        for (const selection of resolvedMultigradeSelections) {
          let gradeLevel = await prisma.level.findFirst({ where: { institutionId, code: selection.gradeCode } })
          if (!gradeLevel) {
            gradeLevel = await prisma.level.create({
              data: {
                institutionId,
                code: selection.gradeCode,
                name: MULTIGRADE_GRADE_NAME[selection.gradeCode] ?? selection.gradeCode,
                sortOrder: MULTIGRADE_GRADE_SORT_ORDER[selection.gradeCode] ?? 50,
                subnivel: selection.subnivel,
              },
            })
          } else if (gradeLevel.subnivel !== selection.subnivel) {
            gradeLevel = await prisma.level.update({ where: { id: gradeLevel.id }, data: { subnivel: selection.subnivel } })
          }

          let parallelId = parallelIdByGrade.get(selection.gradeCode)
          if (!parallelId) {
            const parallelName = MULTIGRADE_GRADE_NAME[selection.gradeCode] ?? selection.gradeCode
            const existingParallel = await prisma.parallel.findFirst({
              where: { levelId: gradeLevel.id, academicYearId: year.id, name: parallelName },
            })
            const parallel =
              existingParallel ??
              (await prisma.parallel.create({
                data: { institutionId, name: parallelName, levelId: gradeLevel.id, academicYearId: year.id },
              }))
            parallelId = parallel.id
            parallelIdByGrade.set(selection.gradeCode, parallelId)
            parallelIds.push(parallelId)
          }

          const subject = await getOrCreateSubjectForArea(selection.subjectAreaId)
          subjectIds.push(subject.id)

          const existingAssignment = await prisma.courseAssignment.findFirst({
            where: { subjectId: subject.id, parallelId, academicYearId: year.id },
          })
          const assignment =
            existingAssignment ??
            (await prisma.courseAssignment.create({
              data: { institutionId, subjectId: subject.id, parallelId, teacherId, academicYearId: year.id },
            }))
          assignmentIds.push(assignment.id)

          await prisma.multigradeGroupMember.upsert({
            where: { courseAssignmentId: assignment.id },
            create: {
              groupId: group.id,
              gradeCode: selection.gradeCode,
              courseAssignmentId: assignment.id,
              parallelId,
              subjectId: subject.id,
            },
            update: { groupId: group.id },
          })
        }
      }

      // Mark setup complete (preserve existing settings like branding) y fija el
      // modelo de planificación elegido en el wizard — así el profesor nunca
      // tiene que tocar Configuración > Calificación para elegirlo.
      const currentSettings = (institution?.settings ?? {}) as Record<string, unknown>
      await prisma.institution.update({
        where: { id: institutionId },
        data: {
          settings: {
            ...currentSettings,
            setupComplete: true,
            planningModel: planningModel ?? currentSettings.planningModel ?? 'destrezas',
          } as unknown as Parameters<typeof prisma.institution.update>[0]['data']['settings'],
        },
      })

      return reply.send({ yearId: year.id, parallelIds, subjectIds, assignmentIds, multigradeGroupId })
    },
  )
}
