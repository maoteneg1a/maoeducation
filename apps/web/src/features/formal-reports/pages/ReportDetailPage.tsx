import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, CheckCircle2, Download, FileDown, GitBranch, Loader2, Lock, Paperclip, Save, Send, Trash2, Undo2, Upload, CopyPlus,
} from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { formalReportsApi, getCaseAttachments, type FormalReport } from '../api/formal-reports.api'
import { ReportStatusBadge } from '../components/ReportStatusBadge'
import { SnapshotView } from '../components/SnapshotView'

const fmtDT = (d: string | null) =>
  d ? new Date(d).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

export function ReportDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: r, isLoading } = useQuery({ queryKey: ['formal-report', id], queryFn: () => formalReportsApi.get(id), enabled: !!id })
  const { data: flow } = useQuery({ queryKey: ['reports-flow'], queryFn: formalReportsApi.reportsFlow, staleTime: 60_000 })
  const [content, setContent] = React.useState<Record<string, string>>({})
  const [dirty, setDirty] = React.useState(false)
  const [dialog, setDialog] = React.useState<null | 'return' | 'attend' | 'derive' | 'fromCase'>(null)

  React.useEffect(() => {
    if (r) { setContent(r.content ?? {}); setDirty(false) }
  }, [r])

  const setReport = (next: FormalReport) => {
    qc.setQueryData(['formal-report', id], next)
    qc.invalidateQueries({ queryKey: ['formal-reports'] })
    qc.invalidateQueries({ queryKey: ['formal-reports-counts'] })
    qc.invalidateQueries({ queryKey: ['dossier'] })
  }
  const onErr = (e: unknown) => toast.error(getErrorMessage(e))

  const preview = useQuery({
    queryKey: ['formal-report-preview', id],
    queryFn: () => formalReportsApi.snapshotPreview(id),
    enabled: !!r && r.status === 'DRAFT' && r.permissions.isAuthor,
  })

  const save = useMutation({ mutationFn: () => formalReportsApi.update(id, content), onSuccess: (x) => { setReport(x); toast.success('Borrador guardado') }, onError: onErr })
  const send = useMutation({
    mutationFn: async () => { if (dirty) await formalReportsApi.update(id, content); return formalReportsApi.send(id) },
    onSuccess: (x) => { setReport(x); toast.success(`Informe enviado con folio ${x.folio}`) },
    onError: onErr,
  })
  const remove = useMutation({ mutationFn: () => formalReportsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['formal-reports'] }); qc.invalidateQueries({ queryKey: ['dossier'] }); toast.success('Borrador eliminado'); navigate('/informes') }, onError: onErr })
  const receive = useMutation({ mutationFn: () => formalReportsApi.receive(id), onSuccess: (x) => { setReport(x); toast.success('Acuse de recibo registrado') }, onError: onErr })
  const newVersion = useMutation({ mutationFn: () => formalReportsApi.newVersion(id), onSuccess: (x) => navigate(`/informes/${x.id}`), onError: onErr })
  const upload = useMutation({
    mutationFn: ({ file, category }: { file: File; category: string }) => formalReportsApi.uploadAttachment(id, file, category),
    onSuccess: (x) => { setReport(x); toast.success('Anexo agregado') },
    onError: onErr,
  })
  const delAtt = useMutation({ mutationFn: (aid: string) => formalReportsApi.removeAttachment(id, aid), onSuccess: setReport, onError: onErr })

  if (isLoading || !r) return <PageLoader />

  const fields = r.typeConfig.fields ?? []
  const missing = fields.filter((f) => f.required && !content[f.key]?.trim())
  const snapshot = r.status === 'DRAFT' ? preview.data ?? {} : r.snapshot
  const categories = flow?.config.attachments.categories ?? [{ key: 'otro', label: 'Otro', visibleToRoles: [] }]

  const onSend = async () => {
    if (missing.length) { toast.error(`Completa: ${missing.map((m) => m.label).join(', ')}`); return }
    const ok = await confirmDialog({
      title: 'Enviar informe',
      description: `Se enviará a ${r.recipientInstanceLabel}. Al enviarlo recibe un folio y queda inmutable: ya no podrás editarlo (si te lo devuelven, podrás crear una nueva versión).`,
      confirmText: 'Enviar',
    })
    if (ok) send.mutate()
  }

  const timeline: Array<[string, string | null]> = [
    ['Creado', fmtDT(r.createdAt)],
    ['Enviado', fmtDT(r.sentAt)],
    ['Plazo de acuse', fmtDT(r.ackDeadlineAt)],
    ['Acuse de recibo', fmtDT(r.receivedAt)],
    ['Devuelto', fmtDT(r.returnedAt)],
    ['Atendido', fmtDT(r.attendedAt)],
    ['Escalado', fmtDT(r.escalatedAt)],
  ]

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <Link to="/informes" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Informes
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{r.typeLabel}</h1>
            <ReportStatusBadge status={r.status} overdue={r.overdue} />
            {r.confidential && <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Confidencial</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono">{r.folio ?? 'Sin folio (borrador)'}</span> · De {r.author.name} para {r.recipientInstanceLabel}
            {r.student && <> · Estudiante: <b>{r.student.name}</b></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r.typeConfig.pdfTemplate && <Button variant="outline" onClick={() => formalReportsApi.downloadDocx(id, `${r.folio ?? 'borrador'}-${r.typeKey}.docx`).catch(onErr)} disabled={r.contentHidden}>
            <Download className="mr-2 h-4 w-4" /> Word
          </Button>}
          <Button variant="outline" onClick={() => formalReportsApi.downloadPdf(id, `${r.folio ?? 'borrador'}-${r.typeKey}.pdf`).catch(onErr)} disabled={r.contentHidden}>
            <FileDown className="mr-2 h-4 w-4" /> PDF
          </Button>
          {r.permissions.canEdit && (
            <>
              <Button variant="outline" onClick={() => confirmDialog({ title: 'Eliminar borrador', description: 'Se eliminará el borrador y sus anexos.', destructive: true, confirmText: 'Eliminar' }).then((ok) => ok && remove.mutate())}>
                <Trash2 className="mr-2 h-4 w-4" /> Eliminar
              </Button>
              <Button variant="outline" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
                {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Guardar
              </Button>
              <Button disabled={send.isPending} onClick={onSend}>
                {send.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />} Enviar
              </Button>
            </>
          )}
          {r.permissions.canReceive && (
            <Button disabled={receive.isPending} onClick={() => receive.mutate()}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Acusar recibo
            </Button>
          )}
          {r.permissions.canReturn && (
            <Button variant="outline" onClick={() => setDialog('return')}><Undo2 className="mr-2 h-4 w-4" /> Devolver</Button>
          )}
          {r.permissions.canAttend && (
            <Button variant="outline" onClick={() => setDialog('attend')}><CheckCircle2 className="mr-2 h-4 w-4" /> Marcar atendido</Button>
          )}
          {r.permissions.canDerive && (r.typeConfig.canDeriveTo?.length ?? 0) > 0 && (
            <Button variant="outline" onClick={() => setDialog('derive')}><GitBranch className="mr-2 h-4 w-4" /> Derivar</Button>
          )}
          {r.permissions.canNewVersion && (
            <Button onClick={() => newVersion.mutate()} disabled={newVersion.isPending}><CopyPlus className="mr-2 h-4 w-4" /> Crear nueva versión</Button>
          )}
        </div>
      </div>

      {r.status === 'RETURNED' && r.returnNote && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="p-4 text-sm"><p className="font-medium text-amber-800">Devuelto con observaciones</p><p className="mt-1 whitespace-pre-wrap">{r.returnNote}</p></CardContent></Card>
      )}
      {r.responseNote && (
        <Card className="border-emerald-300 bg-emerald-50"><CardContent className="p-4 text-sm"><p className="font-medium text-emerald-800">Respuesta / atención</p><p className="mt-1 whitespace-pre-wrap">{r.responseNote}</p></CardContent></Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {r.contentHidden ? (
            <Card><CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground"><Lock className="h-5 w-5" /> Contenido confidencial: solo lo ven el autor y los destinatarios.</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader><CardTitle className="text-base">Contenido</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {fields.length === 0 && <p className="text-sm text-muted-foreground">Este informe no tiene campos de texto.</p>}
                  {fields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                      {r.permissions.canEdit ? (
                        f.type === 'textarea' ? (
                          <Textarea rows={4} value={content[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setContent({ ...content, [f.key]: e.target.value }); setDirty(true) }} />
                        ) : (
                          <Input type={f.type === 'date' ? 'date' : 'text'} value={content[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setContent({ ...content, [f.key]: e.target.value }); setDirty(true) }} />
                        )
                      ) : (
                        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{r.content[f.key]?.trim() || '—'}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Datos del sistema</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {r.status === 'DRAFT' ? 'Vista previa: se congelan al enviar el informe.' : 'Congelados al momento del envío.'}
                  </p>
                </CardHeader>
                <CardContent>
                  {r.status === 'DRAFT' && preview.isLoading ? <PageLoader /> : <SnapshotView snapshot={snapshot} />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base"><Paperclip className="h-4 w-4" /> Anexos</CardTitle>
                  {r.permissions.canEdit && (
                    <div className="flex gap-2">
                      {r.reinforcementPlanId && (
                        <Button size="sm" variant="outline" onClick={() => setDialog('fromCase')}>Agregar desde el caso</Button>
                      )}
                      <UploadButton categories={categories} accept={flow?.config.attachments.allowedMime} busy={upload.isPending} onUpload={(file, category) => upload.mutate({ file, category })} />
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {r.attachments.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin anexos.</p>
                  ) : (
                    <ul className="divide-y">
                      {r.attachments.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <div>
                            <p className="font-medium">{a.fileName}</p>
                            <p className="text-xs text-muted-foreground">{categories.find((c) => c.key === a.category)?.label ?? a.category} · {kb(a.fileSize)}</p>
                          </div>
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" onClick={() => formalReportsApi.downloadAttachment(id, a.id, a.fileName).catch(onErr)}><Download className="h-4 w-4" /></Button>
                            {r.permissions.canEdit && <Button size="icon" variant="ghost" onClick={() => delAtt.mutate(a.id)}><Trash2 className="h-4 w-4" /></Button>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Trazabilidad</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {timeline.filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div>
              ))}
              {r.contentHash && <p className="break-all pt-2 font-mono text-[10px] text-muted-foreground">Huella: {r.contentHash}</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Destinatarios</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="text-muted-foreground">{r.recipientInstanceLabel}</p>
              {r.recipients.length === 0 ? <p className="text-xs text-muted-foreground">Se resuelven al enviar.</p> : r.recipients.map((x) => (
                <div key={x.userId} className="flex justify-between gap-3">
                  <span>{x.name}</span>
                  <span className="text-xs text-muted-foreground">{x.readAt ? `Leído ${fmtDT(x.readAt)}` : 'Sin leer'}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          {(r.parentReport || r.previousVersionId || r.derived.length > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Relacionados</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {r.parentReport && <p>Derivado de: <Link className="text-primary hover:underline" to={`/informes/${r.parentReport.id}`}>{r.parentReport.folio ?? 'borrador'} · {r.parentReport.typeLabel}</Link></p>}
                {r.previousVersionId && <p>Versión anterior: <Link className="text-primary hover:underline" to={`/informes/${r.previousVersionId}`}>ver</Link></p>}
                {r.derived.map((d) => (
                  <p key={d.id}>Derivación: <Link className="text-primary hover:underline" to={`/informes/${d.id}`}>{d.folio ?? 'borrador'} · {d.typeLabel}</Link> → {d.recipientInstanceLabel} <ReportStatusBadge status={d.status} /></p>
                ))}
              </CardContent>
            </Card>
          )}
          {r.reinforcementPlanId && (
            <Card><CardContent className="p-4 text-sm"><Link className="text-primary hover:underline" to={`/refuerzo/casos/${r.reinforcementPlanId}`}>Ver caso de refuerzo vinculado</Link></CardContent></Card>
          )}
        </div>
      </div>

      <NoteDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Devolver con observaciones"
        description="El autor verá tus observaciones y podrá crear una nueva versión."
        required
        confirm="Devolver"
        onConfirm={(note) => formalReportsApi.returnReport(id, note).then((x) => { setReport(x); setDialog(null); toast.success('Informe devuelto') })}
      />
      <NoteDialog
        open={dialog === 'attend'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Marcar como atendido"
        description="Registra la respuesta o acción tomada (opcional)."
        confirm="Marcar atendido"
        onConfirm={(note) => formalReportsApi.attend(id, note || undefined).then((x) => { setReport(x); setDialog(null); toast.success('Informe atendido') })}
      />
      <DeriveDialog
        open={dialog === 'derive'}
        onOpenChange={(o) => !o && setDialog(null)}
        report={r}
        types={(flow?.config.reportTypes ?? []).filter((t) => t.enabled && (r.typeConfig.canDeriveTo ?? []).includes(t.to))}
        instanceLabel={(k) => flow?.config.instances.find((i) => i.key === k)?.label ?? k}
        onDerived={(newId) => navigate(`/informes/${newId}`)}
      />
      {r.reinforcementPlanId && (
        <FromCaseDialog
          open={dialog === 'fromCase'}
          onOpenChange={(o) => !o && setDialog(null)}
          planId={r.reinforcementPlanId}
          onConfirm={(ids) => formalReportsApi.copyFromCase(id, ids).then((x) => { setReport(x); setDialog(null); toast.success('Anexos copiados') })}
        />
      )}
    </div>
  )
}

function UploadButton({ categories, accept, busy, onUpload }: { categories: Array<{ key: string; label: string }>; accept?: string[]; busy: boolean; onUpload: (file: File, category: string) => void }) {
  const [category, setCategory] = React.useState(categories[0]?.key ?? 'otro')
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <div className="flex gap-2">
      <Select value={category} onValueChange={setCategory}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>{categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <input
        ref={ref}
        type="file"
        className="hidden"
        accept={accept?.join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f, category); e.target.value = '' }}
      />
      <Button size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Subir
      </Button>
    </div>
  )
}

function NoteDialog({ open, onOpenChange, title, description, confirm, required, onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirm: string; required?: boolean; onConfirm: (note: string) => Promise<unknown>
}) {
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open) setNote('') }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <Textarea rows={5} value={note} onChange={(e) => setNote(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={busy || (required && !note.trim())}
            onClick={() => { setBusy(true); onConfirm(note.trim()).catch((e) => toast.error(getErrorMessage(e))).finally(() => setBusy(false)) }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeriveDialog({ open, onOpenChange, report, types, instanceLabel, onDerived }: {
  open: boolean; onOpenChange: (o: boolean) => void; report: FormalReport
  types: Array<{ key: string; label: string; to: string }>; instanceLabel: (k: string) => string; onDerived: (id: string) => void
}) {
  const [typeKey, setTypeKey] = React.useState('')
  const derive = useMutation({
    mutationFn: () => formalReportsApi.derive(report.id, typeKey),
    onSuccess: (x) => { onOpenChange(false); toast.success('Borrador de derivación creado'); onDerived(x.id) },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  React.useEffect(() => { if (open) setTypeKey(types[0]?.key ?? '') }, [open, types])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Derivar caso</DialogTitle>
          <DialogDescription>Se crea un borrador con el mismo estudiante, asignatura y alerta, vinculado a este informe.</DialogDescription>
        </DialogHeader>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tipos de informe configurados para las instancias de derivación.</p>
        ) : (
          <Select value={typeKey} onValueChange={setTypeKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label} → {instanceLabel(t.to)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!typeKey || derive.isPending} onClick={() => derive.mutate()}>Crear borrador</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FromCaseDialog({ open, onOpenChange, planId, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; planId: string; onConfirm: (ids: string[]) => Promise<unknown> }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['case-attachments', planId], queryFn: () => getCaseAttachments(planId), enabled: open })
  const [ids, setIds] = React.useState<string[]>([])
  const [busy, setBusy] = React.useState(false)
  React.useEffect(() => { if (open) setIds([]) }, [open])
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agregar archivos del caso</DialogTitle>
          <DialogDescription>Se copian al informe: si luego se borran del caso, el informe los conserva.</DialogDescription>
        </DialogHeader>
        {isLoading ? <PageLoader /> : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">El caso no tiene archivos visibles para ti.</p>
        ) : (
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {data.map((a) => (
              <li key={a.id}>
                <label className="flex items-center gap-2 rounded p-2 text-sm hover:bg-muted/50">
                  <input type="checkbox" checked={ids.includes(a.id)} onChange={(e) => setIds(e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} />
                  <span className="font-medium">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground">{a.categoryLabel} · {kb(a.fileSize)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!ids.length || busy} onClick={() => { setBusy(true); onConfirm(ids).catch((e) => toast.error(getErrorMessage(e))).finally(() => setBusy(false)) }}>
            Agregar ({ids.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
