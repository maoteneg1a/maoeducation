import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { extractReportsFlow } from '../../../../shared/domain/reports-flow'
import { institutionSettings } from '../../../../shared/infrastructure/services/agreement.service'
import { hasPermission, isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'

export interface DossierContext {
  studentId: string
  academicYearId: string
  courseAssignmentId?: string
}

/** Un expediente anual se abre por matrícula y asignatura, sin consultar alertas tempranas. */
export async function dossierAccess(institutionId: string, actor: Actor, ctx: DossierContext) {
  if (!actor.roles.some((r) => r !== 'guardian' && r !== 'student')) throw new ForbiddenError('El expediente de respaldo es de uso del personal de la institución')
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { institutionId, studentId: ctx.studentId, academicYearId: ctx.academicYearId },
    select: {
      parallelId: true, hasAdaptation: true, adaptationType: true,
      parallel: { select: { name: true, tutorId: true, level: { select: { name: true, subnivel: true } } } },
      academicYear: { select: { name: true, startDate: true, endDate: true } },
      student: { select: { email: true, profile: { select: { firstName: true, lastName: true, dni: true } } } },
    },
  })
  if (!enrollment) throw new NotFoundError('El estudiante no tiene matrícula en ese año lectivo')
  const isTutor = enrollment.parallel.tutorId === actor.userId
  const wide = hasPermission(actor, 'student_folder', 'read', 'all') || hasPermission(actor, 'formal_reports', 'read', 'all')
  const assignments = await prisma.courseAssignment.findMany({
    where: { institutionId, academicYearId: ctx.academicYearId, parallelId: enrollment.parallelId, ...(wide || isTutor ? {} : { teacherId: actor.userId }) },
    select: { id: true, teacherId: true, subject: { select: { name: true } } },
    orderBy: { subject: { name: 'asc' } },
  })
  if (!wide && !isTutor && !assignments.length) throw new ForbiddenError()
  if (ctx.courseAssignmentId && !assignments.some((a) => a.id === ctx.courseAssignmentId)) throw new ForbiddenError('La asignatura no pertenece a este expediente o no tienes acceso')
  const flow = extractReportsFlow(await institutionSettings(institutionId))
  const applies = flow.dossier.enabled && (!flow.dossier.subniveles.length || flow.dossier.subniveles.includes(enrollment.parallel.level.subnivel || ''))
  const canUpload = applies && (isAuthority(actor) || actor.roles.some((r) => !['guardian', 'student'].includes(r) && flow.attachments.uploaderRoles.includes(r)))
  const item = (key: string) => {
    const result = flow.dossier.items.find((i) => i.key === key)
    if (!result) throw new BadRequestError('Documento no configurado en el checklist de respaldo')
    if (result.perSubject && !ctx.courseAssignmentId) throw new BadRequestError('Selecciona la asignatura en seguimiento')
    return result
  }
  return { enrollment, assignments, flow, applies, canUpload, isTutor, item }
}
