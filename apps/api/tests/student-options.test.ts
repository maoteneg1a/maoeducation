import { describe, expect, it } from 'vitest'
import { comparePersonNames } from '../../web/src/shared/lib/person-name'
import { filterStudentChoices, type StudentChoice } from '../../web/src/shared/lib/student-options'
const students: StudentChoice[] = [
  { id: 'ana-m', fullName: 'PÉREZ ANA MARÍA', dni: '0012345678', groups: [{ id: '2AM', name: 'A-M', levelName: 'Segundo', yearName: '2026-2027' }] },
  { id: 'ana-v', fullName: 'PÉREZ ANA MARÍA', dni: 'E009114170', groups: [{ id: '5AV', name: 'A-V', levelName: 'Quinto', yearName: '2026-2027' }] },
]
describe('searching a student in a large directory', () => {
  it('ignores case, accents, spaces and the order of name tokens', () => {
    expect(filterStudentChoices(students, '  PEREZ  maria ana ', '')).toHaveLength(2)
  })
  it('finds foreign documents without altering letters or leading zeros', () => {
    expect(filterStudentChoices(students, 'e009114170', '')[0].id).toBe('ana-v')
    expect(filterStudentChoices(students, '001234', '')[0].id).toBe('ana-m')
  })
  it('combines course and search to distinguish identical names', () => {
    expect(filterStudentChoices(students, 'Ana Perez', '5AV').map((s) => s.id)).toEqual(['ana-v'])
    expect(filterStudentChoices(students, '001234', '5AV')).toEqual([])
  })
  it('searches the entire directory, including entries beyond the first 50', () => {
    const large = Array.from({ length: 150 }, (_, i) => ({ ...students[0], id: String(i), fullName: `Persona ${i}`, dni: `CODE${i}` }))
    expect(filterStudentChoices(large, 'CODE149', '')[0].id).toBe('149')
  })
  it('returns no matches for absent courses and supports missing profiles/documents', () => {
    expect(filterStudentChoices(students, '', 'foreign')).toEqual([])
    expect(filterStudentChoices([{ id: 's', fullName: 'Ana', dni: null }], 'ana', '')).toHaveLength(1)
  })
})


describe('Spanish alphabetical order', () => {
  it('orders surnames with accents and ñ, then given names, without mutating the directory', () => {
    const names = ['Zamora Ana', 'Ñúñez Ana', 'Álvarez Zoé', 'Álvarez Ana', 'Núñez Ana']
    const directory = names.map((fullName, i) => ({ id: String(i), fullName, dni: null }))
    expect(filterStudentChoices(directory, '', '').map((s) => s.fullName)).toEqual([
      'Álvarez Ana', 'Álvarez Zoé', 'Núñez Ana', 'Ñúñez Ana', 'Zamora Ana',
    ])
    expect(directory.map((s) => s.fullName)).toEqual(names)
  })
  it('compares complete surnames before given names', () => {
    const people = [
      { lastName: 'Pérez Zamora', firstName: 'Ana' },
      { lastName: 'Pérez Andrade', firstName: 'Zoé' },
      { lastName: 'Pérez Andrade', firstName: 'Ana María' },
    ]
    expect([...people].sort(comparePersonNames)).toEqual([people[2], people[1], people[0]])
  })
})
