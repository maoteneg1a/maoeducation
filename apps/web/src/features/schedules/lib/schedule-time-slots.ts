/** Cada hora de inicio guardada debe tener una fila, incluidos bloques con minutos. */
export function getScheduleTimeSlots(entries: ReadonlyArray<{ startTime: string }>): string[] {
  if (entries.length === 0) {
    return Array.from({ length: 11 }, (_, index) => `${String(index + 7).padStart(2, '0')}:00`)
  }

  return [...new Set(entries.map((entry) => entry.startTime))].sort()
}
