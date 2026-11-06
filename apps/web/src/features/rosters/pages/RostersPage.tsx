import * as React from 'react'
import * as XLSX from 'xlsx'
import { useQuery } from '@tanstack/react-query'
import { Download, Search, Users } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/components/ui/table'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { academicApi } from '@/features/academic/api/academic.api'
import { getParallels, getYears, listEnrollments } from '@/features/enrollment/api/enrollment.api'
import { rostersApi } from '../api/rosters.api'

const ALL = 'all'
const collator = new Intl.Collator('es', { sensitivity: 'base' })
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function download(rows: Array<Array<string | number>>, name: string) {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  sheet['!cols'] = rows[0]?.map((_, index) => ({ wch: index === 1 ? 32 : 20 }))
  XLSX.utils.book_append_sheet(book, sheet, 'Nómina')
  XLSX.writeFile(book, `${name.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ_-]+/g, '_')}.xlsx`)
}

export function RostersPage() {
  const [tab, setTab] = React.useState<'students' | 'teachers'>('students')
  const [yearId, setYearId] = React.useState('')
  const [parallelId, setParallelId] = React.useState(ALL)
  const [subjectId, setSubjectId] = React.useState(ALL)
  const [status, setStatus] = React.useState('active')
  const [search, setSearch] = React.useState('')
  React.useEffect(() => setStatus('active'), [tab])

  const years = useQuery({ queryKey: ['years'], queryFn: getYears })
  React.useEffect(() => {
    if (!yearId && years.data?.length) setYearId(years.data.find((year) => year.isActive)?.id ?? years.data[0].id)
  }, [yearId, years.data])
  React.useEffect(() => { setParallelId(ALL); setSubjectId(ALL) }, [yearId])

  const parallels = useQuery({ queryKey: ['rosters-parallels', yearId], queryFn: () => getParallels(yearId), enabled: !!yearId })
  const assignments = useQuery({ queryKey: ['rosters-assignments', yearId], queryFn: () => academicApi.getAssignments({ academicYearId: yearId }), enabled: !!yearId })
  const enrollments = useQuery({ queryKey: ['rosters-enrollments', yearId], queryFn: () => listEnrollments({ yearId }), enabled: !!yearId })
  const teachers = useQuery({ queryKey: ['rosters-teachers'], queryFn: rostersApi.teachers })

  const subjects = React.useMemo(() => {
    const map = new Map((assignments.data ?? []).map((assignment) => [assignment.subjectId, assignment.subject?.name ?? assignment.subjectName ?? 'Materia']))
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => collator.compare(a.name, b.name))
  }, [assignments.data])
  const subjectParallelIds = React.useMemo(() => new Set((assignments.data ?? []).filter((assignment) => subjectId === ALL || assignment.subjectId === subjectId).map((assignment) => assignment.parallelId)), [assignments.data, subjectId])
  const term = normalized(search.trim())

  const studentRows = React.useMemo(() => (enrollments.data ?? []).filter((enrollment) =>
    (parallelId === ALL || enrollment.parallel.id === parallelId)
    && (subjectId === ALL || subjectParallelIds.has(enrollment.parallel.id))
    && (status === ALL || enrollment.status === status)
    && (!term || normalized(`${enrollment.student.profile.lastName} ${enrollment.student.profile.firstName} ${enrollment.student.profile.dni ?? ''}`).includes(term)),
  ), [enrollments.data, parallelId, status, subjectId, subjectParallelIds, term])

  const teacherRows = React.useMemo(() => (teachers.data?.data ?? []).map((teacher) => {
    const allLoad = (assignments.data ?? []).filter((assignment) => assignment.teacherId === teacher.id)
    const load = allLoad.filter((assignment) =>
      (parallelId === ALL || assignment.parallelId === parallelId)
      && (subjectId === ALL || assignment.subjectId === subjectId))
    return { teacher, load }
  }).filter(({ teacher, load }) => {
    return (status === ALL || (status === 'active' ? teacher.isActive : !teacher.isActive))
      && (parallelId === ALL && subjectId === ALL || load.length > 0)
      && (!term || normalized(`${teacher.fullName} ${teacher.dni ?? ''} ${teacher.email}`).includes(term))
  }).sort((a, b) => collator.compare(a.teacher.fullName, b.teacher.fullName)), [teachers.data, assignments.data, parallelId, status, subjectId, term])

  const loading = years.isLoading || parallels.isLoading || assignments.isLoading || enrollments.isLoading || teachers.isLoading
  const selectedYear = years.data?.find((year) => year.id === yearId)?.name ?? 'Año lectivo'
  const selectedParallel = parallelId === ALL ? 'Todos los paralelos' : parallels.data?.find((parallel) => parallel.id === parallelId)?.level.name + ' ' + parallels.data?.find((parallel) => parallel.id === parallelId)?.name
  const selectedSubject = subjectId === ALL ? 'Todas las materias' : subjects.find((subject) => subject.id === subjectId)?.name ?? 'Materia'

  function exportCurrent() {
    if (tab === 'students') download([
      ['#', 'Apellidos', 'Nombres', 'Cédula', 'Curso', 'Estado', 'Año lectivo'],
      ...studentRows.map((row, index) => [index + 1, row.student.profile.lastName, row.student.profile.firstName, row.student.profile.dni ?? '', `${row.parallel.level.name} ${row.parallel.name}`, row.status, row.academicYear.name]),
    ], `Nomina_estudiantes_${selectedYear}_${selectedSubject}`)
    else download([
      ['#', 'Docente', 'Cédula', 'Correo', 'Teléfono', 'Materias y cursos', 'Estado'],
      ...teacherRows.map(({ teacher, load }, index) => [index + 1, teacher.fullName, teacher.dni ?? '', teacher.email, teacher.phone ?? '', load.length ? load.map((assignment) => `${assignment.subject?.name ?? assignment.subjectName} · ${assignment.parallel?.level.name ?? ''} ${assignment.parallel?.name ?? assignment.parallelName}`).join('; ') : 'Sin carga asignada', teacher.isActive ? 'Activo' : 'Inactivo']),
    ], `Nomina_docentes_${selectedYear}_${selectedSubject}`)
  }

  if (loading && !years.data) return <PageLoader />
  const total = tab === 'students' ? studentRows.length : teacherRows.length
  return <div className="space-y-5 p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><h1 className="text-2xl font-bold">Nóminas</h1><p className="mt-1 text-sm text-muted-foreground">Consulta y exporta estudiantes y docentes con su información académica.</p></div>
      <Button variant="outline" onClick={exportCurrent} disabled={!total}><Download className="mr-2 h-4 w-4" /> Exportar Excel</Button>
    </div>

    <Tabs value={tab} onValueChange={(value) => setTab(value as typeof tab)}><TabsList><TabsTrigger value="students">Estudiantes</TabsTrigger><TabsTrigger value="teachers">Docentes</TabsTrigger></TabsList></Tabs>

    <Card><CardContent className="space-y-4 p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Select value={yearId} onValueChange={setYearId}><SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger><SelectContent>{(years.data ?? []).map((year) => <SelectItem key={year.id} value={year.id}>{year.name}{year.isActive ? ' · actual' : ''}</SelectItem>)}</SelectContent></Select>
        <Select value={parallelId} onValueChange={setParallelId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todos los paralelos</SelectItem>{(parallels.data ?? []).map((parallel) => <SelectItem key={parallel.id} value={parallel.id}>{parallel.level.name} {parallel.name}</SelectItem>)}</SelectContent></Select>
        <Select value={subjectId} onValueChange={setSubjectId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value={ALL}>Todas las materias</SelectItem>{subjects.map((subject) => <SelectItem key={subject.id} value={subject.id}>{subject.name}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Solo activos</SelectItem><SelectItem value={ALL}>Activos e inactivos</SelectItem>{tab === 'teachers' && <SelectItem value="inactive">Solo inactivos</SelectItem>}</SelectContent></Select>
        <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre o cédula" /></div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm"><Badge variant="secondary"><Users className="mr-1 h-3.5 w-3.5" /> {total} {tab === 'students' ? 'estudiantes' : 'docentes'}</Badge><span className="text-muted-foreground">{selectedYear} · {selectedParallel} · {selectedSubject}</span></div>
    </CardContent></Card>

    {loading ? <PageLoader /> : total === 0 ? <EmptyState title="No hay resultados" description="Cambia los filtros o revisa que existan matrículas y asignaciones en el año seleccionado." /> : <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table>
      {tab === 'students' ? <><TableHeader><TableRow><TableHead className="w-14">#</TableHead><TableHead>Estudiante</TableHead><TableHead>Cédula</TableHead><TableHead>Curso</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{studentRows.map((row, index) => <TableRow key={row.id}><TableCell>{index + 1}</TableCell><TableCell className="font-medium">{row.student.profile.lastName} {row.student.profile.firstName}</TableCell><TableCell>{row.student.profile.dni ?? '—'}</TableCell><TableCell>{row.parallel.level.name} {row.parallel.name}</TableCell><TableCell><Badge variant={row.status === 'active' ? 'success' : 'secondary'}>{row.status === 'active' ? 'Activo' : row.status}</Badge></TableCell></TableRow>)}</TableBody></> : <><TableHeader><TableRow><TableHead>Docente</TableHead><TableHead>Cédula</TableHead><TableHead>Contacto</TableHead><TableHead>Materias y cursos</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{teacherRows.map(({ teacher, load }) => <TableRow key={teacher.id}><TableCell className="font-medium">{teacher.fullName}</TableCell><TableCell>{teacher.dni ?? '—'}</TableCell><TableCell><p>{teacher.email}</p>{teacher.phone && <p className="text-xs text-muted-foreground">{teacher.phone}</p>}</TableCell><TableCell>{load.length ? <div className="flex max-w-xl flex-wrap gap-1">{load.map((assignment) => <Badge key={assignment.id} variant="outline">{assignment.subject?.name ?? assignment.subjectName} · {assignment.parallel?.level.name ?? ''} {assignment.parallel?.name ?? assignment.parallelName}</Badge>)}</div> : <span className="text-amber-700">Sin carga asignada</span>}</TableCell><TableCell><Badge variant={teacher.isActive ? 'success' : 'secondary'}>{teacher.isActive ? 'Activo' : 'Inactivo'}</Badge></TableCell></TableRow>)}</TableBody></>}
    </Table></div></CardContent></Card>}
  </div>
}
