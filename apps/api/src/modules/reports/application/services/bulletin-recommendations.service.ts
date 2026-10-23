import { prisma } from '../../../../shared/infrastructure/database/prisma'
import { BadRequestError, ForbiddenError, NotFoundError } from '../../../../shared/domain/errors/app.errors'
import { isAuthority, type Actor } from '../../../../shared/infrastructure/services/actor'

/**
 * Recomendaciones del informe de aprendizajes por parcial (Acuerdo 2026-00082-A, art. 39).
 * scopeKey = "general" (tutor del paralelo) o el id de la asignación (docente de la asignatura).
 */
export const GENERAL_SCOPE = 'general'

async function resolveScope(institutionId: string, actor: Actor, parallelId: string, scopeKey: string) {
  const parallel = await prisma.parallel.findFirst({ where: { id: parallelId, institutionId }, select: { id: true, tutorId: true, academicYearId: true } })
  if (!parallel) throw new NotFoundError('Paralelo no encontrado')
  if (scopeKey === GENERAL_SCOPE) {
    if (!isAuthority(actor) && parallel.tutorId !== actor.userId) throw new ForbiddenError('Solo el tutor registra la recomendación general')
    return { parallel, label: 'General (tutor)' }
  }
  const ca = await prisma.courseAssignment.findFirst({
    where: { id: scopeKey, institutionId, parallelId },
    select: { teacherId: true, subject: { select: { name: true } } },
  })
  if (!ca) throw new BadRequestError('Asignatura inválida para el paralelo')
  if (!isAuthority(actor) && ca.teacherId !== actor.userId) throw new ForbiddenError('Solo el docente de la asignatura registra sus recomendaciones')
  return { parallel, label: ca.subject.name }
}

/** Estudiantes del paralelo con su recomendación para el periodo y alcance. */
export async function listForEntry(institutionId: string, actor: Actor, q: { parallelId: string; periodId: string; scopeKey: string }) {
  const { parallel } = await resolveScope(institutionId, actor, q.parallelId, q.scopeKey)
  const [enrollments, recs] = await Promise.all([
    prisma.studentEnrollment.findMany({
      where: { institutionId, parallelId: parallel.id, academicYearId: parallel.academicYearId, status: 'active' },
      select: { studentId: true, student: { select: { email: true, profile: { select: { firstName: true, lastName: true } } } } },
      orderBy: [{ student: { profile: { lastName: 'asc' } } }, { student: { profile: { firstName: 'asc' } } }],
    }),
    prisma.bulletinRecommendation.findMany({
      where: { institutionId, academicPeriodId: q.periodId, scopeKey: q.scopeKey },
      select: { studentId: true, text: true, updatedAt: true },
    }),
  ])
  const byStudent = new Map(recs.map((r) => [r.studentId, r]))
  return enrollments.map((e) => ({
    studentId: e.studentId,
    name: e.student.profile ? `${e.student.profile.lastName} ${e.student.profile.firstName}` : e.student.email,
    text: byStudent.get(e.studentId)?.text ?? '',
    updatedAt: byStudent.get(e.studentId)?.updatedAt ?? null,
  }))
}

export async function saveBulk(
  institutionId: string,
  actor: Actor,
  dto: { parallelId: string; periodId: string; scopeKey: string; items: Array<{ studentId: string; text: string }> },
) {
  const { parallel } = await resolveScope(institutionId, actor, dto.parallelId, dto.scopeKey)
  const period = await prisma.academicPeriod.findFirst({ where: { id: dto.periodId, academicYearId: parallel.academicYearId }, select: { id: true } })
  if (!period) throw new BadRequestError('Periodo inválido')
  const enrolled = new Set((await prisma.studentEnrollment.findMany({
    where: { institutionId, parallelId: parallel.id, academicYearId: parallel.academicYearId },
    select: { studentId: true },
  })).map((e) => e.studentId))
  const ops = []
  for (const it of dto.items ?? []) {
    if (!enrolled.has(it.studentId)) throw new BadRequestError('Hay estudiantes que no pertenecen al paralelo')
    const text = (it.text ?? '').trim().slice(0, 2000)
    const where = { studentId_academicPeriodId_scopeKey: { studentId: it.studentId, academicPeriodId: period.id, scopeKey: dto.scopeKey } }
    ops.push(text
      ? prisma.bulletinRecommendation.upsert({
          where,
          create: { institutionId, studentId: it.studentId, academicPeriodId: period.id, scopeKey: dto.scopeKey, text, authorId: actor.userId },
          update: { text, authorId: actor.userId },
        })
      : prisma.bulletinRecommendation.deleteMany({ where: { institutionId, studentId: it.studentId, academicPeriodId: period.id, scopeKey: dto.scopeKey } }))
  }
  await prisma.$transaction(ops)
  return listForEntry(institutionId, actor, dto)
}

/** Recomendaciones de un estudiante para los periodos dados (para la boleta). */
export async function forBulletin(institutionId: string, studentId: string, periodIds: string[]) {
  if (!periodIds.length) return []
  const recs = await prisma.bulletinRecommendation.findMany({
    where: { institutionId, studentId, academicPeriodId: { in: periodIds } },
    orderBy: { createdAt: 'asc' },
  })
  const assignmentIds = recs.map((r) => r.scopeKey).filter((k) => k !== GENERAL_SCOPE)
  const subjects = assignmentIds.length
    ? await prisma.courseAssignment.findMany({ where: { id: { in: assignmentIds }, institutionId }, select: { id: true, subject: { select: { name: true } } } })
    : []
  const label = new Map(subjects.map((s) => [s.id, s.subject.name]))
  return recs.map((r) => ({
    periodId: r.academicPeriodId,
    scope: r.scopeKey === GENERAL_SCOPE ? 'General' : label.get(r.scopeKey) ?? 'Asignatura',
    text: r.text,
  }))
}
