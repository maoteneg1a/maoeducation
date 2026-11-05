import type { ScheduleEntry } from '../api/schedules.api'

export const SCHEDULE_DAYS = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' },
  { value: 3, label: 'Miércoles' }, { value: 4, label: 'Jueves' },
  { value: 5, label: 'Viernes' },
]

// Colores propios de las materias, independientes del color de marca de la escuela.
const PALETTES = [
  { accent: '#3b82f6', card: 'bg-blue-50 border-blue-200 text-blue-950 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-100', chip: 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100' },
  { accent: '#8b5cf6', card: 'bg-violet-50 border-violet-200 text-violet-950 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-100', chip: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100' },
  { accent: '#10b981', card: 'bg-emerald-50 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100', chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' },
  { accent: '#f59e0b', card: 'bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100', chip: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100' },
  { accent: '#06b6d4', card: 'bg-cyan-50 border-cyan-200 text-cyan-950 dark:bg-cyan-950/40 dark:border-cyan-800 dark:text-cyan-100', chip: 'bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100' },
  { accent: '#f97316', card: 'bg-orange-50 border-orange-200 text-orange-950 dark:bg-orange-950/40 dark:border-orange-800 dark:text-orange-100', chip: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100' },
  { accent: '#ec4899', card: 'bg-pink-50 border-pink-200 text-pink-950 dark:bg-pink-950/40 dark:border-pink-800 dark:text-pink-100', chip: 'bg-pink-100 text-pink-900 dark:bg-pink-950 dark:text-pink-100' },
  { accent: '#14b8a6', card: 'bg-teal-50 border-teal-200 text-teal-950 dark:bg-teal-950/40 dark:border-teal-800 dark:text-teal-100', chip: 'bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-100' },
]

export function getScheduleSubjectPalette(name: string) {
  const normalized = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  if (normalized.includes('matematica')) return PALETTES[0]
  if (normalized.includes('lengua') || normalized.includes('lectura')) return PALETTES[1]
  if (normalized.includes('naturales')) return PALETTES[2]
  if (normalized.includes('sociales')) return PALETTES[3]
  if (normalized.includes('ingles')) return PALETTES[4]
  if (normalized.includes('fisica')) return PALETTES[5]
  if (normalized.includes('artistica')) return PALETTES[6]
  if (normalized.includes('civica') || normalized.includes('vocacional')) return PALETTES[7]
  const hash = Array.from(normalized).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0)
  return PALETTES[hash % PALETTES.length]
}

export function groupScheduleBySubject(entries: readonly ScheduleEntry[]) {
  const groups = new Map<string, { subject: ScheduleEntry['courseAssignment']['subject']; entries: ScheduleEntry[] }>()
  for (const entry of entries) {
    const subject = entry.courseAssignment.subject
    const group = groups.get(subject.id) ?? { subject, entries: [] }
    group.entries.push(entry)
    groups.set(subject.id, group)
  }
  return [...groups.values()].sort((a, b) => a.subject.name.localeCompare(b.subject.name, 'es')).map(group => ({
    ...group,
    entries: [...group.entries].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.id.localeCompare(b.id)),
    parallelCount: new Set(group.entries.map(entry => entry.courseAssignment.parallel.id)).size,
  }))
}
