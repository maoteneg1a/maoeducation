import { describe, expect, it } from 'vitest'
import { assertMeetingReady, meetingDetailsSchema, readMeeting } from './meeting-details'

describe('one shared meeting form', () => {
  it('keeps legacy meetings editable and never assumes attendance', () => {
    expect(readMeeting({}).participants).toEqual([])
    const m = meetingDetailsSchema.parse({ participants: [{ name: 'Pérez Ana', role: 'Secretaria' }] })
    expect(m.participants[0].attendance).toBe('pending')
  })
  it.each(['2026-02-30', '2026-13-01', 'not a date'])('rejects invalid dates without throwing from the validator: %s', (meetingDate) => {
    expect(meetingDetailsSchema.safeParse({ meetingDate }).success).toBe(false)
  })
  it('distinguishes planned ending time from the real ending time', () => {
    const m = meetingDetailsSchema.parse({ number: '07', shift: 'Matutina', invitationDate: '2026-11-10', meetingDate: '2026-11-12', startTime: '09:00', scheduledEndTime: '10:30', location: 'Auditorio', responsible: 'Tutor' })
    expect(() => assertMeetingReady(m, 'CALL')).not.toThrow()
    expect(() => assertMeetingReady(m, 'MINUTES')).toThrow('hora real')
    expect(() => assertMeetingReady({ ...m, actualEndTime: '10:35' }, 'MINUTES')).not.toThrow()
    expect(meetingDetailsSchema.safeParse({ startTime: '24:00' }).success).toBe(false)
  })
})
