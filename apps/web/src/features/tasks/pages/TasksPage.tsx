import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Link } from 'react-router-dom'
import {
  Plus, BookOpen, Clock, CheckCircle2, Pencil, Trash2, Send,
  CalendarDays, Paperclip, Download, X, FileText, Image, File,
  ClipboardCheck, GraduationCap, AlertCircle,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Badge } from '@/shared/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/shared/components/ui/dialog'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/shared/components/ui/sheet'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage, cn } from '@/shared/lib/utils'
import {
  tasksApi, getAttachmentUrl, type Task, type CreateTaskPayload, type TaskAttachment,
} from '../api/tasks.api'
import { activitiesApi } from '@/features/activities/api/activities.api'
import { useTeacherDefaults } from '@/features/academic/hooks/useTeacherDefaults'
import type { AcademicPeriod } from '@/features/academic/api/academic.api'
import { useAuthStore } from '@/store/auth.store'
import { usePermissions } from '@/shared/hooks/usePermissions'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string) {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(y, m - 1, d))
}

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image className="h-4 w-4 text-blue-500" />
  if (mime === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
  return <File className="h-4 w-4 text-muted-foreground" />
}

function DueBadge({ dueDate }: { dueDate: string }) {
  const days = daysUntil(dueDate)
  if (days < 0) return <Badge variant="destructive" className="text-xs">Vencida</Badge>
  if (days === 0) return <Badge className="text-xs bg-orange-500 hover:bg-orange-600">Hoy</Badge>
  if (days <= 3) return <Badge className="text-xs bg-amber-500 hover:bg-amber-600">{days}d</Badge>
  return <Badge variant="secondary" className="text-xs">{days} días</Badge>
}

// ─── Attachment list ──────────────────────────────────────────────────────────

function AttachmentList({
  attachments,
  taskId,
  canDelete,
  onDeleted,
}: {
  attachments: TaskAttachment[]
  taskId: string
  canDelete: boolean
  onDeleted: (id: string) => void
}) {
  const [deleting, setDeleting] = React.useState<string | null>(null)

  async function handleDelete(att: TaskAttachment) {
    if (!confirm(`¿Eliminar "${att.fileName}"?`)) return
    setDeleting(att.id)
    try {
      await tasksApi.deleteAttachment(taskId, att.id)
      onDeleted(att.id)
      toast.success('Adjunto eliminado')
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setDeleting(null)
    }
  }

  if (attachments.length === 0) return (
    <p className="text-sm text-muted-foreground italic">Sin adjuntos</p>
  )

  return (
    <div className="space-y-1.5">
      {attachments.map((att) => (
        <div key={att.id} className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/40 group">
          {fileIcon(att.mimeType)}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{att.fileName}</p>
            <p className="text-[11px] text-muted-foreground">{formatBytes(att.fileSize)}</p>
          </div>
          <a
            href={getAttachmentUrl(att.storedName)}
            target="_blank"
            rel="noopener noreferrer"
            download={att.fileName}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-4 w-4" />
          </a>
          {canDelete && (
            <button
              type="button"
              onClick={() => handleDelete(att)}
              disabled={deleting === att.id}
              className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Task Detail Sheet ────────────────────────────────────────────────────────

interface TaskDetailProps {
  task: Task | null
  isTeacher: boolean
  onClose: () => void
  onEdit: (t: Task) => void
  onPublish: (t: Task) => void
  onDelete: (t: Task) => void
  onConvert: (t: Task) => void
  onAttachmentChange: () => void
}

function TaskDetailSheet({ task, isTeacher, onClose, onEdit, onPublish, onDelete, onConvert, onAttachmentChange }: TaskDetailProps) {
  const [attachments, setAttachments] = React.useState<TaskAttachment[]>([])
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (task) setAttachments(task.attachments ?? [])
  }, [task])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !task) return
    setUploading(true)
    try {
      const att = await tasksApi.uploadAttachment(task.id, file)
      setAttachments((prev) => [...prev, att])
      onAttachmentChange()
      toast.success('Adjunto subido')
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  if (!task) return null

  const days = daysUntil(task.dueDate)

  return (
    <Sheet open={!!task} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-1 pr-6">
          <div className="flex items-start gap-2">
            <SheetTitle className="flex-1 leading-snug">{task.title}</SheetTitle>
            <DueBadge dueDate={task.dueDate} />
          </div>
          <p className="text-sm text-muted-foreground">
            {task.courseAssignment.subject.name} — {task.courseAssignment.parallel.level.name} {task.courseAssignment.parallel.name}
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className="flex items-center gap-3 flex-wrap">
            {!task.isPublished && <Badge variant="secondary">Borrador</Badge>}
            {task.activity && (
              <Badge className="bg-emerald-600 hover:bg-emerald-700 gap-1">
                <ClipboardCheck className="h-3 w-3" /> Calificable
              </Badge>
            )}
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Send className="h-3.5 w-3.5" /> Envío: {formatDate(task.publishAt)}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" /> Entrega: {formatDate(task.dueDate)}
            </span>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <h4 className="text-sm font-semibold">Descripción</h4>
            {task.description ? (
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">Sin descripción</p>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Paperclip className="h-4 w-4" /> Adjuntos ({attachments.length})
              </h4>
              {isTeacher && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    {uploading ? 'Subiendo…' : '+ Agregar'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept="*/*"
                  />
                </>
              )}
            </div>
            <AttachmentList
              attachments={attachments}
              taskId={task.id}
              canDelete={isTeacher}
              onDeleted={(id) => {
                setAttachments((prev) => prev.filter((a) => a.id !== id))
                onAttachmentChange()
              }}
            />
          </div>

          {/* "No realizado" report — only once the task is gradeable */}
          {isTeacher && task.activity && (
            <div className="pt-2 border-t">
              <NotDoneReport activityId={task.activity.id} />
            </div>
          )}

          {/* Teacher actions */}
          {isTeacher && (
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              {!task.isPublished && (
                <Button size="sm" className="gap-1.5" onClick={() => { onPublish(task); onClose() }}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Publicar
                </Button>
              )}
              {task.activity ? (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <Link to="/grades"><GraduationCap className="h-3.5 w-3.5" /> Calificar</Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { onConvert(task); onClose() }}>
                  <ClipboardCheck className="h-3.5 w-3.5" /> Crear como actividad
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { onEdit(task); onClose() }}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
                onClick={() => { onDelete(task); onClose() }}
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Task Form Dialog ─────────────────────────────────────────────────────────

interface TaskFormProps {
  open: boolean
  onClose: () => void
  onSave: (data: CreateTaskPayload) => void
  isPending: boolean
  assignments: Array<{ id: string; subject: { name: string }; parallel: { name: string; level: { name: string } } }>
  defaultAssignmentId?: string
  initial?: Task | null
}

function TaskFormDialog({ open, onClose, onSave, isPending, assignments, defaultAssignmentId, initial }: TaskFormProps) {
  const [assignmentId, setAssignmentId] = React.useState(defaultAssignmentId ?? '')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [dueDate, setDueDate] = React.useState('')
  const [publishAt, setPublishAt] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setAssignmentId(initial?.courseAssignmentId ?? defaultAssignmentId ?? '')
      setTitle(initial?.title ?? '')
      setDescription(initial?.description ?? '')
      setDueDate(initial?.dueDate ? initial.dueDate.slice(0, 10) : '')
      setPublishAt(initial?.publishAt ? initial.publishAt.slice(0, 10) : new Date().toISOString().slice(0, 10))
    }
  }, [open, initial, defaultAssignmentId])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !dueDate || !assignmentId) { toast.error('Completa los campos requeridos'); return }
    onSave({ courseAssignmentId: assignmentId, title: title.trim(), description: description.trim() || undefined, dueDate, publishAt: publishAt || undefined })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Materia *</label>
            <Select value={assignmentId || '__none__'} onValueChange={(v) => setAssignmentId(v === '__none__' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Seleccionar materia" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__" disabled>Seleccionar materia</SelectItem>
                {assignments.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.subject.name} — {a.parallel.level.name} {a.parallel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Título *</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Leer capítulo 3 y hacer resumen" maxLength={255} />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instrucciones adicionales..."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Fecha de envío</label>
              <Input type="date" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Fecha de entrega *</label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Guardando…' : initial ? 'Guardar cambios' : 'Crear tarea'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Convert task → gradeable activity ────────────────────────────────────────

interface ConvertDialogProps {
  task: Task | null
  periods: AcademicPeriod[]
  defaultPeriodId: string
  onClose: () => void
  onConverted: () => void
}

function ConvertToActivityDialog({ task, periods, defaultPeriodId, onClose, onConverted }: ConvertDialogProps) {
  const [periodId, setPeriodId] = React.useState('')
  const [activityTypeId, setActivityTypeId] = React.useState('')
  const [insumoId, setInsumoId] = React.useState('')
  const [maxScore, setMaxScore] = React.useState('10')

  const courseAssignmentId = task?.courseAssignmentId ?? ''

  React.useEffect(() => {
    if (task) {
      setPeriodId(defaultPeriodId || '')
      setActivityTypeId('')
      setInsumoId('')
      setMaxScore('10')
    }
  }, [task, defaultPeriodId])

  const { data: types = [] } = useQuery({
    queryKey: ['activity-types'],
    queryFn: () => activitiesApi.getTypes(),
    enabled: !!task,
  })
  const activeTypes = types.filter((t) => t.isActive)

  const { data: insumos = [] } = useQuery({
    queryKey: ['insumos', courseAssignmentId, periodId],
    queryFn: () => activitiesApi.getInsumos(courseAssignmentId, periodId),
    enabled: !!task && !!courseAssignmentId && !!periodId,
  })

  const convert = useMutation({
    mutationFn: () =>
      activitiesApi.createActivity({
        courseAssignmentId,
        academicPeriodId: periodId,
        activityTypeId,
        insumoId: insumoId || undefined,
        taskId: task!.id,
        name: task!.title,
        description: task!.description ?? undefined,
        maxScore: Number(maxScore),
        activityDate: task!.dueDate.slice(0, 10),
      } as Parameters<typeof activitiesApi.createActivity>[0]),
    onSuccess: () => {
      toast.success('Actividad creada — ya puedes calificarla en Notas')
      onConverted()
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!periodId || !activityTypeId) { toast.error('Selecciona el período y el tipo de actividad'); return }
    const max = Number(maxScore)
    if (isNaN(max) || max <= 0) { toast.error('El puntaje máximo debe ser mayor a 0'); return }
    convert.mutate()
  }

  return (
    <Dialog open={!!task} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Crear como actividad</DialogTitle>
        </DialogHeader>
        {task && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Se creará una actividad calificable a partir de <span className="font-medium text-foreground">{task.title}</span>.
            </p>
            <div className="space-y-1">
              <label className="text-sm font-medium">Período *</label>
              <Select value={periodId || '__none__'} onValueChange={(v) => { setPeriodId(v === '__none__' ? '' : v); setInsumoId('') }}>
                <SelectTrigger><SelectValue placeholder="Seleccionar período" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Seleccionar período</SelectItem>
                  {periods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipo de actividad *</label>
              <Select value={activityTypeId || '__none__'} onValueChange={(v) => setActivityTypeId(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" disabled>Seleccionar tipo</SelectItem>
                  {activeTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Insumo</label>
              <Select value={insumoId || '__none__'} onValueChange={(v) => setInsumoId(v === '__none__' ? '' : v)} disabled={!periodId}>
                <SelectTrigger><SelectValue placeholder="Sin insumo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin insumo</SelectItem>
                  {insumos.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {periodId && insumos.length === 0 && (
                <p className="text-xs text-muted-foreground">No hay insumos en este período para esta materia.</p>
              )}
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Puntaje máximo *</label>
              <Input
                type="number" min={1} step={0.01} inputMode="decimal"
                value={maxScore} onChange={(e) => setMaxScore(e.target.value)} className="w-28"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
              <Button type="submit" disabled={convert.isPending}>
                {convert.isPending ? 'Creando…' : 'Crear actividad'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── "No realizado" report (inside task detail, once it has an activity) ───────

function NotDoneReport({ activityId }: { activityId: string }) {
  const { data: grades = [], isLoading } = useQuery({
    queryKey: ['grades', 'activity', activityId],
    queryFn: () => activitiesApi.getGradesByActivity(activityId),
    enabled: !!activityId,
  })

  if (isLoading) return null

  const notDone = grades.filter((g) => g.status === 'no_realizado')

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <AlertCircle className="h-4 w-4 text-amber-600" /> No realizaron ({notDone.length} de {grades.length})
      </h4>
      {notDone.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Nadie marcado como no realizado.</p>
      ) : (
        <ul className="space-y-1">
          {notDone.map((g) => (
            <li key={g.studentId} className="text-sm flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
              {g.studentName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Task Card (compact — click to open detail) ───────────────────────────────

function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-lg border bg-card px-4 py-3 hover:bg-muted/30 transition-colors space-y-1',
        !task.isPublished && 'border-dashed opacity-80',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm truncate">{task.title}</span>
          {!task.isPublished && <Badge variant="secondary" className="text-xs shrink-0">Borrador</Badge>}
          {task.activity && (
            <Badge className="text-xs shrink-0 bg-emerald-600 hover:bg-emerald-700 gap-1">
              <ClipboardCheck className="h-3 w-3" /> Calificable
            </Badge>
          )}
          {task.attachments?.length > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0">
              <Paperclip className="h-3 w-3" />{task.attachments.length}
            </span>
          )}
        </div>
        <DueBadge dueDate={task.dueDate} />
      </div>
      {task.description && (
        <p className="text-xs text-muted-foreground line-clamp-1">{task.description}</p>
      )}
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground pt-0.5">
        <span className="flex items-center gap-1"><Send className="h-3 w-3" />{formatDate(task.publishAt)}</span>
        <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(task.dueDate)}</span>
      </div>
    </button>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function TasksPage() {
  const user = useAuthStore((s) => s.user)
  const { hasPermission } = usePermissions()
  const isTeacher = user?.roles.includes('teacher') ?? false
  const isAdmin = (user?.roles.includes('admin') || user?.roles.includes('inspector')) ?? false
  const canWriteTasks = hasPermission('tasks:write')
  const qc = useQueryClient()

  const { assignments, defaultAssignmentId, activeYear, periods, defaultPeriodId } = useTeacherDefaults()
  const [selectedAssignmentId, setSelectedAssignmentId] = React.useState('')
  const [showForm, setShowForm] = React.useState(false)
  const [editing, setEditing] = React.useState<Task | null>(null)
  const [detailTask, setDetailTask] = React.useState<Task | null>(null)
  const [converting, setConverting] = React.useState<Task | null>(null)
  const [filter, setFilter] = React.useState<'all' | 'pending' | 'overdue'>('all')

  React.useEffect(() => {
    if (defaultAssignmentId && !selectedAssignmentId) setSelectedAssignmentId(defaultAssignmentId)
  }, [defaultAssignmentId])

  const queryParams = {
    ...(selectedAssignmentId ? { courseAssignmentId: selectedAssignmentId } : {}),
    ...(activeYear ? { academicYearId: activeYear.id } : {}),
  }

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', queryParams],
    queryFn: () => tasksApi.list(queryParams),
    enabled: isTeacher || isAdmin ? !!activeYear : true,
  })

  const createMutation = useMutation({
    mutationFn: (data: CreateTaskPayload) => tasksApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setShowForm(false); toast.success('Tarea creada') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreateTaskPayload }) => tasksApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); setEditing(null); setShowForm(false); toast.success('Tarea actualizada') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const publishMutation = useMutation({
    mutationFn: (id: string) => tasksApi.publish(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Tarea publicada') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => tasksApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Tarea eliminada') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return daysUntil(t.dueDate) >= 0
    if (filter === 'overdue') return daysUntil(t.dueDate) < 0
    return true
  })

  const grouped = React.useMemo(() => {
    if (isTeacher || isAdmin) return null
    const map = new Map<string, { name: string; tasks: Task[] }>()
    for (const t of filteredTasks) {
      const key = t.courseAssignmentId
      if (!map.has(key)) map.set(key, { name: `${t.courseAssignment.subject.name} — ${t.courseAssignment.parallel.level.name} ${t.courseAssignment.parallel.name}`, tasks: [] })
      map.get(key)!.tasks.push(t)
    }
    return Array.from(map.values())
  }, [filteredTasks, isTeacher, isAdmin])

  const pendingCount = tasks.filter((t) => t.isPublished && daysUntil(t.dueDate) >= 0 && daysUntil(t.dueDate) <= 7).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tareas</h1>
          <p className="text-sm text-muted-foreground">
            {canWriteTasks ? 'Crea y gestiona tareas para tus alumnos' : 'Tareas y trabajos pendientes'}
          </p>
        </div>
        {canWriteTasks && (
          <Button onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="h-4 w-4 mr-2" />Nueva tarea
          </Button>
        )}
      </div>

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
          <Clock className="h-4 w-4 shrink-0" />
          {pendingCount} {pendingCount === 1 ? 'tarea vence' : 'tareas vencen'} en los próximos 7 días
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        {(isTeacher || isAdmin) && assignments.length > 1 && (
          <Select value={selectedAssignmentId || '__all__'} onValueChange={(v) => setSelectedAssignmentId(v === '__all__' ? '' : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Todas las materias" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas las materias</SelectItem>
              {assignments.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.subject?.name ?? a.subjectName} — {a.parallel?.name ?? a.parallelName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex rounded-md border overflow-hidden text-xs">
          {(['all', 'pending', 'overdue'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 font-medium transition-colors', f !== 'all' && 'border-l',
                filter === f ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted')}>
              {{ all: 'Todas', pending: 'Pendientes', overdue: 'Vencidas' }[f]}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : filteredTasks.length === 0 ? (
        <EmptyState icon={BookOpen} title="Sin tareas"
          description={canWriteTasks ? 'Crea la primera tarea con el botón "Nueva tarea"' : 'No tienes tareas pendientes'} />
      ) : isTeacher || isAdmin ? (
        <div className="space-y-2">
          {filteredTasks.map((task) => (
            <TaskCard key={task.id} task={task} onClick={() => setDetailTask(task)} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped!.map((group) => (
            <div key={group.name} className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">{group.name}</h3>
              {group.tasks.map((task) => (
                <TaskCard key={task.id} task={task} onClick={() => setDetailTask(task)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Detail sheet */}
      <TaskDetailSheet
        task={detailTask}
        isTeacher={canWriteTasks}
        onClose={() => setDetailTask(null)}
        onEdit={(t) => { setEditing(t); setShowForm(true) }}
        onPublish={(t) => publishMutation.mutate(t.id)}
        onDelete={(t) => { if (confirm('¿Eliminar esta tarea?')) deleteMutation.mutate(t.id) }}
        onConvert={(t) => setConverting(t)}
        onAttachmentChange={() => qc.invalidateQueries({ queryKey: ['tasks'] })}
      />

      {/* Convert task → gradeable activity */}
      <ConvertToActivityDialog
        task={converting}
        periods={periods}
        defaultPeriodId={defaultPeriodId}
        onClose={() => setConverting(null)}
        onConverted={() => { setConverting(null); qc.invalidateQueries({ queryKey: ['tasks'] }) }}
      />

      {/* Create / edit form */}
      <TaskFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditing(null) }}
        onSave={(data) => editing ? updateMutation.mutate({ id: editing.id, data }) : createMutation.mutate(data)}
        isPending={createMutation.isPending || updateMutation.isPending}
        assignments={canWriteTasks
          ? assignments.filter((a) => a.subject && a.parallel).map((a) => ({ id: a.id, subject: a.subject!, parallel: a.parallel! }))
          : []}
        defaultAssignmentId={selectedAssignmentId || defaultAssignmentId}
        initial={editing}
      />
    </div>
  )
}
