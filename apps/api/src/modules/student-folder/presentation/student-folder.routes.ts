import { FastifyInstance } from 'fastify'
import { PrismaStudentFolderRepository } from '../infrastructure/repositories/prisma-student-folder.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { assertStudentFichaAccess } from '../../../shared/infrastructure/services/teacher-scope.service'
import { buildEnrollmentCertificatePdf } from '../application/services/enrollment-certificate-pdf.service'
import type { ListStudentsQuery } from '../application/dtos/student-folder.dto'

const repo = new PrismaStudentFolderRepository()

function personName(
  p: { profile: { firstName: string; lastName: string } | null } | null,
  fallback = 'estudiante',
): string {
  if (!p?.profile) return fallback
  return `${p.profile.lastName} ${p.profile.firstName}`.trim()
}

export default async function studentFolderRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Estudiantes cuyo expediente puede abrir el actor (paginado + búsqueda + filtro)
  app.get<{ Querystring: ListStudentsQuery }>(
    '/student-folder/students',
    { preHandler: [requirePermission('student_folder', 'read')] },
    async (req, reply) =>
      reply.send(
        await repo.listAccessibleStudents(
          req.user.institutionId,
          { userId: req.user.sub, roles: req.user.roles },
          req.query,
        ),
      ),
  )

  // Expediente consolidado
  app.get<{ Params: { id: string } }>(
    '/student-folder/students/:id',
    { preHandler: [requirePermission('student_folder', 'read')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      return reply.send(await repo.getFolder(req.params.id, req.user.institutionId))
    },
  )

  // Certificado de matrícula (PDF) por año
  app.get<{ Params: { id: string; enrollmentId: string } }>(
    '/student-folder/students/:id/enrollment-certificate/:enrollmentId.pdf',
    { preHandler: [requirePermission('student_folder', 'read')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      const e = await repo.getEnrollmentForCertificate(
        req.params.id,
        req.params.enrollmentId,
        req.user.institutionId,
      )
      const settings = (e.institution.settings ?? {}) as { branding?: { logoUrl?: string | null } }
      const pdf = await buildEnrollmentCertificatePdf({
        institutionName: e.institution.name,
        logoUrl: settings.branding?.logoUrl ?? null,
        studentName: personName(e.student),
        studentDni: e.student.profile?.dni ?? null,
        levelName: e.parallel.level?.name ?? '—',
        parallelName: e.parallel.name,
        yearName: e.academicYear.name,
        enrolledAt: e.enrolledAt,
        status: e.status,
      })
      return reply
        .header('Content-Type', 'application/pdf')
        .header('Content-Disposition', `attachment; filename="certificado-matricula-${e.id}.pdf"`)
        .send(pdf)
    },
  )
}
