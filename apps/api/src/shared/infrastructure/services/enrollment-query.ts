import type { Prisma } from '@prisma/client'

/**
 * Orden alfabético estándar para listas de estudiantes (apellido, nombre).
 * Usar junto con `status: 'active'` para no mostrar retirados en listas de trabajo.
 */
export const STUDENT_ENROLLMENT_ORDER: Prisma.StudentEnrollmentOrderByWithRelationInput[] = [
  { student: { profile: { lastName: 'asc' } } },
  { student: { profile: { firstName: 'asc' } } },
]
