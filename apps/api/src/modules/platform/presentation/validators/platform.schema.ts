import { z } from 'zod'

export const platformLoginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'La contraseña es requerida'),
})
export type PlatformLoginBody = z.infer<typeof platformLoginSchema>

export const createInstitutionSchema = z.object({
  name: z.string().min(2).max(200),
  code: z.string().min(2).max(50),
  admin: z.object({
    email: z.string().email(),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    password: z.string().min(8).max(100),
  }),
  regime: z.enum(['SIERRA_AMAZONIA', 'COSTA_GALAPAGOS']).optional(),
})
export type CreateInstitutionBody = z.infer<typeof createInstitutionSchema>

export const createInstitutionAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8).max(100),
})
export type CreateInstitutionAdminBody = z.infer<typeof createInstitutionAdminSchema>

export const updateInstitutionAdminSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).max(100).optional(),
})
export type UpdateInstitutionAdminBody = z.infer<typeof updateInstitutionAdminSchema>
