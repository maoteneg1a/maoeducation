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
 * Envía una notificación a todos los representantes de un estudiante.
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
  if (links.length === 0) return

  const studentName = profile ? `${profile.firstName} ${profile.lastName}` : null
  const personalizedPayload = studentName
    ? { ...payload, body: payload.body.replace('Tu representado', studentName).replace('tu representado', studentName) }
    : payload

  await Promise.allSettled(links.map((l) => sendPushToUser(l.guardianId, personalizedPayload)))
}

/** Envía una notificación a los representantes de los estudiantes de un curso. */
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
    },
    select: {
      student: {
        select: {
          studentGuardians: { select: { guardianId: true } },
        },
      },
    },
  })

  const guardianIds = [
    ...new Set(
      enrollments.flatMap((enrollment) =>
        enrollment.student.studentGuardians.map((link) => link.guardianId),
      ),
    ),
  ]

  await Promise.allSettled(guardianIds.map((guardianId) => sendPushToUser(guardianId, payload)))
}
