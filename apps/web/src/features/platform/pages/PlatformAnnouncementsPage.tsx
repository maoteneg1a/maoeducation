import { useState } from 'react'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Card } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Skeleton } from '@/shared/components/ui/skeleton'
import { Textarea } from '@/shared/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import {
  useCreateAnnouncement,
  useDeleteAnnouncement,
  usePlatformAnnouncements,
  usePlatformRole,
} from '../hooks/usePlatform'
import type { AnnouncementAudience, AnnouncementLevel, PlatformAnnouncement } from '../api/platform.api'

const LEVEL_CONFIG: Record<AnnouncementLevel, { label: string; variant: 'secondary' | 'warning' | 'destructive' }> = {
  info: { label: 'Informativo', variant: 'secondary' },
  warning: { label: 'Advertencia', variant: 'warning' },
  critical: { label: 'Crítico', variant: 'destructive' },
}

const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  all: 'Todos los usuarios',
  admins: 'Solo administradores',
}

function fmtDateTime(d: string) {
  return new Intl.DateTimeFormat('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(d))
}

function vigencia(a: PlatformAnnouncement): { label: string; status: 'scheduled' | 'active' | 'expired' } {
  const now = Date.now()
  const start = new Date(a.startsAt).getTime()
  const end = a.endsAt ? new Date(a.endsAt).getTime() : null
  const range = `${fmtDateTime(a.startsAt)} → ${a.endsAt ? fmtDateTime(a.endsAt) : 'sin fecha de fin'}`
  if (start > now) return { label: range, status: 'scheduled' }
  if (end != null && end < now) return { label: range, status: 'expired' }
  return { label: range, status: 'active' }
}

const STATUS_BADGE = {
  scheduled: { label: 'Programado', variant: 'outline' as const },
  active: { label: 'Vigente', variant: 'success' as const },
  expired: { label: 'Finalizado', variant: 'secondary' as const },
}

export function PlatformAnnouncementsPage() {
  const { data: announcements = [], isLoading } = usePlatformAnnouncements()
  const deleteAnnouncement = useDeleteAnnouncement()
  const { can } = usePlatformRole()
  const canManage = can('announcements')
  const [createOpen, setCreateOpen] = useState(false)

  const remove = async (a: PlatformAnnouncement) => {
    const ok = await confirmDialog({
      title: '¿Eliminar este aviso?',
      description: `"${a.title}" dejará de mostrarse a las instituciones.`,
      confirmText: 'Eliminar',
      destructive: true,
    })
    if (ok) deleteAnnouncement.mutate(a.id)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Avisos globales</h1>
          <p className="text-sm text-slate-500">Mensajes que se muestran como banner a todas las instituciones</p>
        </div>
        {canManage && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo aviso
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : announcements.length === 0 ? (
        <Card>
          <EmptyState icon={Megaphone} title="Sin avisos" description="Publica un aviso para informar mantenimientos, novedades o incidencias." />
        </Card>
      ) : (
        <div className="space-y-3">
          {announcements.map((a) => {
            const v = vigencia(a)
            const level = LEVEL_CONFIG[a.level] ?? LEVEL_CONFIG.info
            return (
              <Card key={a.id} className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{a.title}</span>
                      <Badge variant={level.variant}>{level.label}</Badge>
                      <Badge variant={STATUS_BADGE[v.status].variant}>{STATUS_BADGE[v.status].label}</Badge>
                      <span className="text-xs text-slate-500">{AUDIENCE_LABELS[a.audience] ?? a.audience}</span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-slate-600">{a.body}</p>
                    <p className="text-xs text-slate-400">
                      Vigencia: {v.label}
                      {a.createdBy && <> · Creado por {a.createdBy}</>}
                    </p>
                  </div>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-slate-400 hover:text-red-600"
                      aria-label={`Eliminar aviso ${a.title}`}
                      onClick={() => remove(a)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {canManage && <CreateAnnouncementDialog open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}

function CreateAnnouncementDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateAnnouncement()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [level, setLevel] = useState<AnnouncementLevel>('info')
  const [audience, setAudience] = useState<AnnouncementAudience>('all')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setTitle('')
    setBody('')
    setLevel('info')
    setAudience('all')
    setStartsAt('')
    setEndsAt('')
    setError(null)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return setError('Ingresa un título.')
    if (!body.trim()) return setError('Ingresa el mensaje.')
    // datetime-local llega en hora local sin zona: new Date() lo interpreta como local.
    const startIso = startsAt ? new Date(startsAt).toISOString() : undefined
    const endIso = endsAt ? new Date(endsAt).toISOString() : null
    if (endIso && new Date(endIso).getTime() <= new Date(startIso ?? Date.now()).getTime()) {
      return setError('La fecha de fin debe ser posterior al inicio.')
    }
    setError(null)
    create.mutate(
      { title: title.trim(), body: body.trim(), level, audience, startsAt: startIso, endsAt: endIso },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Nuevo aviso</DialogTitle>
            <DialogDescription>Se mostrará como banner en la app de las instituciones durante su vigencia.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="ann-title">Título</Label>
              <Input id="ann-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-body">Mensaje</Label>
              <Textarea id="ann-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nivel</Label>
                <Select value={level} onValueChange={(v) => setLevel(v as AnnouncementLevel)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(LEVEL_CONFIG) as AnnouncementLevel[]).map((l) => (
                      <SelectItem key={l} value={l}>{LEVEL_CONFIG[l].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Audiencia</Label>
                <Select value={audience} onValueChange={(v) => setAudience(v as AnnouncementAudience)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(AUDIENCE_LABELS) as AnnouncementAudience[]).map((a) => (
                      <SelectItem key={a} value={a}>{AUDIENCE_LABELS[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ann-start">Inicio (opcional)</Label>
                <Input id="ann-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ann-end">Fin (opcional)</Label>
                <Input id="ann-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Sin inicio se publica de inmediato; sin fin queda vigente hasta eliminarlo.</p>
            {error && <p className="text-xs text-red-500">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" loading={create.isPending}>Publicar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
