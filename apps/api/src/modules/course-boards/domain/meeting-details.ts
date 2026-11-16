import { z } from 'zod'
import { BadRequestError } from '../../../shared/domain/errors/app.errors'

const date = z.string().refine((s) => !s || (/^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(new Date(`${s}T12:00:00Z`).getTime()) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s), 'Fecha inválida').default('')
const time = z.string().refine((s) => !s || /^([01]\d|2[0-3]):[0-5]\d$/.test(s), 'Hora inválida').default('')
export const meetingDetailsSchema = z.object({
  number: z.string().trim().max(30).default('01'), shift: z.string().trim().max(80).default(''),
  invitationDate: date, meetingDate: date, startTime: time, scheduledEndTime: time, actualEndTime: time,
  location: z.string().trim().max(200).default(''), responsible: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(100).default(''), email: z.union([z.literal(''), z.string().email().max(200)]).default(''),
  background: z.string().trim().max(4000).default(''), agenda: z.string().trim().max(6000).default(''), development: z.string().trim().max(12000).default(''),
  participants: z.array(z.object({ userId: z.string().min(1).optional(), name: z.string().trim().min(1).max(200), role: z.string().trim().min(1).max(200), attendance: z.enum(['pending', 'present', 'absent']).default('pending') })).max(100).default([]),
})
export type MeetingDetails = z.infer<typeof meetingDetailsSchema>
export type MeetingDocumentKind = 'CALL' | 'ATTENDANCE' | 'MINUTES'
export function readMeeting(value: unknown): MeetingDetails {
  const parsed = meetingDetailsSchema.safeParse(value)
  return parsed.success ? parsed.data : meetingDetailsSchema.parse({})
}
export function assertMeetingReady(m: MeetingDetails, kind: MeetingDocumentKind) {
  if (!m.number || !m.shift || !m.meetingDate || !m.startTime || !m.location) throw new BadRequestError('Completa número, jornada, fecha de reunión, lugar y hora de inicio en los datos de la reunión')
  if (kind === 'CALL' && (!m.invitationDate || !m.responsible)) throw new BadRequestError('Completa la fecha de convocatoria y su responsable')
  if (kind === 'MINUTES' && !m.actualEndTime) throw new BadRequestError('Registra la hora real de finalización antes de cerrar la junta')
}
