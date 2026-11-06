import webpush from 'web-push'
import { env } from '../../../config/env'
import { prisma } from '../database/prisma'

export interface PushPayload {
  title: string
  body: string
  url?: string
}

let initialized = false

function init() {
  if (initialized || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)
  initialized = true
}

/** Envía una notificación push a todos los dispositivos registrados de un usuario. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  // El historial interno es la fuente persistente incluso si el dispositivo no
  // tiene permiso push, está sin conexión o su suscripción ya venció.
  await prisma.userNotification.create({
    data: { userId, title: payload.title, body: payload.body, url: payload.url },
  })
  init()
  if (!initialized) return

  const subs = await prisma.pushSubscription.findMany({ where: { userId } })
  if (subs.length === 0) return

  const dead: string[] = []
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
        )
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 410 || status === 404) dead.push(s.id)
      }
    }),
  )

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } })
  }
}

/**
 * Envía una notificación familiar: al estudiante y a todos sus representantes.
 * Resuelve el nombre del alumno para incluirlo automáticamente en el body.
 */
export async function notifyGuardiansOfStudent(
  studentId: string,
  payload: PushPayload,
): Promise<void> {
  const [links, profile] = await Promise.all([
    prisma.guardianStudent.findMany({ where: { studentId }, select: { guardianId: true } }),
    prisma.profile.findUnique({ where: { userId: studentId }, select: { firstName: true, lastName: true } }),
  ])
  const studentName = profile ? `${profile.firstName} ${profile.lastName}` : null
  const personalizedPayload = studentName
    ? { ...payload, body: payload.body.replace('Tu representado', studentName).replace('tu representado', studentName) }
    : payload

  const recipientIds = new Set([studentId, ...links.map((link) => link.guardianId)])
  await Promise.allSettled([...recipientIds].map((userId) => sendPushToUser(userId, personalizedPayload)))
}

/** Notifica al alumno y a sus representantes sin duplicar destinatarios. */
export async function notifyStudentAndGuardians(
  studentId: string,
  payload: PushPayload,
): Promise<void> {
  const [links, profile] = await Promise.all([
    prisma.guardianStudent.findMany({ where: { studentId }, select: { guardianId: true } }),
    prisma.profile.findUnique({ where: { userId: studentId }, select: { firstName: true, lastName: true } }),
  ])
  const studentName = profile ? `${profile.firstName} ${profile.lastName}` : null
  const personalizedPayload = studentName
    ? { ...payload, body: payload.body.replace('Tu representado', studentName).replace('tu representado', studentName) }
    : payload
  const recipientIds = new Set([studentId, ...links.map((link) => link.guardianId)])
  await Promise.allSettled([...recipientIds].map((userId) => sendPushToUser(userId, personalizedPayload)))
}

/** Envía una notificación a los estudiantes de un curso y a sus representantes. */
export async function notifyGuardiansOfCourseAssignment(
  courseAssignmentId: string,
  payload: PushPayload,
): Promise<void> {
  const assignment = await prisma.courseAssignment.findUnique({
    where: { id: courseAssignmentId },
    select: { institutionId: true, parallelId: true, academicYearId: true },
  })
  if (!assignment) return

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      institutionId: assignment.institutionId,
      parallelId: assignment.parallelId,
      academicYearId: assignment.academicYearId,
      status: 'active', // no notificar a familias de estudiantes retirados
    },
    select: {
      student: {
        select: {
          id: true,
          studentGuardians: { select: { guardianId: true } },
        },
      },
    },
  })

  const recipientIds = [
    ...new Set(
      enrollments.flatMap((enrollment) =>
        [enrollment.student.id, ...enrollment.student.studentGuardians.map((link) => link.guardianId)],
      ),
    ),
  ]

  await Promise.allSettled(recipientIds.map((userId) => sendPushToUser(userId, payload)))
}
