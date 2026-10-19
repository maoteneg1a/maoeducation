import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { MessageSquare, Phone, Building2, MapPin, Users, Calendar, ClipboardEdit, ArrowRightCircle, AlarmClock, UserRound, StickyNote } from 'lucide-react'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
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
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { cn } from '@/shared/lib/utils'
import type { Lead, PlatformTeamMember } from '../api/platform.api'
import { usePlatformLeads, usePlatformRole, usePlatformTeam, useUpdateLead } from '../hooks/usePlatform'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  new:            { label: 'Nuevo',          variant: 'default' },
  contacted:      { label: 'Contactado',     variant: 'secondary' },
  demo_scheduled: { label: 'Demo agendada',  variant: 'outline' },
  closed_won:     { label: '✓ Cliente',      variant: 'default' },
  closed_lost:    { label: 'No calificó',    variant: 'destructive' },
}

const ROLE_LABEL: Record<string, string> = {
  rector: 'Rector/Director',
  dueño: 'Propietario',
  docente: 'Docente',
  administrativo: 'Administrativo',
  otro: 'Otro',
}

function fmtDate(d: string) {
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
}

function fmtDay(d: string) {
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d))
}

const CLOSED = new Set(['closed_won', 'closed_lost'])

/** Seguimiento vencido: fecha pasada y el lead sigue abierto. */
function isOverdue(lead: Lead) {
  return !!lead.nextFollowUpAt && !CLOSED.has(lead.status) && new Date(lead.nextFollowUpAt).getTime() < Date.now()
}

/** ISO → valor de <input type="date"> en hora local. */
function toDateInput(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const NO_OWNER = '__none__'

export function LeadsPage() {
  const navigate = useNavigate()
  const { data: leads = [], isLoading } = usePlatformLeads({ refetchInterval: 60_000 }) // actualiza cada minuto
  const { data: team = [] } = usePlatformTeam()
  const { can, isOwner } = usePlatformRole()
  const canEdit = can('leads')
  const updateLead = useUpdateLead()
  const [followUpLead, setFollowUpLead] = useState<Lead | null>(null)

  const overdueCount = leads.filter(isOverdue).length
  const byStatus = (s: string) => leads.filter((l) => l.status === s).length
  const total = leads.length

  if (isLoading) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads de la landing</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Solicitudes de demo recibidas desde auleka.com
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <span className="rounded-full bg-blue-100 px-3 py-1 font-semibold text-blue-700">{byStatus('new')} nuevos</span>
          <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{byStatus('contacted')} contactados</span>
          <span className="rounded-full bg-green-100 px-3 py-1 font-semibold text-green-700">{byStatus('closed_won')} clientes</span>
          {overdueCount > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 font-semibold text-red-700">{overdueCount} seguimientos vencidos</span>
          )}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">{total} total</span>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-20 text-center">
          <MessageSquare className="h-8 w-8 mx-auto text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">Aún no hay leads. Cuando alguien llene el formulario de la landing aparecerá aquí.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              owner={team.find((m) => m.id === lead.ownerAdminId)}
              canEdit={canEdit}
              canConvert={isOwner}
              onStatusChange={(status) => updateLead.mutate({ id: lead.id, data: { status } })}
              onFollowUp={() => setFollowUpLead(lead)}
              onConvert={() => navigate(`/platform?newFromLead=${lead.id}`)}
            />
          ))}
        </div>
      )}

      <FollowUpDialog lead={followUpLead} team={team} onClose={() => setFollowUpLead(null)} />
    </div>
  )
}

function LeadCard({
  lead,
  owner,
  canEdit,
  canConvert,
  onStatusChange,
  onFollowUp,
  onConvert,
}: {
  lead: Lead
  owner?: PlatformTeamMember
  canEdit: boolean
  canConvert: boolean
  onStatusChange: (s: string) => void
  onFollowUp: () => void
  onConvert: () => void
}) {
  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG['new']
  const overdue = isOverdue(lead)

  return (
    <div
      className={cn(
        'rounded-xl border bg-white p-5 shadow-sm hover:shadow-md transition-shadow',
        overdue && 'border-red-300 ring-1 ring-red-200',
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        {/* Info principal */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900">{lead.name}</span>
            {lead.role && (
              <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                {ROLE_LABEL[lead.role] ?? lead.role}
              </span>
            )}
            <Badge variant={cfg.variant} className="text-xs">{cfg.label}</Badge>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <a href={`mailto:${lead.email}`} className="flex items-center gap-1 hover:text-blue-600">
              <MessageSquare className="h-3.5 w-3.5" />
              {lead.email}
            </a>
            {lead.phone && (
              <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener" className="flex items-center gap-1 hover:text-green-600">
                <Phone className="h-3.5 w-3.5" />
                {lead.phone}
              </a>
            )}
            {lead.institutionName && (
              <span className="flex items-center gap-1">
                <Building2 className="h-3.5 w-3.5" />
                {lead.institutionName}
              </span>
            )}
            {lead.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {lead.city}
              </span>
            )}
            {lead.studentsCount != null && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {lead.studentsCount} estudiantes
              </span>
            )}
          </div>

          {lead.message && (
            <p className="text-sm text-slate-500 italic border-l-2 border-slate-200 pl-3">
              "{lead.message}"
            </p>
          )}

          {lead.notes && (
            <p className="flex items-start gap-1.5 text-sm text-slate-600">
              <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="whitespace-pre-wrap line-clamp-3">{lead.notes}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <Calendar className="h-3 w-3" />
            {fmtDate(lead.createdAt)}
            <span className="text-slate-300">·</span>
            <span>Fuente: {lead.source}</span>
            {lead.nextFollowUpAt && (
              <>
                <span className="text-slate-300">·</span>
                <span className={cn('flex items-center gap-1', overdue ? 'font-semibold text-red-600' : 'text-slate-600')}>
                  <AlarmClock className="h-3 w-3" />
                  {overdue ? 'Seguimiento vencido' : 'Próximo seguimiento'}: {fmtDay(lead.nextFollowUpAt)}
                </span>
              </>
            )}
            {owner && (
              <>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 text-slate-600">
                  <UserRound className="h-3 w-3" />
                  {owner.name}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Estado y acciones */}
        <div className="sm:ml-4 sm:shrink-0 w-full sm:w-52 space-y-2">
          <Select value={lead.status} onValueChange={onStatusChange} disabled={!canEdit}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                <SelectItem key={value} value={value} className="text-xs">
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canEdit && (
            <Button variant="outline" size="sm" className="w-full" onClick={onFollowUp}>
              <ClipboardEdit className="h-3.5 w-3.5" />
              Seguimiento
            </Button>
          )}
          {lead.convertedInstitutionId ? (
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link to={`/platform/institutions/${lead.convertedInstitutionId}`}>
                <Building2 className="h-3.5 w-3.5" />
                Ver institución
              </Link>
            </Button>
          ) : (
            canConvert && lead.status !== 'closed_lost' && (
              <Button variant="ghost" size="sm" className="w-full" onClick={onConvert}>
                <ArrowRightCircle className="h-3.5 w-3.5" />
                Convertir en institución
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  )
}

function FollowUpDialog({ lead, team, onClose }: { lead: Lead | null; team: PlatformTeamMember[]; onClose: () => void }) {
  const updateLead = useUpdateLead()
  const [notes, setNotes] = useState('')
  const [nextFollowUp, setNextFollowUp] = useState('')
  const [ownerId, setOwnerId] = useState(NO_OWNER)
  const [status, setStatus] = useState('new')

  // Precarga los campos al abrir con otro lead.
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if ((lead?.id ?? null) !== loadedId) {
    setLoadedId(lead?.id ?? null)
    if (lead) {
      setNotes(lead.notes ?? '')
      setNextFollowUp(toDateInput(lead.nextFollowUpAt))
      setOwnerId(lead.ownerAdminId ?? NO_OWNER)
      setStatus(lead.status)
    }
  }

  const save = () => {
    if (!lead) return
    // Fecha local a las 09:00 para que no se corra de día por la zona horaria.
    const nextIso = nextFollowUp ? new Date(`${nextFollowUp}T09:00:00`).toISOString() : null
    updateLead.mutate(
      {
        id: lead.id,
        data: {
          notes,
          status,
          nextFollowUpAt: nextIso,
          ownerAdminId: ownerId === NO_OWNER ? null : ownerId,
        },
      },
      { onSuccess: onClose },
    )
  }

  const activeTeam = team.filter((m) => m.isActive || m.id === lead?.ownerAdminId)

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seguimiento — {lead?.name}</DialogTitle>
          <DialogDescription>{lead?.institutionName ?? lead?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lead-notes">Notas</Label>
            <Textarea
              id="lead-notes"
              rows={5}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Llamadas, acuerdos, objeciones, próximos pasos…"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lead-next">Próximo seguimiento</Label>
              <Input id="lead-next" type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_CONFIG).map(([value, { label }]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Responsable</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>Sin asignar</SelectItem>
                {activeTeam.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} loading={updateLead.isPending}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
