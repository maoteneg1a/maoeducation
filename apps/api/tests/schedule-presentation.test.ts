import { describe, expect, it } from 'vitest'
import { getScheduleSubjectPalette, groupScheduleBySubject } from '../../web/src/features/schedules/lib/schedule-presentation'
import type { ScheduleEntry } from '../../web/src/features/schedules/api/schedules.api'

function entry(id: string, subjectId: string, name: string, parallelId: string, weekday: number, startTime: string): ScheduleEntry {
  return { id, weekday, startTime, endTime: '10:00', courseAssignment: {
    id: `assignment-${subjectId}-${parallelId}`, subject: { id: subjectId, name },
    parallel: { id: parallelId, name: 'A', level: { name: 'Básica' } },
    teacher: { id: 'teacher', profile: { firstName: 'Docente', lastName: 'Prueba' } }, academicYear: { id: 'year', name: '2026-2027' },
  } }
}

describe('schedule grouped by subject', () => {
  it('preserves simultaneous blocks and combines the same subject across assignments and parallels', () => {
    const records = [entry('a', 'math', 'Matemática', 'p1', 1, '07:45'), entry('b', 'math', 'Matemática', 'p2', 1, '07:45'), entry('c', 'science', 'Ciencias Naturales', 'p1', 1, '07:45'), entry('d', 'math', 'Matemática', 'p1', 2, '08:30')]
    const groups = groupScheduleBySubject(records)
    expect(groups.map(group => group.subject.name)).toEqual(['Ciencias Naturales', 'Matemática'])
    expect(groups.find(group => group.subject.id === 'math')).toMatchObject({ parallelCount: 2, entries: [{ id: 'a' }, { id: 'b' }, { id: 'd' }] })
    expect(groups.flatMap(group => group.entries).map(record => record.id).sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('orders each subject by weekday and exact start time without changing the source records', () => {
    const records = [entry('friday', 'math', 'Matemática', 'p1', 5, '07:00'), entry('late', 'math', 'Matemática', 'p1', 1, '08:30'), entry('early', 'math', 'Matemática', 'p1', 1, '07:45')]
    expect(groupScheduleBySubject(Object.freeze(records))[0].entries.map(record => record.id)).toEqual(['early', 'late', 'friday'])
    expect(records.map(record => record.id)).toEqual(['friday', 'late', 'early'])
    expect(groupScheduleBySubject([])).toEqual([])
  })
  it('keeps recognizable subject colors across accents, capitalization and filtering', () => {
    expect(getScheduleSubjectPalette('  MATEMÁTICA ')).toEqual(getScheduleSubjectPalette('matematica'))
    const names = ['Matemática', 'Lengua y Literatura', 'Ciencias Naturales']
    expect(new Set(names.map(name => getScheduleSubjectPalette(name).accent)).size).toBe(3)
    const color = getScheduleSubjectPalette('Asignatura personalizada').accent
    getScheduleSubjectPalette('Otra asignatura')
    expect(getScheduleSubjectPalette('Asignatura personalizada').accent).toBe(color)
  })
})
