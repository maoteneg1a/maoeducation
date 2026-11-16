import crypto from 'node:crypto'
import type { MeetingDetails } from './meeting-details'

/** Solo cuentas del personal activo que figuren en la convocatoria; nunca alumnado/familias por paralelo. */
export function resolveConvocationRecipients(participants: MeetingDetails['participants'], staff: Array<{ id: string; name: string }>) {
  const normalized = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('es')
  const recipients = new Map<string, { id: string; name: string }>()
  const unlinked: string[] = []
  for (const p of participants) {
    const matches = staff.filter((u) => (!p.userId || u.id === p.userId) && normalized(u.name) === normalized(p.name))
    if (matches.length === 1) recipients.set(matches[0].id, matches[0])
    else unlinked.push(p.name)
  }
  return { recipients: [...recipients.values()], unlinked }
}

// El cierre, desarrollo y asistencia real no cambian la convocatoria ya enviada.
export function convocationHash(m: MeetingDetails) {
  const { development: _development, actualEndTime: _actualEndTime, participants, ...fields } = m
  return crypto.createHash('sha256').update(JSON.stringify({ ...fields, participants: participants.map(({ attendance: _attendance, ...p }) => p) })).digest('hex')
}
