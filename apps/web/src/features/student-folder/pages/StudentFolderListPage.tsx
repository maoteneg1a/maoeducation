import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FolderOpen, Search, ChevronRight, ChevronLeft, X, GraduationCap, AlertTriangle, Handshake, MoreHorizontal, FileText, ClipboardList, BookOpen, Archive } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { useAcademicYears, useParallels } from '@/features/academic/hooks/useAcademic'
import { useAccessibleStudents } from '../hooks/useStudentFolder'

const ALL = '__all__'
const PAGE_SIZE = 20
const SHORTCUTS = [
  { tab: 'calificaciones', label: 'Ver calificaciones', icon: GraduationCap },
  { tab: 'incidentes', label: 'Ver incidentes', icon: AlertTriangle },
  { tab: 'atenciones', label: 'Ver atenciones a padres', icon: Handshake },
]
const MORE = [
  { tab: 'matriculas', label: 'Matrículas y certificados', icon: ClipboardList },
  { tab: 'actas', label: 'Actas', icon: FileText },
  { tab: 'refuerzos', label: 'Refuerzos', icon: BookOpen },
  { tab: 'expediente', label: 'Bitácora de respaldo', icon: Archive },
]

export function StudentFolderListPage() {
  const [urlParams, setUrlParams] = useSearchParams()
  const [searchInput, setSearchInput] = useState(() => urlParams.get('q') ?? '')
  const [search, setSearch] = useState(searchInput)
  const [parallelId, setParallelId] = useState(() => urlParams.get('parallel') ?? ALL)
  const [page, setPage] = useState(() => Math.max(1, Math.trunc(Number(urlParams.get('page'))) || 1))

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput.trim() !== search) { setSearch(searchInput.trim()); setPage(1) }
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, search])

  useEffect(() => {
    const next = new URLSearchParams()
    if (search) next.set('q', search)
    if (parallelId !== ALL) next.set('parallel', parallelId)
    if (page > 1) next.set('page', String(page))
    setUrlParams(next, { replace: true })
  }, [search, parallelId, page, setUrlParams])

  const { data: years = [] } = useAcademicYears()
  const activeYear = years.find((y) => y.isActive) ?? years[0]
  const { data: parallels = [], isError: parallelsError } = useParallels(activeYear?.id)
  const params = useMemo(() => ({ search: search || undefined, parallelId: parallelId !== ALL ? parallelId : undefined, page, pageSize: PAGE_SIZE }), [search, parallelId, page])
  const { data, isLoading, isFetching, isPlaceholderData, isError, refetch } = useAccessibleStudents(params)
  const students = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const backTo = `/student-folder${urlParams.size ? `?${urlParams}` : ''}`
  const folderUrl = (id: string, tab = 'resumen') => `/student-folder/${id}?${new URLSearchParams({ tab, returnTo: backTo })}`

  return <div className="space-y-5 p-4 sm:p-6">
    <div>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><FolderOpen className="h-6 w-6" />Carpeta del Estudiante</h1>
      <p className="mt-1 text-sm text-muted-foreground">Encuentra un estudiante y abre su carpeta o una sección directamente.</p>
    </div>
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1">
        <Search aria-hidden className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Buscar carpetas por nombre o documento" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Nombre, apellido o documento…" className="pl-9 pr-9" />
        {searchInput && <button type="button" aria-label="Limpiar búsqueda" className="absolute right-2 top-2 rounded p-1 text-muted-foreground" onClick={() => setSearchInput('')}><X className="h-4 w-4" /></button>}
      </div>
      <Select value={parallelId} onValueChange={(v) => { setParallelId(v); setPage(1) }}>
        <SelectTrigger aria-label="Filtrar carpetas por grado y paralelo" className="w-full sm:w-64"><SelectValue placeholder="Todos los grados y paralelos" /></SelectTrigger>
        <SelectContent><SelectItem value={ALL}>Todos los grados y paralelos</SelectItem>{parallels.map((p) => <SelectItem key={p.id} value={p.id}>{p.level?.name} {p.name}</SelectItem>)}</SelectContent>
      </Select>
      {(searchInput || parallelId !== ALL) && <Button variant="ghost" onClick={() => { setSearchInput(''); setSearch(''); setParallelId(ALL); setPage(1) }}>Limpiar filtros</Button>}
    </div>
    {parallelsError && <p role="alert" className="text-sm text-destructive">No se pudieron cargar los cursos. Puedes buscar por nombre o documento.</p>}
    {isLoading ? <PageLoader /> : isError ? <div className="rounded-lg border p-6 text-center"><p role="alert" className="text-sm text-destructive">No se pudieron cargar los estudiantes.</p><Button className="mt-3" variant="outline" onClick={() => refetch()}>Reintentar</Button></div>
      : !students.length ? <EmptyState title="Sin coincidencias" description="Prueba otro nombre, documento o grado/paralelo." />
      : <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span aria-live="polite">{total} estudiante{total === 1 ? '' : 's'}{isFetching ? ' · Actualizando…' : ''}</span><span>Accesos rápidos: carpeta, notas, incidentes y atenciones. Más secciones en ···</span></div>
        <div aria-busy={isFetching} className={`overflow-hidden rounded-lg border ${isPlaceholderData ? 'pointer-events-none opacity-60' : ''}`}>
          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid"><span>Estudiante / documento</span><span>Grado y paralelo</span><span className="w-72 text-right">Acciones</span></div>
          <ul className="divide-y">
            {students.map((s) => <li key={s.id} className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/20 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] md:items-center md:gap-4">
              <div className="min-w-0"><Link to={folderUrl(s.id)} className="block break-words text-sm font-semibold leading-snug hover:text-primary hover:underline focus-visible:underline">{s.fullName}</Link><p className="mt-0.5 text-xs text-muted-foreground">{s.dni ?? 'Sin documento'}</p></div>
              <p className="text-xs text-muted-foreground">{[s.levelName, s.parallelName].filter(Boolean).join(' · ') || 'Sin paralelo registrado'}</p>
              <div className="flex flex-wrap items-center gap-1 md:w-72 md:flex-nowrap md:justify-end" aria-label={`Acciones de ${s.fullName}`}>
                <Button asChild variant="outline" size="sm"><Link to={folderUrl(s.id)}><FolderOpen className="mr-1.5 h-4 w-4" />Carpeta</Link></Button>
                {SHORTCUTS.map(({ tab, label, icon: Icon }) => <Button asChild key={tab} variant="ghost" size="icon" className="h-9 w-9"><Link to={folderUrl(s.id, tab)} aria-label={`${label} de ${s.fullName}`} title={label}><Icon className="h-4 w-4" /></Link></Button>)}
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Más acciones de ${s.fullName}`} title="Más secciones"><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{MORE.map(({ tab, label, icon: Icon }) => <DropdownMenuItem key={tab} asChild><Link to={folderUrl(s.id, tab)}><Icon className="mr-2 h-4 w-4" />{label}</Link></DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>
              </div>
            </li>)}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm"><span className="text-muted-foreground">Página {page} de {totalPages}</span><div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || isFetching}><ChevronLeft className="h-4 w-4" />Anterior</Button>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || isFetching}>Siguiente<ChevronRight className="h-4 w-4" /></Button>
        </div></div>
      </>}
  </div>
}
