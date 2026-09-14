import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { type ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import { UserPlus, Users, Edit2, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { DataTable } from '@/shared/components/ui/data-table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { getErrorMessage } from '@/shared/lib/utils'
import { formatDate } from '@/shared/lib/utils'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { useAuthStore } from '@/store/auth.store'
import { academicApi } from '@/features/academic/api/academic.api'
import {
  listEnrollments,
  createEnrollment,
  createStudentEnrollment,
  bulkEnroll,
  updateEnrollmentStatus,
  updateEnrollmentAdaptation,
  getYears,
  getParallels,
  getStudents,
  type Enrollment,
  type AcademicYear,
  type Parallel,
  type StudentOption,
} from '../api/enrollment.api'

// ---- Constants ----

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  withdrawn: 'Retirado',
  transferred: 'Trasladado',
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning'> = {
  active: 'success',
  withdrawn: 'destructive',
  transferred: 'warning',
}

const ALL_STATUSES = ['active', 'withdrawn', 'transferred'] as const

// ---- Inline hooks ----

function useYears() {
  return useQuery({
    queryKey: ['years'],
    queryFn: getYears,
  })
}

function useParallels(yearId?: string) {
  return useQuery({
    queryKey: ['parallels', yearId],
    queryFn: () => getParallels(yearId),
    enabled: !!yearId,
  })
}

function useStudents(search: string) {
  return useQuery({
    queryKey: ['students', search],
    queryFn: () => getStudents(search || undefined),
  })
}

function useEnrollments(yearId: string, parallelId: string) {
  return useQuery({
    queryKey: ['enrollments', yearId, parallelId],
    queryFn: () =>
      listEnrollments({
        ...(yearId ? { yearId } : {}),
        ...(parallelId ? { parallelId } : {}),
      }),
    enabled: !!yearId && !!parallelId,
  })
}

function useCreateEnrollment(yearId: string, parallelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { studentId: string; parallelId: string; academicYearId: string }) =>
      createEnrollment(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', yearId, parallelId] })
      toast.success('Estudiante matriculado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useBulkEnroll(yearId: string, parallelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { studentIds: string[]; parallelId: string; academicYearId: string }) =>
      bulkEnroll(data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['enrollments', yearId, parallelId] })
      toast.success(
        `${result.created} matriculados, ${result.skipped} omitidos (ya matriculados)`,
      )
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useUpdateStatus(yearId: string, parallelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateEnrollmentStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', yearId, parallelId] })
      toast.success('Estado actualizado correctamente')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

function useUpdateAdaptation(yearId: string, parallelId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      ...data
    }: { id: string; hasAdaptation: boolean; adaptationType?: 'temporal' | 'permanente' | null; adaptationNotes?: string | null }) =>
      updateEnrollmentAdaptation(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enrollments', yearId, parallelId] })
      toast.success('Adaptación curricular actualizada')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })
}

// ---- AdaptationDialog sub-component ----
// Marca la adaptación curricular NEE (temporal/permanente) del estudiante en esta
// matrícula. Si está marcada, el PUD la muestra automáticamente en la sección DUA.

interface AdaptationDialogProps {
  enrollment: Enrollment
  onUpdate: (data: { id: string; hasAdaptation: boolean; adaptationType?: 'temporal' | 'permanente' | null; adaptationNotes?: string | null }) => void
  isPending: boolean
}

function AdaptationDialog({ enrollment, onUpdate, isPending }: AdaptationDialogProps) {
  const [open, setOpen] = useState(false)
  const [hasAdaptation, setHasAdaptation] = useState(enrollment.hasAdaptation ?? false)
  const [adaptationType, setAdaptationType] = useState<'temporal' | 'permanente'>(
    enrollment.adaptationType ?? 'temporal',
  )
  const [notes, setNotes] = useState(enrollment.adaptationNotes ?? '')

  useEffect(() => {
    if (open) {
      setHasAdaptation(enrollment.hasAdaptation ?? false)
      setAdaptationType(enrollment.adaptationType ?? 'temporal')
      setNotes(enrollment.adaptationNotes ?? '')
    }
  }, [open, enrollment])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant={enrollment.hasAdaptation ? 'default' : 'outline'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        {enrollment.hasAdaptation ? `NEE: ${enrollment.adaptationType}` : 'Marcar NEE'}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adaptación curricular</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={hasAdaptation}
              onChange={(e) => setHasAdaptation(e.target.checked)}
            />
            Este estudiante tiene una adaptación curricular (NEE)
          </label>
          {hasAdaptation && (
            <>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      checked={adaptationType === 'temporal'}
                      onChange={() => setAdaptationType('temporal')}
                    />
                    Temporal
                  </label>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      checked={adaptationType === 'permanente'}
                      onChange={() => setAdaptationType('permanente')}
                    />
                    Permanente
                  </label>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Observaciones (opcional)</Label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              onUpdate({
                id: enrollment.id,
                hasAdaptation,
                adaptationType: hasAdaptation ? adaptationType : null,
                adaptationNotes: hasAdaptation ? notes.trim() || null : null,
              })
              setOpen(false)
            }}
            loading={isPending}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---- StatusDropdown sub-component ----

interface StatusDropdownProps {
  enrollment: Enrollment
  onUpdate: (id: string, status: string) => void
  isPending: boolean
}

function StatusDropdown({ enrollment, onUpdate, isPending }: StatusDropdownProps) {
  return (
    <Select
      value={enrollment.status}
      onValueChange={(val) => onUpdate(enrollment.id, val)}
      disabled={isPending}
    >
      <SelectTrigger className="h-7 text-xs w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ALL_STATUSES.map((s) => (
          <SelectItem key={s} value={s} className="text-xs">
            {STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// ---- Student picker sub-component ----

interface StudentPickerProps {
  students: StudentOption[]
  selected: string[]
  onToggle: (id: string) => void
  search: string
  onSearchChange: (v: string) => void
  multi?: boolean
}

function StudentPicker({
  students,
  selected,
  onToggle,
  search,
  onSearchChange,
  multi = false,
}: StudentPickerProps) {
  const filtered = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(search.toLowerCase()) ||
      s.email.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-2">
      <Input
        placeholder="Buscar estudiante..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <div className="border rounded-md max-h-52 overflow-y-auto divide-y">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No se encontraron estudiantes
          </p>
        )}
        {filtered.map((s) => {
          const isSelected = selected.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50 ${
                isSelected ? 'bg-primary/10' : ''
              }`}
            >
              <input
                type={multi ? 'checkbox' : 'radio'}
                readOnly
                checked={isSelected}
                className="h-4 w-4 accent-primary shrink-0"
              />
              <div className="min-w-0">
                <p className="font-medium truncate">{s.fullName}</p>
                <p className="text-xs text-muted-foreground truncate">{s.email}</p>
              </div>
            </button>
          )
        })}
      </div>
      {multi && selected.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {selected.length} estudiante{selected.length !== 1 ? 's' : ''} seleccionado
          {selected.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}

// ---- Main Page ----

export function EnrollmentPage() {
  const navigate = useNavigate()
  const qcRoot = useQueryClient()
  // Filter state
  const [yearId, setYearId] = useState('')
  const [parallelId, setParallelId] = useState('')

  // Dialog state
  const [singleOpen, setSingleOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  // Nuevo estudiante (crear + matricular)
  const [newStudentOpen, setNewStudentOpen] = useState(false)
  const [nsFirstName, setNsFirstName] = useState('')
  const [nsLastName, setNsLastName] = useState('')
  const [nsDni, setNsDni] = useState('')

  // Single enrollment form state
  const [singleYearId, setSingleYearId] = useState('')
  const [singleParallelId, setSingleParallelId] = useState('')
  const [singleStudentId, setSingleStudentId] = useState('')
  const [singleSearch, setSingleSearch] = useState('')

  // Bulk enrollment form state
  const [bulkYearId, setBulkYearId] = useState('')
  const [bulkParallelId, setBulkParallelId] = useState('')
  const [bulkStudentIds, setBulkStudentIds] = useState<string[]>([])
  const [bulkSearch, setBulkSearch] = useState('')

  // Queries
  const { data: years = [], isLoading: yearsLoading } = useYears()
  const { data: parallels = [] } = useParallels(yearId)
  const { data: singleParallels = [] } = useParallels(singleYearId)
  const { data: bulkParallels = [] } = useParallels(bulkYearId)
  const { data: enrollments = [], isLoading: enrollmentsLoading } = useEnrollments(yearId, parallelId)
  const { data: students = [] } = useStudents('')

  // Alcance del docente: solo gestiona quien tiene academic_config:manage (admin).
  // El docente ve únicamente sus paralelos (donde dicta o es tutor).
  const { hasPermission } = usePermissions()
  const tutorParallelIds = useAuthStore((s) => s.user?.tutorParallelIds ?? [])
  // "Ve todos los paralelos" (admin). El docente solo ve/gestiona los suyos.
  const seesAllParallels = hasPermission('academic_config:manage')
  // Puede crear/editar matrículas (admin o profesor con enrollment:manage).
  const canCreateEnrollment = hasPermission('enrollment:manage')
  const { data: myAssign } = useQuery({
    queryKey: ['my-course-assignments'],
    queryFn: () => academicApi.getMyAssignments(),
    enabled: !seesAllParallels,
  })
  const allowedParallelIds = React.useMemo(() => {
    if (seesAllParallels) return null
    const set = new Set<string>(tutorParallelIds)
    for (const a of myAssign?.assignments ?? []) {
      const pid = a.parallel?.id ?? a.parallelId
      if (pid) set.add(pid)
    }
    return set
  }, [seesAllParallels, myAssign, tutorParallelIds])
  const filterParallels = (list: Parallel[]) =>
    allowedParallelIds ? list.filter((p) => allowedParallelIds.has(p.id)) : list
  const visibleParallels = filterParallels(parallels)
  const visibleSingleParallels = filterParallels(singleParallels)
  const visibleBulkParallels = filterParallels(bulkParallels)

  // Mutations
  const createMutation = useCreateEnrollment(yearId, parallelId)
  const bulkMutation = useBulkEnroll(yearId, parallelId)
  const statusMutation = useUpdateStatus(yearId, parallelId)
  const adaptationMutation = useUpdateAdaptation(yearId, parallelId)
  const createStudentMutation = useMutation({
    mutationFn: (data: {
      firstName: string; lastName: string; dni: string; parallelId: string; academicYearId: string
    }) => createStudentEnrollment(data),
    onSuccess: () => {
      qcRoot.invalidateQueries({ queryKey: ['enrollments', yearId, parallelId] })
      toast.success('Estudiante creado y matriculado')
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  })

  // Reset parallel when year changes
  useEffect(() => {
    setParallelId('')
  }, [yearId])

  useEffect(() => {
    setSingleParallelId('')
  }, [singleYearId])

  useEffect(() => {
    setBulkParallelId('')
    setBulkStudentIds([])
  }, [bulkYearId])

  function openSingleDialog() {
    setSingleYearId(yearId)
    setSingleParallelId(parallelId)
    setSingleStudentId('')
    setSingleSearch('')
    setSingleOpen(true)
  }

  function openBulkDialog() {
    setBulkYearId(yearId)
    setBulkParallelId(parallelId)
    setBulkStudentIds([])
    setBulkSearch('')
    setBulkOpen(true)
  }

  function handleSingleSubmit() {
    if (!singleYearId || !singleParallelId || !singleStudentId) return
    createMutation.mutate(
      { studentId: singleStudentId, parallelId: singleParallelId, academicYearId: singleYearId },
      { onSuccess: () => setSingleOpen(false) },
    )
  }

  function handleBulkSubmit() {
    if (!bulkYearId || !bulkParallelId || bulkStudentIds.length === 0) return
    bulkMutation.mutate(
      { studentIds: bulkStudentIds, parallelId: bulkParallelId, academicYearId: bulkYearId },
      { onSuccess: () => setBulkOpen(false) },
    )
  }

  function openNewStudentDialog() {
    setNsFirstName('')
    setNsLastName('')
    setNsDni('')
    setNewStudentOpen(true)
  }

  function handleCreateStudent() {
    if (!yearId || !parallelId) {
      toast.error('Selecciona año y paralelo arriba para matricular al nuevo estudiante')
      return
    }
    if (!nsFirstName.trim() || !nsLastName.trim()) {
      toast.error('Nombres y apellidos son obligatorios')
      return
    }
    if (!/^\d{10}$/.test(nsDni.trim())) {
      toast.error('La cédula debe tener 10 dígitos')
      return
    }
    createStudentMutation.mutate(
      {
        firstName: nsFirstName.trim(),
        lastName: nsLastName.trim(),
        dni: nsDni.trim(),
        parallelId,
        academicYearId: yearId,
      },
      { onSuccess: () => setNewStudentOpen(false) },
    )
  }

  function toggleSingleStudent(id: string) {
    setSingleStudentId((prev) => (prev === id ? '' : id))
  }

  function toggleBulkStudent(id: string) {
    setBulkStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  // Table columns
  const columns: ColumnDef<Enrollment, unknown>[] = [
    {
      id: 'estudiante',
      header: 'Estudiante',
      cell: ({ row }) => {
        const { profile } = row.original.student
        const fullName = `${profile.firstName} ${profile.lastName}`
        return (
          <div>
            <p className="font-medium text-sm leading-none">{fullName}</p>
            {profile.dni && (
              <p className="text-xs text-muted-foreground mt-0.5">CI: {profile.dni}</p>
            )}
          </div>
        )
      },
    },
    {
      id: 'paralelo',
      header: 'Paralelo',
      cell: ({ row }) => {
        const { parallel } = row.original
        return (
          <span className="text-sm">
            {parallel.level.name} - {parallel.name}
          </span>
        )
      },
    },
    {
      id: 'año',
      header: 'Año',
      cell: ({ row }) => {
        const { academicYear } = row.original
        return (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">{academicYear.name}</span>
            {academicYear.isActive && (
              <Badge variant="success" className="text-xs py-0">
                Activo
              </Badge>
            )}
          </div>
        )
      },
    },
    {
      id: 'fecha',
      header: 'Fecha matrícula',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {formatDate(row.original.enrolledAt)}
        </span>
      ),
    },
    {
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.original.status] ?? 'secondary'}>
          {STATUS_LABEL[row.original.status] ?? row.original.status}
        </Badge>
      ),
    },
    {
      id: 'nee',
      header: 'NEE',
      cell: ({ row }) => (
        <AdaptationDialog
          enrollment={row.original}
          onUpdate={(data) => adaptationMutation.mutate(data)}
          isPending={adaptationMutation.isPending}
        />
      ),
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            title="Ficha del estudiante"
            onClick={() => navigate(`/students/${row.original.student.id}`)}
          >
            <FileText className="h-4 w-4" />
          </Button>
          <StatusDropdown
            enrollment={row.original}
            onUpdate={(id, status) => statusMutation.mutate({ id, status })}
            isPending={statusMutation.isPending}
          />
        </div>
      ),
    },
  ]

  if (yearsLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Matrículas</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Gestiona la matriculación de estudiantes en paralelos
          </p>
        </div>
        {canCreateEnrollment && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" onClick={openBulkDialog} className="w-full sm:w-auto">
              <Users className="h-4 w-4" />
              Matrícula Masiva
            </Button>
            <Button onClick={openSingleDialog} className="w-full sm:w-auto">
              <UserPlus className="h-4 w-4" />
              Nueva Matrícula
            </Button>
            <Button variant="secondary" onClick={openNewStudentDialog} className="w-full sm:w-auto">
              <UserPlus className="h-4 w-4" />
              Nuevo estudiante
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="w-full sm:w-52">
          <Select value={yearId} onValueChange={setYearId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar año..." />
            </SelectTrigger>
            <SelectContent>
              {years.map((y: AcademicYear) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                  {y.isActive ? ' (Activo)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-full sm:w-52">
          <Select value={parallelId} onValueChange={setParallelId} disabled={!yearId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar paralelo..." />
            </SelectTrigger>
            <SelectContent>
              {visibleParallels.map((p: Parallel) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.level.name} - {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={enrollments}
        isLoading={enrollmentsLoading}
        emptyMessage={
          !yearId || !parallelId
            ? 'Selecciona un año y paralelo para ver las matrículas'
            : 'No hay estudiantes matriculados en este paralelo'
        }
        emptyDescription={
          yearId && parallelId
            ? 'Usa el botón "Nueva Matrícula" para agregar estudiantes'
            : undefined
        }
      />

      {/* ---- Single Enrollment Dialog ---- */}
      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva Matrícula</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Año lectivo *</Label>
              <Select value={singleYearId} onValueChange={setSingleYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año..." />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y: AcademicYear) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                      {y.isActive ? ' (Activo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Paralelo *</Label>
              <Select
                value={singleParallelId}
                onValueChange={setSingleParallelId}
                disabled={!singleYearId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar paralelo..." />
                </SelectTrigger>
                <SelectContent>
                  {visibleSingleParallels.map((p: Parallel) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.level.name} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estudiante *</Label>
              <StudentPicker
                students={students}
                selected={singleStudentId ? [singleStudentId] : []}
                onToggle={toggleSingleStudent}
                search={singleSearch}
                onSearchChange={setSingleSearch}
                multi={false}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSingleOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSingleSubmit}
              disabled={!singleYearId || !singleParallelId || !singleStudentId}
              loading={createMutation.isPending}
            >
              Matricular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- Bulk Enrollment Dialog ---- */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Matrícula Masiva</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Año lectivo *</Label>
              <Select value={bulkYearId} onValueChange={setBulkYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar año..." />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y: AcademicYear) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                      {y.isActive ? ' (Activo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Paralelo *</Label>
              <Select
                value={bulkParallelId}
                onValueChange={setBulkParallelId}
                disabled={!bulkYearId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar paralelo..." />
                </SelectTrigger>
                <SelectContent>
                  {visibleBulkParallels.map((p: Parallel) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.level.name} - {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Estudiantes *</Label>
              <StudentPicker
                students={students}
                selected={bulkStudentIds}
                onToggle={toggleBulkStudent}
                search={bulkSearch}
                onSearchChange={setBulkSearch}
                multi={true}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleBulkSubmit}
              disabled={!bulkYearId || !bulkParallelId || bulkStudentIds.length === 0}
              loading={bulkMutation.isPending}
            >
              Matricular {bulkStudentIds.length > 0 ? `${bulkStudentIds.length} estudiantes` : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nuevo estudiante (crear + matricular en el paralelo del filtro) */}
      <Dialog open={newStudentOpen} onOpenChange={setNewStudentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo estudiante</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se creará el estudiante y se matriculará en el paralelo seleccionado en el filtro
              de arriba. La contraseña inicial será la <strong>cédula</strong>. Para uno que ya
              existe, usa <strong>Nueva Matrícula</strong>.
            </p>
            {(!yearId || !parallelId) && (
              <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Selecciona año y paralelo en el filtro de arriba antes de crear.
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombres *</Label>
                <Input value={nsFirstName} onChange={(e) => setNsFirstName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Apellidos *</Label>
                <Input value={nsLastName} onChange={(e) => setNsLastName(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cédula *</Label>
              <Input
                value={nsDni}
                onChange={(e) => setNsDni(e.target.value.replace(/\D/g, '').slice(0, 10))}
                inputMode="numeric"
                placeholder="10 dígitos"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewStudentOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreateStudent}
              disabled={!yearId || !parallelId || !nsFirstName.trim() || !nsLastName.trim() || nsDni.length !== 10}
              loading={createStudentMutation.isPending}
            >
              Crear y matricular
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
