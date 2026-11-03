import { describe, expect, it } from 'vitest'
import { filterStudentChoices, type StudentChoice } from '../../web/src/shared/lib/student-options'
const students: StudentChoice[] = [
  { id: 'ana-m', fullName: 'ANA MARÍA PÉREZ', dni: '0012345678', groups: [{ id: '2AM', name: 'A-M', levelName: 'Segundo', yearName: '2026-2027' }] },
  { id: 'ana-v', fullName: 'ANA MARÍA PÉREZ', dni: 'E009114170', groups: [{ id: '5AV', name: 'A-V', levelName: 'Quinto', yearName: '2026-2027' }] },
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
