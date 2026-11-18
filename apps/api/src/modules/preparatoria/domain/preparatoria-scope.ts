import type { Prisma } from '@prisma/client'
import { AMBITS } from './preparatoria-policy'

/** Acceso exclusivo a Primero activado, por tutoría o asignación directa de ámbitos. */
export function preparatoryTeacherScope(teacherId: string): Prisma.ParallelWhereInput {
  return {
    level: { code: '1B' },
    preparatoryProgram: { is: { enabled: true } },
    OR: [
      { tutorId: teacherId },
      ...AMBITS.map(ambit => ({ preparatoryProgram: { is: { ambitTeachers: { path: [ambit.id], equals: teacherId } } } })),
    ],
  }
}
