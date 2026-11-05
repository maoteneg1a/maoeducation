import { useEffect, useState } from 'react'
import { BookOpen, CalendarDays, Clock3, Layers3, MapPin, X } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { cn } from '@/shared/lib/utils'
import type { ScheduleEntry } from '../api/schedules.api'
import { getScheduleSubjectPalette, groupScheduleBySubject, SCHEDULE_DAYS } from '../lib/schedule-presentation'
import { getScheduleTimeSlots } from '../lib/schedule-time-slots'

interface Props {
  entries: ScheduleEntry[]
  onDelete?: (entry: ScheduleEntry) => void
}

function ScheduleBlock({ entry, onDelete, showSubject = true }: { entry: ScheduleEntry; onDelete?: Props['onDelete']; showSubject?: boolean }) {
  const { subject, parallel } = entry.courseAssignment
  const palette = getScheduleSubjectPalette(subject.name)
  return <div data-schedule-entry={entry.id} className={cn('relative rounded-lg border border-l-[3px] p-3 shadow-sm', palette.card)} style={{ borderLeftColor: palette.accent }}>
    {onDelete && <button type="button" onClick={() => onDelete(entry)} title="Eliminar bloque" aria-label={`Eliminar bloque de ${subject.name}, ${SCHEDULE_DAYS.find(day => day.value === entry.weekday)?.label}, ${entry.startTime}`} className="absolute right-1.5 top-1.5 rounded p-1 opacity-60 transition hover:bg-background/60 hover:text-destructive hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
    <div className={cn('space-y-2', onDelete && 'pr-4')}>
      {showSubject && <p className="break-words text-sm font-semibold leading-snug">{subject.name}</p>}
      <p className={cn('break-words text-xs leading-relaxed', !showSubject && 'font-medium')}>{parallel.level.name} <span className="whitespace-nowrap font-semibold">{parallel.name}</span></p>
      <p className="flex items-center gap-1.5 text-xs tabular-nums"><Clock3 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" /><span>{entry.startTime} – {entry.endTime}</span></p>
      {entry.room && <p className="flex items-start gap-1.5 text-xs opacity-80"><MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /><span className="break-words">{entry.room}</span></p>}
    </div>
  </div>
}

export function ScheduleOverview({ entries, onDelete }: Props) {
  const [subjectId, setSubjectId] = useState<string | null>(null)
  const groups = groupScheduleBySubject(entries)
  useEffect(() => {
    if (subjectId && !entries.some(entry => entry.courseAssignment.subject.id === subjectId)) setSubjectId(null)
  }, [entries, subjectId])
  const visibleEntries = subjectId ? entries.filter(entry => entry.courseAssignment.subject.id === subjectId) : entries
  const visibleGroups = subjectId ? groups.filter(group => group.subject.id === subjectId) : groups
  const timeSlots = getScheduleTimeSlots(visibleEntries)

  return <Tabs defaultValue="week" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <TabsList aria-label="Vista del horario" className="h-10">
        <TabsTrigger value="week" className="py-1.5"><CalendarDays className="h-4 w-4" aria-hidden="true" />Semana</TabsTrigger>
        <TabsTrigger value="subjects" className="py-1.5"><Layers3 className="h-4 w-4" aria-hidden="true" />Por materia</TabsTrigger>
      </TabsList>
      <p className="text-xs text-muted-foreground" aria-live="polite">{visibleEntries.length} {visibleEntries.length === 1 ? 'bloque' : 'bloques'} · {visibleGroups.length} {visibleGroups.length === 1 ? 'materia' : 'materias'}</p>
    </div>
    {groups.length > 0 && <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por materia">
      <button type="button" aria-pressed={!subjectId} onClick={() => setSubjectId(null)} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', !subjectId ? 'border-foreground bg-foreground text-background' : 'bg-background text-muted-foreground hover:bg-muted')}>Todas las materias</button>
      {groups.map(group => {
        const palette = getScheduleSubjectPalette(group.subject.name)
        return <button key={group.subject.id} type="button" aria-pressed={subjectId === group.subject.id} onClick={() => setSubjectId(subjectId === group.subject.id ? null : group.subject.id)} className={cn('inline-flex max-w-full items-center gap-2 rounded-full border border-transparent px-3 py-1.5 text-left text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', palette.chip, subjectId === group.subject.id && 'ring-2 ring-foreground/40 ring-offset-2 ring-offset-background')}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: palette.accent }} aria-hidden="true" /><span className="break-words">{group.subject.name}</span><span className="opacity-65">{group.entries.length}</span>
        </button>
      })}
    </div>}
    <TabsContent value="week">
      <div className="overflow-x-auto rounded-xl border bg-background">
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Horario semanal por hora y día. Cada materia conserva su color.</caption>
          <colgroup><col className="w-20" />{SCHEDULE_DAYS.map(day => <col key={day.value} className="w-52 xl:w-auto" />)}</colgroup>
          <thead><tr className="bg-muted/50">
            <th scope="col" className="sticky left-0 z-10 bg-muted px-3 py-4 text-left text-xs font-medium text-muted-foreground">Hora</th>
            {SCHEDULE_DAYS.map(day => <th scope="col" key={day.value} className="px-3 py-3 text-left font-semibold"><span className="block">{day.label}</span><span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{visibleEntries.filter(entry => entry.weekday === day.value).length} {visibleEntries.filter(entry => entry.weekday === day.value).length === 1 ? 'bloque' : 'bloques'}</span></th>)}
          </tr></thead>
          <tbody>{timeSlots.map(time => <tr key={time} className="border-t">
            <th scope="row" className="sticky left-0 z-10 border-r bg-background px-3 py-4 align-top text-left font-mono text-xs font-medium text-muted-foreground">{time}</th>
            {SCHEDULE_DAYS.map(day => {
              const blocks = visibleEntries.filter(entry => entry.weekday === day.value && entry.startTime === time)
              return <td key={day.value} className="bg-muted/10 p-2 align-top"><div className="space-y-2">{blocks.map(entry => <ScheduleBlock key={entry.id} entry={entry} onDelete={onDelete} />)}</div></td>
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </TabsContent>
    <TabsContent value="subjects">
      {visibleGroups.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Las materias aparecerán aquí cuando registres bloques de horario.</div> : <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
        {visibleGroups.map(group => {
          const palette = getScheduleSubjectPalette(group.subject.name)
          return <section key={group.subject.id} className="overflow-hidden rounded-xl border bg-background">
            <div className={cn('border-b p-4', palette.card)}>
              <div className="flex items-start gap-3"><span className="mt-0.5 rounded-lg bg-background/60 p-2"><BookOpen className="h-4 w-4" style={{ color: palette.accent }} aria-hidden="true" /></span><div className="min-w-0"><h2 className="break-words font-semibold">{group.subject.name}</h2><p className="mt-1 text-xs opacity-75">{group.entries.length} {group.entries.length === 1 ? 'bloque' : 'bloques'} · {group.parallelCount} {group.parallelCount === 1 ? 'paralelo' : 'paralelos'}</p></div></div>
            </div>
            <div className="space-y-4 p-4">{SCHEDULE_DAYS.map(day => {
              const blocks = group.entries.filter(entry => entry.weekday === day.value)
              return blocks.length > 0 && <div key={day.value}><h3 className="mb-2 text-xs font-semibold text-muted-foreground">{day.label}</h3><div className="space-y-2">{blocks.map(entry => <ScheduleBlock key={entry.id} entry={entry} onDelete={onDelete} showSubject={false} />)}</div></div>
            })}</div>
          </section>
        })}
      </div>}
    </TabsContent>
  </Tabs>
}
