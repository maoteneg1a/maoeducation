import { useRef, useState } from 'react'
import { CommitmentForm } from '../components/CommitmentForm'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowLeft, Upload, Download, Trash2, Send, FileText, UserCheck, Clock,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Label } from '@/shared/components/ui/label'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/shared/components/ui/select'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { usePermissions } from '@/shared/hooks/usePermissions'
import {
  getIncident, changeIncidentState, assignDece, addIncidentEvent, notifyGuardian,
  listCommitments, downloadCommitmentPdf, uploadEvidence, deleteEvidence,
  getUsers, getIncidentAttachmentUrl, type Incident,
} from '../api/incidents.api'
import { openProtectedFile } from '@/shared/lib/protected-file'

const WORKFLOW_STATES = [
  'reportado', 'en_revision', 'derivado_dece', 'medidas_definidas',
  'acta_firmada', 'en_seguimiento', 'resuelto', 'cerrado',
]
const WORKFLOW_LABELS: Record<string, string> = {
  reportado: 'Reportado', en_revision: 'En revisión', derivado_dece: 'Derivado al DECE',
  medidas_definidas: 'Medidas definidas', acta_firmada: 'Acta firmada',
  en_seguimiento: 'En seguimiento', resuelto: 'Resuelto', cerrado: 'Cerrado',
}
const SEVERITY_LABELS: Record<string, string> = {
  leve: 'Leve', grave: 'Grave', muy_grave: 'Muy grave',
  low: 'Leve', medium: 'Moderado', high: 'Grave',
}

const personName = (p: { profile: { firstName: string; lastName: string } } | null | undefined) =>
  p?.profile ? `${p.profile.firstName} ${p.profile.lastName}` : '—'

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(y, m - 1, day))
}

export function IncidentDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('incidents:manage')
  const canWrite = hasPermission('incidents:write')
  const fileInput = useRef<HTMLInputElement>(null)

  const [newState, setNewState] = useState('')
  const [deceId, setDeceId] = useState('')
  const [note, setNote] = useState('')

  const incidentQ = useQuery({ queryKey: ['incident', id], queryFn: () => getIncident(id) })
  const commitmentsQ = useQuery({ queryKey: ['incident-commitments', id], queryFn: () => listCommitments(id) })
  const deceUsersQ = useQuery({
    queryKey: ['users', 'dece'],
    queryFn: () => getUsers({ role: 'dece' }).then((r) => r.data),
    enabled: canManage,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['incident', id] })
    qc.invalidateQueries({ queryKey: ['incident-commitments', id] })
  }

  const mState = useMutation({
    mutationFn: () => changeIncidentState(id, { workflowState: newState, note: note || undefined }),
    onSuccess: () => { toast.success('Estado actualizado'); setNote(''); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const mDece = useMutation({
    mutationFn: () => assignDece(id, { deceId }),
    onSuccess: () => { toast.success('Caso derivado al DECE'); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const mNote = useMutation({
    mutationFn: () => addIncidentEvent(id, { description: note }),
    onSuccess: () => { toast.success('Nota agregada'); setNote(''); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const mNotify = useMutation({
    mutationFn: () => notifyGuardian(id),
    onSuccess: (r) => { toast.success(`Representante(s) notificado(s): ${r.notified}`); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const mUpload = useMutation({
    mutationFn: (file: File) => uploadEvidence(id, file),
    onSuccess: () => { toast.success('Evidencia adjuntada'); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const mDeleteAtt = useMutation({
    mutationFn: (attId: string) => deleteEvidence(id, attId),
    onSuccess: () => { toast.success('Evidencia eliminada'); refresh() },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  if (incidentQ.isLoading || !incidentQ.data) return <PageLoader />
  const inc: Incident = incidentQ.data

  return (
    <div className="space-y-6 p-6">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-2" onClick={() => navigate('/incidents')}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Incidentes
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{personName(inc.student)}</h1>
          <Badge variant="warning">{WORKFLOW_LABELS[inc.workflowState] ?? inc.workflowState}</Badge>
          <Badge variant="secondary">{SEVERITY_LABELS[inc.severity] ?? inc.severity}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {inc.incidentType?.name ?? inc.category} · {fmtDate(inc.incidentDate)}
          {' · '}Reportado por {personName(inc.reporter)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Columna principal */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Descripción</CardTitle></CardHeader>
            <CardContent><p className="text-sm whitespace-pre-wrap">{inc.description}</p></CardContent>
          </Card>

          {/* Bitácora */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" /> Bitácora del proceso</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3 border-l pl-4">
                {(inc.events ?? []).map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" />
                    <p className="text-sm">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {personName(e.actor)} · {fmt(e.createdAt)}
                    </p>
                  </li>
                ))}
                {(inc.events ?? []).length === 0 && (
                  <li className="text-sm text-muted-foreground">Sin eventos.</li>
                )}
              </ol>

              {canWrite && (
                <div className="mt-4 space-y-2">
                  <Label htmlFor="note">Agregar nota / cambiar estado</Label>
                  <textarea
                    id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
                    placeholder="Escribe una nota..."
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={!note || mNote.isPending} onClick={() => mNote.mutate()}>
                      Agregar nota
                    </Button>
                    <div className="w-full sm:w-48">
                      <Select value={newState} onValueChange={setNewState}>
                        <SelectTrigger><SelectValue placeholder="Cambiar estado a..." /></SelectTrigger>
                        <SelectContent>
                          {WORKFLOW_STATES.map((s) => (
                            <SelectItem key={s} value={s}>{WORKFLOW_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" disabled={!newState || mState.isPending} onClick={() => mState.mutate()}>
                      Cambiar estado
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Actas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" /> Actas de compromiso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(commitmentsQ.data ?? []).map((c) => (
                <div key={c.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                  <div>
                    <p className="text-sm">{c.terms}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Seguimiento: {fmtDate(c.followUpDate)}
                      {' · '}{personName(c.creator)}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => downloadCommitmentPdf(id, c.id).catch((e) => toast.error(getErrorMessage(e)))}>
                    <Download className="mr-1.5 h-4 w-4" /> PDF
                  </Button>
                </div>
              ))}
              {(commitmentsQ.data ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin actas.</p>
              )}

              {canWrite && <CommitmentForm incident={inc} onCreated={refresh} />}

            </CardContent>
          </Card>
        </div>

        {/* Columna lateral */}
        <div className="space-y-6">
          {canWrite && (
          <Card>
            <CardHeader><CardTitle>Acciones</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Button
                variant="outline" className="w-full justify-start"
                disabled={mNotify.isPending || !!inc.guardianNotifiedAt}
                onClick={() => mNotify.mutate()}
              >
                <Send className="mr-2 h-4 w-4" />
                {inc.guardianNotifiedAt ? 'Representante notificado' : 'Notificar al representante'}
              </Button>

              {canManage && (
                <div className="space-y-2 rounded-md border p-3">
                  <Label className="flex items-center gap-1.5"><UserCheck className="h-4 w-4" /> Derivar al DECE</Label>
                  <Select value={deceId} onValueChange={setDeceId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar DECE" /></SelectTrigger>
                    <SelectContent>
                      {(deceUsersQ.data ?? []).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="w-full" disabled={!deceId || mDece.isPending} onClick={() => mDece.mutate()}>
                    Derivar
                  </Button>
                  {inc.assignedDece && (
                    <p className="text-xs text-muted-foreground">Asignado a: {personName(inc.assignedDece)}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Evidencias */}
          <Card>
            <CardHeader><CardTitle>Evidencias</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(inc.attachments ?? []).map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <button
                    type="button"
                    onClick={() => openProtectedFile(getIncidentAttachmentUrl(a.storedName), a.fileName).catch(() => toast.error('No se pudo abrir el archivo'))}
                    className="truncate text-left text-primary hover:underline"
                  >
                    {a.fileName}
                  </button>
                  {canWrite && (
                    <Button size="sm" variant="ghost" onClick={() => mDeleteAtt.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {(inc.attachments ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">Sin evidencias.</p>
              )}
              {canWrite && (
                <>
                  <input
                    ref={fileInput} type="file" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) mUpload.mutate(f); e.target.value = '' }}
                  />
                  <Button
                    variant="outline" size="sm" className="w-full"
                    loading={mUpload.isPending} onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" /> Subir evidencia
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
