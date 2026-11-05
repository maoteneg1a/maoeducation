import { describe, expect, it } from 'vitest'
import { getScheduleTimeSlots } from '../../web/src/features/schedules/lib/schedule-time-slots'

describe('weekly schedule rows', () => {
  it('includes every saved start time for successive 45-minute classes', () => {
    const entries = ['07:00', '07:45', '08:30', '09:15', '10:00', '10:45'].map(startTime => ({ startTime }))
    expect(getScheduleTimeSlots(entries)).toEqual(entries.map(entry => entry.startTime))
  })
  it('includes early and evening blocks outside the former 07:00–17:00 range', () => {
    expect(getScheduleTimeSlots([{ startTime: '18:15' }, { startTime: '06:30' }])).toEqual(['06:30', '18:15'])
  })
  it('uses one row for blocks on different days or parallels with the same start time', () => {
    expect(getScheduleTimeSlots([{ startTime: '07:45' }, { startTime: '07:45' }, { startTime: '08:30' }])).toEqual(['07:45', '08:30'])
  })
  it('sorts rows chronologically without changing the received records', () => {
    const entries = Object.freeze([{ startTime: '14:20' }, { startTime: '08:05' }, { startTime: '07:45' }])
    expect(getScheduleTimeSlots(entries)).toEqual(['07:45', '08:05', '14:20'])
    expect(entries.map(entry => entry.startTime)).toEqual(['14:20', '08:05', '07:45'])
  })
  it('keeps a reference grid when no blocks have been saved', () => {
    expect(getScheduleTimeSlots([])).toEqual(['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'])
  })
  it('rebuilds the rows from the currently filtered schedule', () => {
    expect(getScheduleTimeSlots([{ startTime: '13:40' }])).toEqual(['13:40'])
    expect(getScheduleTimeSlots([{ startTime: '07:45' }])).toEqual(['07:45'])
  })
})
