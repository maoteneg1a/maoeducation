import { z } from 'zod'

export const RECEIVER_ROLES = ['dece', 'rector', 'inspector']
export const CASE_STATES = ['received', 'protection', 'follow_up', 'internal_closed'] as const
export const settingsSchema = z.object({
  enabled: z.boolean(),
  visibleRoles: z.array(z.string().trim().min(1).max(100)).max(100),
  reporterRoles: z.array(z.string().trim().min(1).max(100)).max(100),
  primaryReceiverId: z.string().uuid().nullable(),
  alternateReceiverId: z.string().uuid().nullable(),
  alternativeContact: z.string().trim().max(1000),
})
export type DeceSettings = z.infer<typeof settingsSchema>
export const DEFAULT_SETTINGS: DeceSettings = {
  enabled: false,
  visibleRoles: ['student', 'guardian', 'teacher', 'inspector', 'dece', 'rector'],
  reporterRoles: ['student', 'guardian', 'teacher', 'inspector', 'dece', 'rector'],
  primaryReceiverId: null,
  alternateReceiverId: null,
  alternativeContact: '',
}
export function resolveSettings(settings: unknown): DeceSettings {
  const raw = (settings as { deceRoutes?: unknown } | null)?.deceRoutes
  const parsed = settingsSchema.safeParse(raw)
  return parsed.success ? parsed.data : structuredClone(DEFAULT_SETTINGS)
}
export function platformAllows(settings: unknown) {
  const modules = (settings as { modules?: unknown } | null)?.modules
  return !Array.isArray(modules) || modules.includes('dece_routes')
}
export interface DeceActor {
  id: string
  institutionId: string
  roles: string[]
  canConfigure: boolean
}
export const roleMatches = (roles: string[], allowed: string[]) =>
  roles.some((role) => allowed.includes(role))
export const isEligibleReceiver = (roles: string[]) =>
  roleMatches(roles, RECEIVER_ROLES) && !roles.includes('student') && !roles.includes('guardian')
export const canReport = (
  actor: DeceActor,
  settings: DeceSettings,
  platformEnabled: boolean,
) =>
  settings.enabled &&
  platformEnabled &&
  roleMatches(actor.roles, settings.visibleRoles) &&
  roleMatches(actor.roles, settings.reporterRoles)
export function safeReceivers(
  settings: DeceSettings,
  excluded: string[],
  activeEligibleIds: string[],
) {
  const allowed = new Set(activeEligibleIds)
  // Recepción inicial única. El suplente interviene si el titular está excluido o inactivo.
  return [settings.primaryReceiverId, settings.alternateReceiverId]
    .filter((id): id is string => !!id && allowed.has(id) && !excluded.includes(id))
    .slice(0, 1)
}
export const reportSchema = z.object({
  requestId: z.string().uuid(),
  concern: z.enum(['violence', 'wellbeing', 'missing', 'accident', 'other']),
  immediateDanger: z.enum(['yes', 'no', 'unknown']),
  affectedPerson: z.string().trim().min(1).max(250),
  narrative: z.string().trim().min(10).max(8000),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00Z`)
      return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    })
    .optional(),
  location: z.string().trim().max(250).default(''),
  safeContact: z.string().trim().max(500).default(''),
  excludedUserIds: z.array(z.string().uuid()).max(100).default([]),
  privacyAcknowledged: z.literal(true),
})
export const actionSchema = z.object({
  type: z.enum(['note', 'protection', 'referral', 'follow_up']),
  description: z.string().trim().min(1).max(8000),
})
export const statusSchema = z.object({
  status: z.enum(CASE_STATES),
  reason: z.string().trim().min(5).max(4000),
})
export const accessSchema = z.object({
  userId: z.string().uuid(),
  access: z.enum(['manager', 'viewer']),
  reason: z.string().trim().min(5).max(1000),
})
export const exclusionSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(5).max(1000),
})
