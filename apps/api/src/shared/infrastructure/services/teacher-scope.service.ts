import type { FastifyRequest } from 'fastify'
import { prisma } from '../database/prisma'
import { resolveGuardianStudentId } from './guardian-scope.service'
import { ForbiddenError, NotFoundError } from '../../domain/errors/app.errors'

/** Roles que ven la información de cualquier estudiante de la institución. */
const PRIVILEGED_ROLES = ['admin', 'rector', 'dece', 'inspector']

export function isPrivilegedStaff(roles: string[]): boolean {
  return roles.some((r) => PRIVILEGED_ROLES.includes(r))
}

/**
 * Paralelos que "pertenecen" a un docente: donde dicta alguna materia
 * (course_assignments) o donde es tutor del paralelo.
 */
export async function getTeacherParallelIds(
  institutionId: string,
  teacherId: string,
): Promise<string[]> {
  const [assignments, tutored] = await Promise.all([
    prisma.courseAssignment.findMany({
      where: { institutionId, teacherId },
      select: { parallelId: true },
    }),
    prisma.parallel.findMany({
      where: { institutionId, tutorId: teacherId },
      select: { id: true },
    }),
  ])
  const ids = new Set<string>()
  for (const a of assignments) ids.add(a.parallelId)
  for (const p of tutored) ids.add(p.id)
  return [...ids]
}

/** ¿El estudiante está matriculado en alguno de los paralelos del docente? */
export async function studentInTeacherScope(
  institutionId: string,
  teacherId: string,
  studentId: string,
): Promise<boolean> {
  const parallelIds = await getTeacherParallelIds(institutionId, teacherId)
  if (parallelIds.length === 0) return false
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { institutionId, studentId, parallelId: { in: parallelIds } },
    select: { id: true },
  })
  return !!enrollment
}

/**
 * Garantiza que el actor puede gestionar matrículas en el paralelo:
 * - staff privilegiado: siempre.
 * - docente: solo en sus paralelos (dicta o es tutor).
 */
export async function assertParallelInScope(
  req: FastifyRequest,
  parallelId: string,
): Promise<void> {
  const { sub, institutionId, roles } = req.user
  if (isPrivilegedStaff(roles)) return
  if (roles.includes('teacher')) {
    const ids = await getTeacherParallelIds(institutionId, sub)
    if (ids.includes(parallelId)) return
  }
  throw new ForbiddenError()
}

/**
 * Garantiza que el actor puede ver/editar la ficha del estudiante:
 * - staff privilegiado (admin/rector/dece/inspector): siempre.
 * - docente: solo estudiantes de sus paralelos (dicta o es tutor).
 * - cualquier otro: prohibido.
 */
export async function assertStudentFichaAccess(
  req: FastifyRequest,
  studentId: string,
): Promise<void> {
  const { sub, institutionId, roles } = req.user
  if (isPrivilegedStaff(roles)) return
  if (roles.includes('teacher')) {
    const ok = await studentInTeacherScope(institutionId, sub, studentId)
    if (ok) return
  }
  throw new ForbiddenError()
}

/**
 * Garantiza que el actor puede operar sobre una asignación (docente × materia × paralelo):
 * - staff privilegiado: siempre (si pertenece a la institución).
 * - docente: escritura solo en sus propias asignaciones; lectura también si es tutor del paralelo.
 * - cualquier otro rol: prohibido.
 * Es la aplicación del scope `own` para notas, actividades y asistencia por materia.
 */
export async function assertCourseAssignmentAccess(
  req: FastifyRequest,
  courseAssignmentId: string,
  mode: 'read' | 'write',
): Promise<{ parallelId: string; academicYearId: string; teacherId: string }> {
  const { sub, institutionId, roles } = req.user
  const ca = await prisma.courseAssignment.findFirst({
    where: { id: courseAssignmentId, institutionId },
    select: { parallelId: true, academicYearId: true, teacherId: true, parallel: { select: { tutorId: true } } },
  })
  if (!ca) throw new NotFoundError('Asignación de curso no encontrada')
  const result = { parallelId: ca.parallelId, academicYearId: ca.academicYearId, teacherId: ca.teacherId }
  if (isPrivilegedStaff(roles)) return result
  if (ca.teacherId === sub) return result
  if (mode === 'read' && ca.parallel.tutorId === sub) return result
  throw new ForbiddenError('No tienes acceso a esta asignatura')
}

/**
 * Resuelve qué estudiante puede consultar el actor:
 * - estudiante: solo a sí mismo.
 * - representante: a sus representados.
 * - personal: según assertStudentFichaAccess (privilegiado o docente del paralelo).
 */
export async function resolveViewableStudentId(req: FastifyRequest, studentId: string): Promise<string> {
  const { roles, sub } = req.user
  if (roles.includes('student') && studentId === sub) return sub
  if (roles.includes('guardian') && !isPrivilegedStaff(roles) && !roles.includes('teacher')) {
    return resolveGuardianStudentId(sub, studentId)
  }
  await assertStudentFichaAccess(req, studentId)
  return studentId
}
