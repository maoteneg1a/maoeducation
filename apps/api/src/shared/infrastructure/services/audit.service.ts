import type { FastifyRequest } from 'fastify'
import type { Prisma } from '@prisma/client'
import { prisma } from '../database/prisma'

export interface AuditEntry {
  action: string
  resourceType: string
  resourceId?: string | null
  institutionId?: string | null
  oldValue?: Prisma.InputJsonValue
  newValue?: Prisma.InputJsonValue
}

/**
 * Registra una acción en audit_logs tomando el actor del request:
 * - usuario de institución (req.user) — y si el token es de suplantación, quién suplantaba;
 * - superadmin de plataforma (req.platformAdmin).
 * Nunca rompe la operación principal: si falla el insert solo se loguea.
 */
export async function audit(req: FastifyRequest, entry: AuditEntry): Promise<void> {
  const user = (req as { user?: FastifyRequest['user'] }).user
  const platformAdmin = (req as { platformAdmin?: FastifyRequest['platformAdmin'] }).platformAdmin
  try {
    await prisma.auditLog.create({
      data: {
        institutionId: entry.institutionId ?? user?.institutionId ?? null,
        userId: user?.sub ?? null,
        platformAdminId: platformAdmin?.sub ?? null,
        impersonatorId: user?.impersonatedBy ?? null,
        action: entry.action,
        resourceType: entry.resourceType,
        resourceId: entry.resourceId ?? null,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        ipAddress: req.ip?.slice(0, 45) ?? null,
        userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
      },
    })
  } catch (err) {
    req.log.error({ err, action: entry.action }, 'audit log failed')
  }
}

export { redactSecrets } from './redact'
