import { describe, expect, it } from 'vitest'
import { convocationHash, resolveConvocationRecipients } from './convocation-recipients'
import { readMeeting } from './meeting-details'

describe('convocation recipients', () => {
  it('only resolves unique staff identities and deduplicates recipients', () => {
    const staff = [{ id: 'a', name: 'Pérez Ana' }, { id: 'b', name: 'López Luis' }, { id: 'c', name: 'López Luis' }]
    const participant = (name: string, userId?: string) => ({ name, userId, role: 'Docente', attendance: 'pending' as const })
    const result = resolveConvocationRecipients([participant('  pérez   Ana '), participant('Pérez Ana', 'a'), participant('López Luis'), participant('Pérez Ana', 'wrong'), participant('Invitado externo')], staff)
    expect(result.recipients).toEqual([staff[0]])
    expect(result.unlinked).toEqual(['López Luis', 'Pérez Ana', 'Invitado externo'])
    expect(resolveConvocationRecipients([participant('López Luis', 'b')], staff).recipients).toEqual([staff[1]])
  })
  it('ignores actual attendance and meeting development when identifying the published invitation', () => {
    const meeting = readMeeting({ participants: [{ name: 'Pérez Ana', role: 'Tutor/a', attendance: 'pending' }] })
    expect(convocationHash({ ...meeting, development: 'Se trató el orden del día', actualEndTime: '11:00', participants: meeting.participants.map((p) => ({ ...p, attendance: 'present' })) })).toBe(convocationHash(meeting))
    expect(convocationHash({ ...meeting, location: 'Otro lugar' })).not.toBe(convocationHash(meeting))
  })
})
