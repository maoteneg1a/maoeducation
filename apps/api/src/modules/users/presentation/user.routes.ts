import { FastifyInstance } from 'fastify'
import { assertPlanCapacity } from '../../../shared/infrastructure/services/plan-limits.service'
import { audit } from '../../../shared/infrastructure/services/audit.service'
import { PrismaUserRepository } from '../infrastructure/repositories/prisma-user.repository'
import { authMiddleware } from '../../../shared/infrastructure/middleware/auth.middleware'
import { requirePermission } from '../../../shared/infrastructure/middleware/rbac.middleware'
import { assertStudentFichaAccess } from '../../../shared/infrastructure/services/teacher-scope.service'
import { prisma } from '../../../shared/infrastructure/database/prisma'
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from '../application/dtos/user.dto'

const repo = new PrismaUserRepository()

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get<{ Querystring: ListUsersQueryDto }>(
    '/users',
    {
      preHandler: [requirePermission('users', 'read', 'all')],
      schema: {
        querystring: {
          type: 'object',
          properties: {
            page:   { type: 'integer', minimum: 1 },
            limit:  { type: 'integer', minimum: 1, maximum: 200 },
            search: { type: 'string' },
            role:   { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      const result = await repo.list(req.user.institutionId, req.query)
      return reply.send(result)
    },
  )

  app.get<{ Params: { id: string } }>(
    '/users/:id',
    { preHandler: [requirePermission('users', 'read')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      const user = await repo.findById(req.params.id, req.user.institutionId)
      return reply.send(user)
    },
  )

  app.post<{ Body: CreateUserDto }>(
    '/users',
    {
      preHandler: [requirePermission('users', 'manage', 'all')],
      schema: {
        body: {
          type: 'object',
          // password es opcional: si no se envía, la contraseña por defecto
          // será la cédula. dni es obligatorio (10 dígitos, único).
          required: ['email', 'firstName', 'lastName', 'roleNames', 'dni'],
          properties: {
            email:     { type: 'string', format: 'email' },
            password:  { type: 'string', minLength: 6 },
            firstName: { type: 'string', minLength: 1 },
            lastName:  { type: 'string', minLength: 1 },
            roleNames: { type: 'array', items: { type: 'string' }, minItems: 1 },
            dni:       { type: 'string' },
            phone:     { type: 'string' },
            birthDate: { type: 'string' },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.body.roleNames?.includes('teacher')) await assertPlanCapacity(req.user.institutionId, 'teachers', 1)
      const user = await repo.create(req.user.institutionId, req.body)
      return reply.status(201).send(user)
    },
  )

  /**
   * Importación masiva de personal (docentes, inspección, DECE) desde Excel/CSV.
   * Mismas reglas que el alta individual (cédula única, contraseña por defecto =
   * cédula). Procesa fila por fila y devuelve el resultado de cada una.
   */
  app.post<{
    Body: { roleName: string; users: Array<{ dni: string; firstName: string; lastName: string; email?: string; phone?: string }> }
  }>(
    '/users/bulk',
    {
      preHandler: [requirePermission('users', 'manage', 'all')],
      schema: {
        body: {
          type: 'object',
          required: ['roleName', 'users'],
          properties: {
            roleName: { type: 'string', enum: ['teacher', 'inspector', 'dece'] },
            users: {
              type: 'array',
              minItems: 1,
              maxItems: 300,
              items: {
                type: 'object',
                required: ['dni', 'firstName', 'lastName'],
                properties: {
                  dni: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  email: { type: 'string' },
                  phone: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.body.roleName === 'teacher') await assertPlanCapacity(req.user.institutionId, 'teachers', req.body.users.length)
      const results: Array<{ dni: string; fullName: string; status: 'created' | 'skipped'; reason?: string }> = []
      const seen = new Set<string>()
      for (const row of req.body.users) {
        const dni = String(row.dni ?? '').replace(/\D/g, '')
        const firstName = row.firstName?.trim() ?? ''
        const lastName = row.lastName?.trim() ?? ''
        const fullName = `${firstName} ${lastName}`.trim()
        const email = row.email?.trim().toLowerCase() || dni
        if (seen.has(dni)) {
          results.push({ dni, fullName, status: 'skipped', reason: 'Cédula repetida en el archivo' })
          continue
        }
        seen.add(dni)
        if (row.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
          results.push({ dni, fullName, status: 'skipped', reason: 'Correo inválido' })
          continue
        }
        try {
          await repo.create(req.user.institutionId, {
            dni,
            firstName,
            lastName,
            email,
            phone: row.phone?.trim() || undefined,
            roleNames: [req.body.roleName],
          })
          results.push({ dni, fullName, status: 'created' })
        } catch (err) {
          results.push({ dni, fullName, status: 'skipped', reason: err instanceof Error ? err.message : 'Error al crear' })
        }
      }
      await audit(req, {
        action: 'users.bulk_import',
        resourceType: 'user',
        newValue: { roleName: req.body.roleName, created: results.filter((r) => r.status === 'created').length, total: results.length },
      })
      return reply.status(201).send({
        created: results.filter((r) => r.status === 'created').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        results,
      })
    },
  )

  app.put<{ Params: { id: string }; Body: UpdateUserDto }>(
    '/users/:id',
    { preHandler: [requirePermission('users', 'write')] },
    async (req, reply) => {
      await assertStudentFichaAccess(req, req.params.id)
      const user = await repo.update(req.params.id, req.user.institutionId, req.body)
      const { password, ...changes } = req.body as UpdateUserDto & { password?: string }
      await audit(req, {
        action: 'user.update',
        resourceType: 'user',
        resourceId: req.params.id,
        newValue: { ...changes, ...(password ? { password: '[cambiada]' } : {}) } as Record<string, string | number | boolean | null>,
      })
      return reply.send(user)
    },
  )

  app.patch<{ Params: { id: string } }>(
    '/users/:id/deactivate',
    { preHandler: [requirePermission('users', 'manage', 'all')] },
    async (req, reply) => {
      await repo.deactivate(req.params.id, req.user.institutionId)
      await audit(req, { action: 'user.deactivate', resourceType: 'user', resourceId: req.params.id })
      return reply.status(204).send()
    },
  )

  // ─── Roles & Permissions ────────────────────────────────────────────────────

  app.get(
    '/roles',
    { preHandler: [requirePermission('users', 'manage', 'all')] },
    async (req, reply) => {
      const roles = await prisma.role.findMany({
        where: { institutionId: req.user.institutionId },
        include: {
          rolePermissions: { include: { permission: true } },
        },
        orderBy: { name: 'asc' },
      })
      return reply.send(roles.map((r) => ({
        id: r.id,
        name: r.name,
        label: r.label,
        isSystem: r.isSystem,
        permissions: r.rolePermissions.map((rp) => ({
          id: rp.permission.id,
          key: `${rp.permission.resource}:${rp.permission.action}:${rp.permission.scope}`,
          resource: rp.permission.resource,
          action: rp.permission.action,
          scope: rp.permission.scope,
          description: rp.permission.description,
        })),
      })))
    },
  )

  app.get(
    '/permissions',
    { preHandler: [requirePermission('users', 'manage', 'all')] },
    async (_req, reply) => {
      const perms = await prisma.permission.findMany({ orderBy: [{ resource: 'asc' }, { action: 'asc' }] })
      return reply.send(perms.map((p) => ({
        id: p.id,
        key: `${p.resource}:${p.action}:${p.scope}`,
        resource: p.resource,
        action: p.action,
        scope: p.scope,
        description: p.description,
      })))
    },
  )

  app.put<{ Params: { id: string }; Body: { permissionIds: string[] } }>(
    '/roles/:id/permissions',
    { preHandler: [requirePermission('users', 'manage', 'all')] },
    async (req, reply) => {
      const role = await prisma.role.findFirst({
        where: { id: req.params.id, institutionId: req.user.institutionId },
      })
      if (!role) return reply.status(404).send({ message: 'Rol no encontrado' })
      if (role.name === 'admin') return reply.status(403).send({ message: 'No se pueden modificar los permisos del administrador' })
      const before = await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } })

      await prisma.$transaction([
        prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
        prisma.rolePermission.createMany({
          data: req.body.permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
          skipDuplicates: true,
        }),
      ])

      await audit(req, {
        action: 'role.update_permissions',
        resourceType: 'role',
        resourceId: role.id,
        oldValue: { role: role.name, permissionIds: before.map((b) => b.permissionId) },
        newValue: { role: role.name, permissionIds: req.body.permissionIds },
      })

      const updated = await prisma.role.findUnique({
        where: { id: role.id },
        include: { rolePermissions: { include: { permission: true } } },
      })
      return reply.send({
        id: updated!.id,
        name: updated!.name,
        label: updated!.label,
        permissions: updated!.rolePermissions.map((rp) => ({
          id: rp.permission.id,
          key: `${rp.permission.resource}:${rp.permission.action}:${rp.permission.scope}`,
          resource: rp.permission.resource,
          action: rp.permission.action,
          scope: rp.permission.scope,
        })),
      })
    },
  )
}
