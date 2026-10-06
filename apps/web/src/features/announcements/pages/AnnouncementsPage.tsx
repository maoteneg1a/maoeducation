import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, MapPin, Megaphone, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { usePermissions } from '@/shared/hooks/usePermissions'
import { getErrorMessage } from '@/shared/lib/utils'
import { getParallels, getYears, type Parallel } from '@/features/enrollment/api/enrollment.api'
import { announcementsApi, type AnnouncementAudience, type CreateAnnouncementInput } from '../api/announcements.api'

const audienceLabels: Record<AnnouncementAudience, string> = {
  all: 'Toda la institución',
  staff: 'Personal',
  families: 'Estudiantes y familias',
  parallels: 'Paralelos seleccionados',
}

const emptyForm: CreateAnnouncementInput = {
  title: '', body: '', priority: 'normal', audience: 'all', parallelIds: [],
}

export function AnnouncementsPage() {
  const qc = useQueryClient()
  const { hasAnyRole } = usePermissions()
  const canManage = hasAnyRole('admin', 'rector', 'dece', 'inspector')
  const [open, setOpen] = React.useState(false)
  const [form, setForm] = React.useState<CreateAnnouncementInput>(emptyForm)
  const [yearId, setYearId] = React.useState('')
  const { data: announcements = [], isLoading } = useQuery({ queryKey: ['announcements'], queryFn: announcementsApi.list })
  const { data: years = [] } = useQuery({ queryKey: ['years'], queryFn: getYears, enabled: canManage })
  const { data: parallels = [] } = useQuery({ queryKey: ['parallels', yearId], queryFn: () => getParallels(yearId), enabled: canManage && !!yearId })

  React.useEffect(() => {
    if (!yearId && years.length) setYearId(years.find((year) => year.isActive)?.id ?? years[0].id)
  }, [yearId, years])

  const create = useMutation({
    mutationFn: announcementsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] })
      setOpen(false)
      setForm(emptyForm)
      toast.success('Aviso publicado y notificaciones enviadas')
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: announcementsApi.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    onError: (error) => toast.error(getErrorMessage(error)),
  })

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
          {announcements.map((notice) => (
            <Card key={notice.id} className={notice.priority === 'important' ? 'border-amber-400 bg-amber-50/40' : ''}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{notice.title}</h2>
                      {notice.priority === 'important' && <Badge variant="warning">Importante</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{audienceLabels[notice.audience]}</p>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="sm" title="Eliminar aviso" onClick={() => confirm('¿Eliminar este aviso?') && remove.mutate(notice.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm">{notice.body}</p>
                <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {notice.eventAt && <span className="flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{new Date(notice.eventAt).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
                  {notice.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{notice.location}</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button><Button loading={create.isPending} disabled={!form.title.trim() || !form.body.trim() || (form.audience === 'parallels' && !form.parallelIds.length)} onClick={() => create.mutate(form)}>Publicar aviso</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
