import { FastifyInstance } from 'fastify'
import { audit } from '../../../shared/infrastructure/services/audit.service'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import { PrismaGuardianRepository } from '../infrastructure/repositories/prisma-guardian.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { assertStudentFichaAccess } from '../../../shared/infrastructure/services/teacher-scope.service'
import { getGuardianChildren } from '../../../shared/infrastructure/services/guardian-scope.service'
import type { CreateGuardianDto, UpdateGuardianLinkDto } from '../application/dtos/guardian.dto'

const repo = new PrismaGuardianRepository()

export default async function guardianRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // GET /guardian/my-students — lista de hijos del representante autenticado
  app.get('/guardian/my-students', async (req, reply) => {
    const children = await getGuardianChildren(req.user.sub)
    return reply.send(children)
  })

  app.get<{ Params: { id: string } }>(
    '/students/:id/guardians',
    { preHandler: [requirePermission('users', 'read')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      return reply.send(await repo.list(req.params.id, req.user.institutionId))
    },
  )

  app.post<{ Params: { id: string }; Body: CreateGuardianDto }>(
    '/students/:id/guardians',
    { preHandler: [requirePermission('users', 'manage')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      return reply.status(201).send(await repo.create(req.params.id, req.user.institutionId, req.body))
    },
  )

  /**
   * Importación masiva de representantes: cada fila vincula un representante
   * (nuevo o existente, identificado por cédula) con un estudiante (por cédula).
   */
  app.post<{
    Body: {
      rows: Array<{
        studentDni: string
        dni: string
        firstName: string
        lastName: string
        email?: string
        phone?: string
        relationship?: string
        isPrimary?: boolean
      }>
    }
  }>(
    '/guardians/bulk',
    {
      preHandler: [requirePermission('users', 'manage')],
      schema: {
        body: {
          type: 'object',
          required: ['rows'],
          properties: {
            rows: {
              type: 'array',
              minItems: 1,
              maxItems: 1000,
              items: {
                type: 'object',
                required: ['studentDni', 'dni', 'firstName', 'lastName'],
                properties: {
                  studentDni: { type: 'string' },
                  dni: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                  relationship: { type: 'string', maxLength: 50 },
                  isPrimary: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      const { institutionId } = req.user
      const results: Array<{ studentDni: string; dni: string; fullName: string; status: 'linked' | 'created' | 'existing' | 'skipped'; reason?: string }> = []
      for (const row of req.body.rows) {
        const studentDni = String(row.studentDni ?? '').replace(/\D/g, '')
        const dni = String(row.dni ?? '').replace(/\D/g, '')
        const fullName = `${row.firstName?.trim() ?? ''} ${row.lastName?.trim() ?? ''}`.trim()
        try {
          const student = await prisma.user.findFirst({
            where: { institutionId, profile: { dni: studentDni }, userRoles: { some: { role: { name: 'student' } } } },
            select: { id: true },
          })
          if (!student) {
            results.push({ studentDni, dni, fullName, status: 'skipped', reason: 'No existe un estudiante con esa cédula' })
            continue
          }
          await assertStudentFichaAccess(req, student.id)
          const existingGuardian = await prisma.user.findFirst({
            where: { institutionId, profile: { dni }, userRoles: { some: { role: { name: 'guardian' } } } },
            select: { id: true },
          })
          if (existingGuardian) {
            const link = await prisma.guardianStudent.findFirst({
              where: { guardianId: existingGuardian.id, studentId: student.id },
              select: { guardianId: true },
            })
            if (link) {
              results.push({ studentDni, dni, fullName, status: 'existing' })
              continue
            }
          }
          await repo.create(student.id, institutionId, {
            ...(existingGuardian
              ? { existingGuardianId: existingGuardian.id }
              : {
                  dni,
                  firstName: row.firstName.trim(),
                  lastName: row.lastName.trim(),
                  email: row.email?.trim().toLowerCase() || dni,
                  phone: row.phone?.trim() || undefined,
                }),
            relationship: row.relationship?.trim() || 'guardian',
            isPrimary: row.isPrimary ?? false,
          })
          results.push({ studentDni, dni, fullName, status: existingGuardian ? 'linked' : 'created' })
        } catch (err) {
          results.push({ studentDni, dni, fullName, status: 'skipped', reason: err instanceof Error ? err.message : 'Error' })
        }
      }
      const count = (s: string) => results.filter((r) => r.status === s).length
      await audit(req, {
        action: 'guardians.bulk_import',
        resourceType: 'guardian',
        newValue: { created: count('created'), linked: count('linked'), total: results.length },
      })
      return reply.status(201).send({
        created: count('created'),
        linked: count('linked'),
        existing: count('existing'),
        skipped: count('skipped'),
        results,
      })
    },
  )

  app.patch<{ Params: { id: string; guardianId: string }; Body: UpdateGuardianLinkDto }>(
    '/students/:id/guardians/:guardianId',
    { preHandler: [requirePermission('users', 'manage')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      return reply.send(
        await repo.updateLink(req.params.id, req.params.guardianId, req.user.institutionId, req.body),
      )
    },
  )

  app.delete<{ Params: { id: string; guardianId: string } }>(
    '/students/:id/guardians/:guardianId',
    { preHandler: [requirePermission('users', 'manage')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      await repo.unlink(req.params.id, req.params.guardianId, req.user.institutionId)
      return reply.status(204).send()
    },
  )
}
