import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api-client'

export type CalendarEventType = 'holiday' | 'exam' | 'event' | 'meeting' | 'other'
export type CalendarAudience = 'all' | 'staff' | 'families'

export interface CalendarEvent {
  id: string
  title: string
  description: string | null
  type: CalendarEventType
  startDate: string
  endDate: string | null
  audience: CalendarAudience
}

export type CalendarEventInput = Omit<CalendarEvent, 'id'>

export const EVENT_TYPE_META: Record<CalendarEventType, { label: string; color: string }> = {
  holiday: { label: 'Feriado / sin clases', color: 'bg-red-500' },
  exam: { label: 'Exámenes', color: 'bg-violet-600' },
  event: { label: 'Evento', color: 'bg-teal-600' },
  meeting: { label: 'Reunión', color: 'bg-sky-600' },
  other: { label: 'Otro', color: 'bg-slate-500' },
}

export const AUDIENCE_LABEL: Record<CalendarAudience, string> = {
  all: 'Toda la comunidad',
  staff: 'Solo personal',
  families: 'Solo familias',
}

export const calendarApi = {
  list: (from: string, to: string) => apiGet<CalendarEvent[]>('calendar/events', { from, to }),
  create: (data: CalendarEventInput) => apiPost<CalendarEvent>('calendar/events', data),
  update: (id: string, data: CalendarEventInput) => apiPut<CalendarEvent>(`calendar/events/${id}`, data),
  remove: (id: string) => apiDelete(`calendar/events/${id}`),
}

/** Días (YYYY-MM-DD) que cubre un evento. */
export function eventDays(e: CalendarEvent): string[] {
  const days: string[] = []
  const end = e.endDate ?? e.startDate
  const d = new Date(`${e.startDate}T12:00:00`)
  while (days.length < 370) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push(key)
    if (key >= end) break
    d.setDate(d.getDate() + 1)
  }
  return days
}
