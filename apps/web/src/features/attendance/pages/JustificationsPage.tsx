import * as React from 'react'
import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Search, ShieldCheck, UserX } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/shared/components/ui/dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn } from '@/shared/lib/utils'
import {
  searchStudents,
  getStudentAbsences,
  type StudentSearchResult,
  type StudentAbsenceRecord,
} from '@/features/attendance/api/attendance.api'
import { apiPost } from '@/shared/lib/api-client'
import { JustificationRequestsInbox } from '../components/JustificationRequestsInbox'

function createJustification(payload: {
  studentId: string
  attendanceRecordIds: string[]
  reason: string
  documentUrl?: string
}) {
  return apiPost('attendance/justifications', payload)
}

const STATUS_LABEL: Record<string, string> = { absent: 'Ausente', late: 'Tarde' }
const STATUS_CLASS: Record<string, string> = {
  absent: 'bg-red-100 text-red-700 border-red-200',
  late: 'bg-yellow-100 text-yellow-700 border-yellow-200',
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(y, m - 1, d))
}

export function JustificationsPage() {
  const qc = useQueryClient()

  const [search, setSearch] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const { data: students = [], isFetching: searching } = useQuery({
    queryKey: ['student-search', debouncedSearch],
    queryFn: () => searchStudents(debouncedSearch),
    enabled: debouncedSearch.length >= 2,
    staleTime: 30_000,
  })

  const {
    data: absencesData,
    isLoading: absencesLoading,
  } = useQuery({
    queryKey: ['student-absences', selectedStudent?.id],
    queryFn: () => getStudentAbsences(selectedStudent!.id),
    enabled: !!selectedStudent,
  })

  const records = absencesData?.records ?? []
  const allSelected = selectedIds.size > 0 && selectedIds.size === records.length

  const justifyMutation = useMutation({
    mutationFn: () =>
      createJustification({
        studentId: selectedStudent!.id,
        attendanceRecordIds: [...selectedIds],
        reason,
        documentUrl: documentUrl || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-absences', selectedStudent?.id] })
      toast.success('Justificación creada correctamente')
      setDialogOpen(false)
      setSelectedIds(new Set())
      setReason('')
      setDocumentUrl('')
    },
    onError: () => toast.error('Error al crear la justificación'),
  })

  function selectStudent(s: StudentSearchResult) {
    setSelectedStudent(s)
    setSelectedIds(new Set())
    setSearch('')
    setDebouncedSearch('')
  }

  function toggleRecord(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(records.map((r) => r.id)))
  }

  const showDropdown = debouncedSearch.length >= 2 && !selectedStudent

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Justificaciones de Ausencia</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Busca un estudiante y selecciona las ausencias a justificar
        </p>
      </div>

      <JustificationRequestsInbox />

      {/* Student search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Buscar por nombre o cédula…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            if (selectedStudent) setSelectedStudent(null)
          }}
          className="pl-9"
        />
        {/* Dropdown results */}
        {showDropdown && (
          <div className="absolute z-10 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
            {searching ? (
              <p className="p-3 text-sm text-muted-foreground">Buscando…</p>
            ) : students.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">Sin resultados</p>
            ) : (
              students.map((s) => (
                <button
                  key={s.id}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => selectStudent(s)}
                >
                  <span className="font-medium">{s.fullName}</span>
                  {s.dni && <span className="text-muted-foreground ml-2 text-xs">{s.dni}</span>}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Selected student header */}
      {selectedStudent && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {selectedStudent.fullName[0]}
              </span>
            </div>
            <div>
              <p className="font-semibold">{selectedStudent.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {selectedStudent.dni && `CI: ${selectedStudent.dni} · `}
                {absencesData && `${absencesData.levelName} "${absencesData.parallelName}" · modo ${absencesData.attendanceMode === 'daily' ? 'diario' : 'por materia'}`}
              </p>
            </div>
          </div>
          {selectedIds.size > 0 && (
            <Button onClick={() => setDialogOpen(true)}>
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              Justificar ({selectedIds.size})
            </Button>
          )}
        </div>
      )}

      {/* Absences list */}
      {!selectedStudent ? (
        <EmptyState
          icon={Search}
          title="Busca un estudiante"
          description="Escribe al menos 2 caracteres para buscar por nombre o cédula"
        />
      ) : absencesLoading ? (
        <PageLoader />
      ) : records.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="Sin ausencias pendientes"
          description="Este estudiante no tiene ausencias o tardanzas sin justificar"
        />
      ) : (
        <div className="border rounded-lg overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_auto_auto] gap-3 px-4 py-2.5 bg-muted/50 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="flex items-center">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="rounded border-input"
              />
            </div>
            <div>Fecha</div>
            <div>{absencesData?.attendanceMode === 'daily' ? 'Tipo' : 'Materia'}</div>
            <div>Estado</div>
          </div>

          {/* Rows */}
          <div className="divide-y">
            {records.map((r: StudentAbsenceRecord) => (
              <div
                key={r.id}
                onClick={() => toggleRecord(r.id)}
                className={cn(
                  'grid grid-cols-[2rem_1fr_auto_auto] gap-3 px-4 py-3 items-center cursor-pointer transition-colors',
                  selectedIds.has(r.id) ? 'bg-primary/5' : 'hover:bg-muted/30',
                )}
              >
                <div onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggleRecord(r.id)}
                    className="rounded border-input"
                  />
                </div>
                <div>
                  <p className="text-sm font-medium">{fmtDate(r.date)}</p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                </div>
                <div className="text-sm text-muted-foreground">
                  {absencesData?.attendanceMode === 'daily'
                    ? 'Todo el día'
                    : (r.subject?.name ?? '—')}
                </div>
                <div>
                  <span className={cn(
                    'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border',
                    STATUS_CLASS[r.status] ?? 'bg-gray-100 text-gray-700 border-gray-200',
                  )}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-muted/30 border-t text-xs text-muted-foreground">
            {records.length} ausencia{records.length !== 1 ? 's' : ''} pendiente{records.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 && ` · ${selectedIds.size} seleccionada${selectedIds.size !== 1 ? 's' : ''}`}
          </div>
        </div>
      )}

      {/* Justification dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear Justificación</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm font-medium">Ausencias a justificar</Label>
              <div className="mt-1.5 border rounded-md p-3 space-y-1 max-h-36 overflow-y-auto bg-muted/30">
                {[...selectedIds].map((id) => {
                  const r = records.find((x) => x.id === id)
                  if (!r) return null
                  return (
                    <p key={id} className="text-sm flex items-center gap-2">
                      <span>{fmtDate(r.date)}</span>
                      {absencesData?.attendanceMode === 'per_subject' && r.subject && (
                        <span className="text-muted-foreground">· {r.subject.name}</span>
                      )}
                    </p>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reason">Motivo *</Label>
              <textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Describe el motivo de la justificación…"
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="docUrl">URL del documento (opcional)</Label>
              <Input
                id="docUrl"
                value={documentUrl}
                onChange={(e) => setDocumentUrl(e.target.value)}
                placeholder="https://…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={justifyMutation.isPending}>
              Cancelar
            </Button>
            <Button
              onClick={() => justifyMutation.mutate()}
              disabled={!reason.trim() || justifyMutation.isPending}
            >
              {justifyMutation.isPending ? 'Guardando…' : 'Justificar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
