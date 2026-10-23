import { agreementFor } from '../../../shared/infrastructure/services/agreement.service'
import { actorOf } from '../../../shared/infrastructure/services/actor'
import {
  forBulletin,
  listForEntry as listRecommendations,
  saveBulk as saveRecommendations,
} from '../application/services/bulletin-recommendations.service'
import { FastifyInstance } from 'fastify'
import { PrismaReportRepository } from '../infrastructure/prisma-report.repository'
import { PrismaInstitutionRepository } from '../../institution/infrastructure/repositories/prisma-institution.repository'
import { buildBulletinPdf, buildBulletinsPdf, type BulletinPdfData } from '../application/services/bulletin-pdf.service'
import { assertParallelInScope } from '../../../shared/infrastructure/services/teacher-scope.service'
import { STUDENT_ENROLLMENT_ORDER } from '../../../shared/infrastructure/services/enrollment-query'
import { NotFoundError } from '../../../shared/domain/errors/app.errors'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { resolveGuardianStudentId } from '../../../shared/infrastructure/services/guardian-scope.service'
import type {
  GradesReportQuery,
  AttendanceReportQuery,
  EnrollmentReportQuery,
  BulletinOptionsQuery,
  BulletinReportQuery,
} from '../application/dtos/report.dto'

const repo = new PrismaReportRepository()
const institutionRepo = new PrismaInstitutionRepository()
const REPORT_TYPE = 'grade_bulletin_branding'
const ALLOWED_LOGO_MIME = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp']
const MAX_LOGO_BYTES = 500 * 1024

type BulletinBranding = {
  enabled?: boolean
  institutionName?: string
  title?: string
  subtitle?: string
  logoUrl?: string
  directorName?: string
  directorRole?: string
  teacherLabel?: string
  behaviorLabel?: string
  behaviorText?: string
  observationsLabel?: string
}

function mergeBranding(globalBranding: BulletinBranding, ownBranding?: BulletinBranding | null) {
  const enabled = ownBranding?.enabled ?? false
  if (!enabled) return globalBranding

  return {
    ...globalBranding,
    ...Object.fromEntries(
      Object.entries(ownBranding ?? {}).filter(([, value]) => value !== undefined && value !== ''),
    ),
  }
}

async function getBranding(institutionId: string, userId: string) {
  const [institution, globalTemplate, ownTemplate] = await Promise.all([
    prisma.institution.findUnique({
      where: { id: institutionId },
      select: { name: true, settings: true },
    }),
    prisma.reportTemplate.findFirst({
      where: { institutionId, type: REPORT_TYPE, createdBy: null },
    }),
    prisma.reportTemplate.findFirst({
      where: { institutionId, type: REPORT_TYPE, createdBy: userId },
    }),
  ])

  const globalVars = (globalTemplate?.variables ?? {}) as BulletinBranding
  const ownVars = (ownTemplate?.variables ?? null) as BulletinBranding | null

  // Logo por defecto: el del branding de la institución (Personalización),
  // para que al subirlo ahí aparezca en el boletín sin configurar nada aparte.
  const instSettings = (institution?.settings ?? {}) as { branding?: { logoUrl?: string | null } }
  const institutionLogo = instSettings.branding?.logoUrl ?? ''

  const globalBranding: BulletinBranding = {
    institutionName: institution?.name ?? 'Institución educativa',
    title: 'INFORME DE CALIFICACIONES',
    subtitle: '',
    logoUrl: '',
    directorName: '',
    directorRole: 'DIRECTOR/A',
    teacherLabel: 'DOCENTE TUTOR/A',
    behaviorLabel: 'COMPORTAMIENTO',
    behaviorText: ' ',
    observationsLabel: 'OBSERVACIONES',
    ...globalVars,
  }

  const effective = mergeBranding(globalBranding, ownVars)
  // Fallback al logo de la institución si ni el branding global ni el propio lo definen
  if (!effective.logoUrl) effective.logoUrl = institutionLogo

  return {
    global: { ...globalBranding, logoUrl: globalBranding.logoUrl || institutionLogo },
    own: ownVars,
    effective,
  }
}

/** Datos de la libreta en el formato del generador PDF (compartido por libreta individual y por paralelo). */
async function bulletinPdfData(
  user: { institutionId: string; sub: string; roles: string[] },
  query: BulletinReportQuery,
): Promise<BulletinPdfData> {
    const [branding, bulletin, gradingConfig, agreement] = await Promise.all([
      getBranding(user.institutionId, user.sub),
      repo.getStudentBulletin(user.institutionId, query, {
        userId: user.sub,
        roles: user.roles,
      }),
      institutionRepo.getGradingConfig(user.institutionId),
      agreementFor(user.institutionId, query.yearId),
    ])
    const b = branding.effective
    const tutor = bulletin.parallel?.tutor?.profile
    type PG = {
      periodId: string
      regularAvg: number | null
      examenAvg: number | null
      proyectoAvg: number | null
      total: number | null
      code?: string | null
    }
    type Subj = {
      examWeight?: number
      projectWeight?: number | null
      subjectName: string
      isQualitative?: boolean
      periodGrades: PG[]
      supletorio?: number | null
      promFinal?: number | null
      finalAverage: number | null
      finalCode?: string | null
    }
    const mapSubject = (s: Subj) => ({
      examWeight: s.examWeight,
      projectWeight: s.projectWeight,
      subjectName: s.subjectName,
      isQualitative: !!s.isQualitative,
      periodGrades: s.periodGrades.map((g) => ({
        periodId: g.periodId,
        regularAvg: g.regularAvg,
        examenAvg: g.examenAvg,
        proyectoAvg: g.proyectoAvg,
        total: g.total,
        code: g.code ?? null,
      })),
      supletorio: s.supletorio ?? null,
      promFinal: s.promFinal ?? s.finalAverage,
      finalCode: s.finalCode ?? null,
    })
    return {
      institutionName: b.institutionName || bulletin.institution?.name || '',
      title: b.title ?? '',
      logoUrl: b.logoUrl || null,
      directorName: b.directorName ?? '',
      directorRole: b.directorRole ?? '',
      teacherLabel: b.teacherLabel ?? '',
      studentName: `${bulletin.student.profile?.lastName ?? ''} ${bulletin.student.profile?.firstName ?? ''}`.trim(),
      studentDni: bulletin.student.profile?.dni ?? null,
      studentCode: bulletin.student.profile?.dni ?? null,
      parallelName: bulletin.parallel?.name ?? '',
      levelName: bulletin.parallel?.level?.name ?? '',
      tutorName: tutor ? `${tutor.firstName} ${tutor.lastName}` : '',
      yearName: bulletin.academicYear?.name ?? '',
      periods: bulletin.periods.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      subjects: (bulletin.subjects as Subj[]).map(mapSubject),
      qualitativeSubjects: ((bulletin.qualitativeSubjects ?? []) as Subj[]).map(mapSubject),
      overallAverage: bulletin.overallAverage ?? null,
      qualitativeScale: gradingConfig.qualitativeScale,
      qualitativeValueScale: bulletin.qualitativeValueScale ?? [],
      attendanceByPeriod: (bulletin.attendanceByPeriod ?? []).map((a: {
        periodId: string; justifiedAbsences: number; unjustifiedAbsences: number; attendedDays: number; lateCount: number
      }) => ({
        periodId: a.periodId,
        justifiedAbsences: a.justifiedAbsences,
        unjustifiedAbsences: a.unjustifiedAbsences,
        attendedDays: a.attendedDays,
        lateCount: a.lateCount,
      })),
      behaviorByPeriod: (bulletin.behaviorByPeriod ?? []).map((bp: {
        periodId: string; code: string | null; notes: string | null
      }) => ({
        periodId: bp.periodId,
        code: bp.code,
        notes: bp.notes,
      })),
      decimals: agreement?.decimals ?? null,
      recommendations: await forBulletin(user.institutionId, query.studentId, bulletin.periods.map((p: { id: string }) => p.id)),
    }
}

export default async function reportRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // ─── Recomendaciones del informe de aprendizajes (art. 39) ─────────────────
  app.get<{ Querystring: { parallelId: string; periodId: string; scopeKey: string } }>(
    '/bulletin-recommendations',
    { preHandler: [requirePermission('grades', 'read')] },
    async (req, reply) => reply.send(await listRecommendations(req.user.institutionId, actorOf(req.user), req.query)),
  )
  app.put<{ Body: { parallelId: string; periodId: string; scopeKey: string; items: Array<{ studentId: string; text: string }> } }>(
    '/bulletin-recommendations',
    { preHandler: [requirePermission('grades', 'write')] },
    async (req, reply) => reply.send(await saveRecommendations(req.user.institutionId, actorOf(req.user), req.body)),
  )

  app.get<{ Querystring: GradesReportQuery }>(
    '/reports/grades',
    async (req, reply) => {
      const result = await repo.getGradesReport(req.user.institutionId, req.query, {
        userId: req.user.sub,
        roles: req.user.roles,
      })
      return reply.send(result)
    },
  )

  app.get<{ Querystring: AttendanceReportQuery }>(
    '/reports/attendance',
    async (req, reply) => {
      const result = await repo.getAttendanceReport(req.user.institutionId, req.query)
      return reply.send(result)
    },
  )

  // GET /reports/my-grades?periodId=X&studentId=  — student/guardian
  app.get<{ Querystring: { periodId: string; studentId?: string } }>('/reports/my-grades', async (req, reply) => {
    const { sub: userId, institutionId, roles } = req.user
    let studentId = userId
    if (roles.includes('guardian')) {
      studentId = await resolveGuardianStudentId(userId, req.query.studentId)
    }
    const result = await repo.getMyGrades(institutionId, studentId, req.query.periodId)
    return reply.send(result)
  })

  app.get<{ Querystring: EnrollmentReportQuery }>(
    '/reports/enrollment',
    async (req, reply) => {
      const result = await repo.getEnrollmentReport(req.user.institutionId, req.query)
      return reply.send(result)
    },
  )

  app.get<{ Querystring: BulletinOptionsQuery }>(
    '/reports/bulletin-options',
    async (req, reply) => {
      const result = await repo.getBulletinOptions(req.user.institutionId, req.query, {
        userId: req.user.sub,
        roles: req.user.roles,
      })
      return reply.send(result)
    },
  )

  app.get<{ Querystring: BulletinReportQuery }>(
    '/reports/bulletin',
    async (req, reply) => {
      const [branding, bulletin, gradingConfig] = await Promise.all([
        getBranding(req.user.institutionId, req.user.sub),
        repo.getStudentBulletin(req.user.institutionId, req.query, {
          userId: req.user.sub,
          roles: req.user.roles,
        }),
        institutionRepo.getGradingConfig(req.user.institutionId),
      ])
      const [agreement, recommendations] = await Promise.all([
        agreementFor(req.user.institutionId, req.query.yearId),
        forBulletin(req.user.institutionId, req.query.studentId, bulletin.periods.map((p: { id: string }) => p.id)),
      ])
      return reply.send({
        ...bulletin,
        branding: branding.effective,
        gradingConfig,
        decimals: agreement?.decimals ?? null,
        recommendations,
      })
    },
  )

  app.get<{ Querystring: BulletinReportQuery }>(
    '/reports/bulletin/pdf',
    async (req, reply) => {
      const data = await bulletinPdfData(req.user, req.query)
      const pdf = await buildBulletinPdf(data)
      const studentSlug = (data.studentName || 'boletin').replace(/\s+/g, '_')
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="boletin-${studentSlug}.pdf"`)
        .send(pdf)
    },
  )

  // Todas las libretas de un paralelo en un solo PDF (una por página).
  app.get<{ Querystring: { yearId: string; parallelId: string } }>(
    '/reports/bulletin/parallel/pdf',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['yearId', 'parallelId'],
          properties: { yearId: { type: 'string' }, parallelId: { type: 'string' } },
        },
      },
    },
    async (req, reply) => {
      await assertParallelInScope(req, req.query.parallelId)
      const enrollments = await prisma.studentEnrollment.findMany({
        where: {
          institutionId: req.user.institutionId,
          parallelId: req.query.parallelId,
          academicYearId: req.query.yearId,
          status: 'active',
        },
        orderBy: STUDENT_ENROLLMENT_ORDER,
        select: { studentId: true, parallel: { select: { name: true, level: { select: { name: true } } } } },
      })
      if (enrollments.length === 0) throw new NotFoundError('El paralelo no tiene estudiantes activos')
      const list: BulletinPdfData[] = []
      for (const e of enrollments) {
        list.push(await bulletinPdfData(req.user, { yearId: req.query.yearId, parallelId: req.query.parallelId, studentId: e.studentId }))
      }
      const pdf = await buildBulletinsPdf(list)
      const slug = `${enrollments[0].parallel.level.name}_${enrollments[0].parallel.name}`.replace(/\s+/g, '_')
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="libretas-${slug}.pdf"`)
        .send(pdf)
    },
  )

  app.get('/reports/bulletin-branding', async (req, reply) => {
    const branding = await getBranding(req.user.institutionId, req.user.sub)
    return reply.send(branding)
  })

  app.put<{ Body: BulletinBranding }>(
    '/reports/bulletin-branding/global',
    { preHandler: [requirePermission('academic_config', 'manage')] },
    async (req, reply) => {
      const existing = await prisma.reportTemplate.findFirst({
        where: { institutionId: req.user.institutionId, type: REPORT_TYPE, createdBy: null },
      })

      const saved = existing
        ? await prisma.reportTemplate.update({
            where: { id: existing.id },
            data: { variables: req.body, templateBody: 'grade-bulletin-v1', isDefault: true },
          })
        : await prisma.reportTemplate.create({
            data: {
              institutionId: req.user.institutionId,
              name: 'Boletín global',
              type: REPORT_TYPE,
              templateBody: 'grade-bulletin-v1',
              variables: req.body,
              isDefault: true,
            },
          })

      return reply.send(saved)
    },
  )

  app.put<{ Body: BulletinBranding }>(
    '/reports/bulletin-branding/own',
    async (req, reply) => {
      const existing = await prisma.reportTemplate.findFirst({
        where: { institutionId: req.user.institutionId, type: REPORT_TYPE, createdBy: req.user.sub },
      })

      const saved = existing
        ? await prisma.reportTemplate.update({
            where: { id: existing.id },
            data: { variables: req.body, templateBody: 'grade-bulletin-v1' },
          })
        : await prisma.reportTemplate.create({
            data: {
              institutionId: req.user.institutionId,
              name: 'Boletín docente',
              type: REPORT_TYPE,
              templateBody: 'grade-bulletin-v1',
              variables: req.body,
              createdBy: req.user.sub,
            },
          })

      return reply.send(saved)
    },
  )

  app.post<{ Params: { scope: string } }>(
    '/reports/bulletin-branding/:scope/logo',
    async (req, reply) => {
      const scope = req.params.scope === 'global' ? 'global' : 'own'
      const canEditGlobal = req.user.roles.includes('admin') || req.user.roles.includes('rector') || req.user.permissions.some((p) => p.startsWith('academic_config:manage'))
      if (scope === 'global' && !canEditGlobal) return reply.status(403).send({ message: 'Sin permiso para editar la configuración global' })

      const data = await req.file()
      if (!data) return reply.status(400).send({ message: 'No se recibió ningún archivo' })
      if (!ALLOWED_LOGO_MIME.includes(data.mimetype)) {
        return reply.status(400).send({ message: 'Formato no permitido (usa PNG, JPG, SVG o WebP)' })
      }

      // Guardamos el logo como data URI (persistente y embebible en el PDF del
      // boletín), igual que el logo de la institución. Evita el disco efímero.
      const buf = await data.toBuffer()
      if (buf.length > MAX_LOGO_BYTES) {
        return reply.status(400).send({ message: 'El logo no debe superar 500 KB' })
      }
      return reply.status(201).send({
        url: `data:${data.mimetype};base64,${buf.toString('base64')}`,
      })
    },
  )
}
