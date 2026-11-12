export interface StudentChoice {
  id: string
  fullName: string
  dni: string | null
  groups?: Array<{ id: string; name: string; levelName: string; yearName: string }>
}

export function normalizeStudentSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim()
}

export function filterStudentChoices(students: StudentChoice[], search: string, groupId: string) {
  const terms = normalizeStudentSearch(search).split(/\s+/).filter(Boolean)
  return students.filter((s) => {
    if (groupId && !s.groups?.some((g) => g.id === groupId)) return false
    const text = normalizeStudentSearch(`${s.fullName} ${s.dni ?? ''}`)
    return terms.every((term) => text.includes(term))
  }).sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }))
}
