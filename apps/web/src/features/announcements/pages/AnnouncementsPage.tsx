import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, Download, FileText, ImageIcon, MapPin, Megaphone, Plus, Trash2 } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { getParallels, getYears, type Parallel } from '@/features/enrollment/api/enrollment.api'
import { announcementsApi, type Announcement, type AnnouncementAudience, type CreateAnnouncementInput } from '../api/announcements.api'

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: 'Toda la institución',
  staff: 'Personal',
  families: 'Estudiantes y familias',
  parallels: 'Paralelos seleccionados',
}

const emptyForm: CreateAnnouncementInput = {
  title: '', body: '', priority: 'normal', audience: 'all', parallelIds: [],
}

function eventStatus(eventAt?: string | null) {
  if (!eventAt) return null
  const event = new Date(eventAt)
  const now = new Date()
  const eventDay = new Date(event.getFullYear(), event.getMonth(), event.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const days = Math.round((eventDay - today) / 86_400_000)
  if (days < 0) return { label: 'Finalizado', className: 'bg-muted text-muted-foreground' }
  if (days === 0) return { label: 'Hoy', className: 'bg-amber-100 text-amber-800' }
  if (days === 1) return { label: 'Mañana', className: 'bg-blue-100 text-blue-800' }
  return { label: `Faltan ${days} días`, className: 'bg-blue-50 text-blue-700' }
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return ''
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`
}

function AnnouncementFlyer({ announcement, className }: { announcement: Announcement; className?: string }) {
  const { data } = useQuery({
    queryKey: ['announcement-file', announcement.id, 'flyer'],
    queryFn: () => announcementsApi.getFile(announcement.id, 'flyer'),
    enabled: !!announcement.flyerUrl,
    staleTime: Infinity,
  })
  const [url, setUrl] = React.useState('')

  React.useEffect(() => {
    if (!data) return
    const nextUrl = URL.createObjectURL(data)
    setUrl(nextUrl)
    return () => URL.revokeObjectURL(nextUrl)
  }, [data])

  if (!url) return <div className={cn('animate-pulse bg-muted', className)} />
  return <img src={url} alt={`Flyer de ${announcement.title}`} className={cn('object-cover', className)} />
}

export function AnnouncementsPage() {
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasAnyRole } = usePermissions()
  const canManage = hasAnyRole('admin', 'rector', 'dece', 'inspector')
  const [open, setOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<Announcement | null>(null)
  const [form, setForm] = React.useState<CreateAnnouncementInput>(emptyForm)
  const [flyerFile, setFlyerFile] = React.useState<File | null>(null)
  const [attachmentFile, setAttachmentFile] = React.useState<File | null>(null)
  const [yearId, setYearId] = React.useState('')
  const { data: announcements = [], isLoading } = useQuery({ queryKey: ['announcements'], queryFn: announcementsApi.list })
  const orderedAnnouncements = React.useMemo(
    () => [...announcements].sort((a, b) => Number(a.isRead) - Number(b.isRead)),
    [announcements],
  )
  const { data: years = [] } = useQuery({ queryKey: ['years'], queryFn: getYears, enabled: canManage })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: canManage && !!yearId })

  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((year) => year.isActive)?.id ?? years[0].id)
  }, [yearId, years])

  const create = useMutation({
    mutationFn: async (input: CreateAnnouncementInput) => {
      const announcement = await announcementsApi.create(input)
      const uploads = await Promise.allSettled([
        ...(flyerFile ? [announcementsApi.uploadFile(announcement.id, 'flyer', flyerFile)] : []),
        ...(attachmentFile ? [announcementsApi.uploadFile(announcement.id, 'attachment', attachmentFile)] : []),
      ])
      return { hasUploadError: uploads.some((result) => result.status === 'rejected') }
    },
    onSuccess: ({ hasUploadError }) => {
      qc.invalidateQueries({ queryKey: ['announcements'] })
      setOpen(false)
      setForm(emptyForm)
      setFlyerFile(null)
      setAttachmentFile(null)
      if (hasUploadError) toast.warning('Aviso publicado, pero uno de los archivos no pudo subirse')
      else toast.success('Aviso publicado y notificaciones enviadas')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: announcementsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const markRead = useMutation({
    mutationFn: announcementsApi.markRead,
    onMutate: (id) => {
      qc.setQueryData<Announcement[]>(['announcements'], (current = []) =>
        current.map((notice) => notice.id === id ? { ...notice, isRead: true, readAt: new Date().toISOString() } : notice),
      )
      setSelected((current) => current?.id === id ? { ...current, isRead: true, readAt: new Date().toISOString() } : current)
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })

  const openDetail = (notice: Announcement) => {
    setSelected(notice)
    if (!notice.isRead) markRead.mutate(notice.id)
  }

  React.useEffect(() => {
    const requestedId = searchParams.get('notice')
    if (!requestedId || selected?.id === requestedId) return
    const notice = announcements.find((item) => item.id === requestedId)
    if (notice) openDetail(notice)
  }, [announcements, searchParams, selected?.id])

  const downloadAttachment = async (notice: Announcement) => {
    try {
      const blob = await announcementsApi.getFile(notice.id, 'attachment')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = notice.attachmentName ?? 'documento'
      anchor.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      toast.error(getErrorMessage(error))
    }
  }

  const toggleParallel = (id: string) => setForm((current) => ({
    ...current,
    parallelIds: current.parallelIds.includes(id)
      ? current.parallelIds.filter((value) => value !== id)
      : [...current.parallelIds, id],
  }))

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Avisos</h1>
          <p className="mt-1 text-sm text-muted-foreground">Eventos y comunicados breves de la institución</p>
        </div>
        {canManage && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nuevo aviso</Button>}
      </div>

      {announcements.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <Megaphone className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
          <p className="font-medium">No hay avisos vigentes</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orderedAnnouncements.map((notice) => {
            const timing = eventStatus(notice.eventAt)
            return (
            <Card
              key={notice.id}
              className={cn(
                'overflow-hidden transition-shadow hover:shadow-md',
                !notice.isRead && 'border-primary/50 ring-1 ring-primary/10',
                notice.priority === 'important' && 'border-amber-400',
              )}
            >
              {notice.flyerUrl && <AnnouncementFlyer announcement={notice} className="h-36 w-full" />}
              <CardContent className="space-y-3 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <button type="button" onClick={() => openDetail(notice)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="break-words font-semibold">{notice.title}</h2>
                      {!notice.isRead && <Badge>Nuevo</Badge>}
                      {notice.isRead && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Leído</span>}
                      {notice.priority === 'important' && <Badge variant="warning">Importante</Badge>}
                      {timing && <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', timing.className)}>{timing.label}</span>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{audienceLabels[notice.audience]}</p>
                  </button>
                  {canManage && (
                    <Button variant="ghost" size="sm" title="Eliminar aviso" onClick={() => confirm('¿Eliminar este aviso?') && remove.mutate(notice.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <button type="button" onClick={() => openDetail(notice)} className="block w-full text-left">
                  <p className="line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{notice.body}</p>
                  <span className="mt-2 inline-block text-xs font-medium text-primary">Ver detalle</span>
                </button>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {notice.eventAt && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(notice.eventAt).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  {notice.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{notice.location}</span>}
                  {notice.attachmentName && <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> Documento adjunto</span>}
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
      )}

      <Dialog open={selected != null} onOpenChange={(isOpen) => {
        if (!isOpen) {
          setSelected(null)
          if (searchParams.has('notice')) setSearchParams({}, { replace: true })
        }
      }}>
        <DialogContent className="max-h-[92vh] w-[calc(100%_-_1.5rem)] overflow-y-auto p-0 sm:max-w-2xl">
          {selected?.flyerUrl && <AnnouncementFlyer announcement={selected} className="max-h-[48vh] w-full rounded-t-lg object-contain bg-muted/30" />}
          {selected && (
            <div className="space-y-5 p-5 sm:p-6">
              <DialogHeader className="text-left">
                <div className="flex flex-wrap items-center gap-2">
                  {selected.priority === 'important' && <Badge variant="warning">Importante</Badge>}
                  {eventStatus(selected.eventAt) && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', eventStatus(selected.eventAt)?.className)}>
                      {eventStatus(selected.eventAt)?.label}
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><CheckCircle2 className="h-3 w-3" /> Leído</span>
                </div>
                <DialogTitle className="break-words text-xl leading-snug">{selected.title}</DialogTitle>
                <DialogDescription>
                  Publicado {new Date(selected.publishedAt).toLocaleDateString('es-EC', { dateStyle: 'long' })} · {audienceLabels[selected.audience]}
                </DialogDescription>
              </DialogHeader>

              <div className="whitespace-pre-wrap break-words text-sm leading-6">{selected.body}</div>

              {(selected.eventAt || selected.location) && (
                <div className="grid gap-3 rounded-lg bg-muted/50 p-4 text-sm sm:grid-cols-2">
                  {selected.eventAt && <div className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><div className="text-xs text-muted-foreground">Fecha y hora</div><div className="font-medium">{new Date(selected.eventAt).toLocaleString('es-EC', { dateStyle: 'full', timeStyle: 'short' })}</div></div></div>}
                  {selected.location && <div className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><div className="text-xs text-muted-foreground">Lugar</div><div className="font-medium">{selected.location}</div></div></div>}
                </div>
              )}

              {selected.attachmentUrl && (
                <button type="button" onClick={() => downloadAttachment(selected)} className="flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50">
                  <span className="rounded-md bg-primary/10 p-2 text-primary"><FileText className="h-5 w-5" /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{selected.attachmentName}</span><span className="text-xs text-muted-foreground">{formatBytes(selected.attachmentSize)}</span></span>
                  <Download className="h-4 w-4 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nuevo aviso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><Label>Título *</Label><Input value={form.title} maxLength={200} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Ej. Campaña de vacunación" /></div>
            <div className="space-y-1.5"><Label>Descripción *</Label><textarea className="min-h-28 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Fecha y hora del evento</Label><Input type="datetime-local" value={form.eventAt ?? ''} onChange={(event) => setForm({ ...form, eventAt: event.target.value || null })} /></div>
              <div className="space-y-1.5"><Label>Lugar</Label><Input value={form.location ?? ''} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Prioridad</Label><Select value={form.priority} onValueChange={(priority: 'normal' | 'important') => setForm({ ...form, priority })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="normal">Normal</SelectItem><SelectItem value="important">Importante</SelectItem></SelectContent></Select></div>
              <div className="space-y-1.5"><Label>Destinatarios</Label><Select value={form.audience} onValueChange={(audience: AnnouncementAudience) => setForm({ ...form, audience, parallelIds: [] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(audienceLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            </div>
            {form.audience === 'parallels' && (
              <div className="space-y-2 rounded-md border p-3">
                <Select value={yearId} onValueChange={setYearId}><SelectTrigger><SelectValue placeholder="Año lectivo" /></SelectTrigger><SelectContent>{years.map((year) => <SelectItem key={year.id} value={year.id}>{year.name}</SelectItem>)}</SelectContent></Select>
                <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">
                  {parallels.map((parallel: Parallel) => <label key={parallel.id} className="flex items-center gap-2 rounded border p-2 text-sm"><input type="checkbox" checked={form.parallelIds.includes(parallel.id)} onChange={() => toggleParallel(parallel.id)} />{parallel.level.name} - {parallel.name}</label>)}
                </div>
              </div>
            )}
            <div className="space-y-1.5"><Label>Visible hasta (opcional)</Label><Input type="datetime-local" value={form.expiresAt ?? ''} onChange={(event) => setForm({ ...form, expiresAt: event.target.value || null })} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="cursor-pointer rounded-lg border border-dashed p-4 transition-colors hover:bg-muted/40">
                <span className="flex items-center gap-2 text-sm font-medium"><ImageIcon className="h-4 w-4 text-primary" /> Flyer o imagen</span>
                <span className="mt-1 block text-xs text-muted-foreground">JPG, PNG o WebP · máximo 8 MB</span>
                <span className="mt-2 block truncate text-xs font-medium text-primary">{flyerFile?.name ?? 'Seleccionar imagen'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => setFlyerFile(event.target.files?.[0] ?? null)} />
              </label>
              <label className="cursor-pointer rounded-lg border border-dashed p-4 transition-colors hover:bg-muted/40">
                <span className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4 text-primary" /> Documento adjunto</span>
                <span className="mt-1 block text-xs text-muted-foreground">PDF, Word o Excel · máximo 10 MB</span>
                <span className="mt-2 block truncate text-xs font-medium text-primary">{attachmentFile?.name ?? 'Seleccionar documento'}</span>
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="sr-only" onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)} />
              </label>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={create.isPending} disabled={!form.title.trim() || !form.body.trim() || (form.audience === 'parallels' && !form.parallelIds.length)} onClick={() => create.mutate(form)}>Publicar aviso</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
