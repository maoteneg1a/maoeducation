import { useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, UserRound, X } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { filterStudentChoices, type StudentChoice } from '@/shared/lib/student-options'

interface Props {
  id?: string
  students: StudentChoice[]
  value: string
  onChange: (id: string) => void
  optional?: boolean
  isLoading?: boolean
  isError?: boolean
  invalid?: boolean
}

/** Escape cierra la búsqueda antes de cerrar el formulario que la contiene. */
export function preventStudentPickerDialogClose(event: KeyboardEvent) {
  if (event.target instanceof Element && event.target.closest('[data-student-picker-open="true"]')) event.preventDefault()
}

/** Búsqueda en todo el directorio autorizado; los resultados visibles son acotados. */
export function StudentPicker({ id, students, value, onChange, optional, isLoading, isError, invalid }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [groupId, setGroupId] = useState('')
  const panelId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const results = useRef<HTMLDivElement>(null)
  const selected = students.find((s) => s.id === value)
  const groups = useMemo(() => [...new Map(students.flatMap((s) => s.groups ?? []).map((g) => [g.id, g])).values()]
    .sort((a, b) => `${a.levelName} ${a.name}`.localeCompare(`${b.levelName} ${b.name}`, 'es', { numeric: true })), [students])
  const matches = useMemo(() => filterStudentChoices(students, search, groupId), [students, search, groupId])
  const choose = (next: string) => { onChange(next); setOpen(false); trigger.current?.focus() }

  return <div className="space-y-2" data-student-picker-open={open ? 'true' : undefined} onKeyDown={(e) => {
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus() }
  }}>
    <Button ref={trigger} id={id} type="button" variant="outline" aria-expanded={open} aria-controls={panelId} aria-invalid={invalid}
      className="h-auto min-h-11 w-full justify-between gap-3 px-3 py-2 text-left font-normal" onClick={() => setOpen((v) => !v)}>
      <span className="flex min-w-0 items-center gap-2"><UserRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0"><span className="block whitespace-normal break-words">{selected?.fullName || (optional ? 'Sin estudiante / general' : 'Buscar y seleccionar estudiante')}</span>
          {selected && <span className="block text-xs text-muted-foreground">{selected.dni ?? 'Sin documento'}{selected.groups?.[0] && ` · ${selected.groups[0].levelName} ${selected.groups[0].name}`}</span>}
        </span>
      </span><ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Button>
    {open && <div id={panelId} className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="space-y-2">
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
          <Input autoFocus aria-label="Buscar estudiante por nombre o documento" placeholder="Nombre, apellido o documento…" className="pr-8 pl-9" value={search}
            onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); results.current?.querySelector<HTMLButtonElement>('button')?.focus() } }} />
          {search && <button type="button" aria-label="Limpiar búsqueda" className="absolute right-2 top-2 rounded p-1 text-muted-foreground" onClick={() => setSearch('')}><X className="h-4 w-4" /></button>}
        </div>
        {groups.length > 0 && <select aria-label="Filtrar estudiantes por grado y paralelo" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
          <option value="">Todos los grados y paralelos</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.levelName} · {g.name} · {g.yearName}</option>)}
        </select>}
      </div>
      <div ref={results} className="mt-2 max-h-52 space-y-1 overflow-y-auto" aria-label="Resultados de estudiantes" onKeyDown={(e) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
        const buttons = Array.from(results.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (e.key === 'ArrowDown' ? 1 : -1)))
        e.preventDefault(); buttons[next]?.focus()
      }}>
        {optional && <button type="button" className="w-full rounded-md px-2 py-2 text-left text-sm text-muted-foreground hover:bg-muted focus:bg-muted" onClick={() => choose('')}>Sin estudiante / general</button>}
        {isLoading ? <p className="p-2 text-sm text-muted-foreground">Cargando estudiantes…</p>
          : isError ? <p role="alert" className="p-2 text-sm text-destructive">No se pudieron cargar los estudiantes. Vuelve a intentarlo.</p>
          : !matches.length ? <p className="p-2 text-sm text-muted-foreground">No hay estudiantes que coincidan. Prueba otro nombre, documento o curso.</p>
          : matches.slice(0, 50).map((s) => <button key={s.id} type="button" aria-pressed={value === s.id} onClick={() => choose(s.id)} className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left hover:bg-accent focus:bg-accent focus:outline-none">
            <span className="min-w-0"><span className="block break-words text-sm font-medium">{s.fullName}</span><span className="block text-xs text-muted-foreground">{s.dni ?? 'Sin documento'}{s.groups?.length ? ` · ${s.groups.map((g) => `${g.levelName} ${g.name}`).join(', ')}` : ' · Sin paralelo activo'}</span></span>
            {value === s.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
          </button>)}
      </div>
      {!isLoading && !isError && <p aria-live="polite" className="mt-2 border-t pt-2 text-xs text-muted-foreground">{matches.length} coincidencia{matches.length === 1 ? '' : 's'}{matches.length > 50 ? ' · Se muestran las primeras 50. Escribe o filtra el curso para encontrar a la persona.' : ''}</p>}
    </div>}
  </div>
}
