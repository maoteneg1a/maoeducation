import { MySignatureDialog } from '@/features/user-signature/components/MySignatureDialog'
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
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'
import { formalReportsApi, getCaseAttachments, type FormalReport } from '../api/formal-reports.api'
import { ReportStatusBadge } from '../components/ReportStatusBadge'
import { SnapshotView } from '../components/SnapshotView'

const fmtDT = (d: string | null) =>
  d ? new Date(d).toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

function useExclusiveReportAction() {
  const lock = React.useRef(false)
  const [activeAction, setActiveAction] = React.useState<string | null>(null)
  const runAction = async (key: string, action: () => Promise<unknown>) => {
    // Se adquiere antes del siguiente render para bloquear también el doble clic rápido.
    if (lock.current) return
    lock.current = true
    setActiveAction(key)
    try { await action() } catch (error) { toast.error(getErrorMessage(error)) }
    finally { lock.current = false; setActiveAction(null) }
  }
  return { activeAction, busy: activeAction !== null, runAction }
}

export function ReportDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: r, isLoading, isError, error, refetch } = useQuery({ queryKey: ['formal-report', id], queryFn: () => formalReportsApi.get(id), enabled: !!id })
  React.useEffect(() => {
    if (r) {
      qc.invalidateQueries({ queryKey: ['formal-reports'] })
      qc.invalidateQueries({ queryKey: ['formal-reports-counts'] })
      qc.invalidateQueries({ queryKey: ['early-alerts-v2'] })
      qc.invalidateQueries({ queryKey: ['early-alerts-summary'] })
    }
  }, [r?.id])
  const { data: flow } = useQuery({ queryKey: ['reports-flow'], queryFn: formalReportsApi.reportsFlow, staleTime: 60_000 })
  const [content, setContent] = React.useState<Record<string, string>>({})
  const [signatureOpen, setSignatureOpen] = React.useState(false)
  const [dirty, setDirty] = React.useState(false)
  const { activeAction, busy, runAction } = useExclusiveReportAction()
  const [dialog, setDialog] = React.useState<null | 'return' | 'attend' | 'derive' | 'fromCase'>(null)

  React.useEffect(() => {
    if (r) {
      const next = { ...r.content }
      const needsDate = r.permissions.canEdit && !next.fecha_documento?.trim() && r.typeConfig.fields?.some((f) => f.key === 'fecha_documento' && f.type === 'date')
      if (needsDate) {
        const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
        const part = (name: string) => parts.find((p) => p.type === name)!.value
        next.fecha_documento = `${part('year')}-${part('month')}-${part('day')}`
      }
      setContent(next); setDirty(!!needsDate)
    }
  }, [r])

  const setReport = (next: FormalReport) => {
    qc.invalidateQueries({ queryKey: ['early-alerts-v2'] })
    qc.invalidateQueries({ queryKey: ['early-alerts-summary'] })
    qc.setQueryData(['formal-report', id], next)
    qc.invalidateQueries({ queryKey: ['formal-reports'] })
    qc.invalidateQueries({ queryKey: ['formal-reports-counts'] })
    qc.invalidateQueries({ queryKey: ['dossier'] })
  }

  const preview = useQuery({
    queryKey: ['formal-report-preview', id],
    queryFn: () => formalReportsApi.snapshotPreview(id),
    enabled: !!r && r.status === 'DRAFT' && r.permissions.isAuthor,
  })

  const save = useMutation({ mutationFn: () => formalReportsApi.update(id, content), onSuccess: (x) => { setReport(x); toast.success('Borrador guardado') } })
  const send = useMutation({
    mutationFn: async () => { if (dirty) await formalReportsApi.update(id, content); return formalReportsApi.send(id) },
    onSuccess: (x) => { setReport(x); toast.success(`Informe enviado con folio ${x.folio}`) },
  })
  const remove = useMutation({ mutationFn: () => formalReportsApi.remove(id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['formal-reports'] }); qc.invalidateQueries({ queryKey: ['dossier'] }); qc.invalidateQueries({ queryKey: ['early-alerts-v2'] }); qc.invalidateQueries({ queryKey: ['early-alerts-summary'] }); toast.success('Borrador eliminado'); navigate('/informes') } })
  const receive = useMutation({ mutationFn: () => formalReportsApi.receive(id), onSuccess: (x) => { setReport(x); toast.success('Acuse de recibo registrado') } })
  const amendment = useMutation({ mutationFn: () => formalReportsApi.amendment(id), onSuccess: (x) => { qc.invalidateQueries({ queryKey: ['formal-reports'] }); navigate(`/informes/${x.id}`) } })
  const newVersion = useMutation({ mutationFn: () => formalReportsApi.newVersion(id), onSuccess: (x) => navigate(`/informes/${x.id}`) })
  const upload = useMutation({
    mutationFn: ({ file, category }: { file: File; category: string }) => formalReportsApi.uploadAttachment(id, file, category),
    onSuccess: (x) => { setReport(x); toast.success('Anexo agregado') },
  })
  const delAtt = useMutation({ mutationFn: (aid: string) => formalReportsApi.removeAttachment(id, aid), onSuccess: setReport })

  if (isLoading) return <PageLoader />
  if (isError || !r) return <div className="space-y-4 p-6">
    <Link to="/informes" className="text-primary hover:underline">Volver a Informes y reportes</Link>
    <EmptyState title="No se pudo abrir el informe" description={getErrorMessage(error)} />
    <Button variant="outline" onClick={() => refetch()}>Reintentar</Button>
  </div>

  const fields = r.typeConfig.fields ?? []
  const missing = fields.filter((f) => f.required && !content[f.key]?.trim())
  const snapshot = r.status === 'DRAFT' ? preview.data ?? {} : r.snapshot
  const categories = flow?.config.attachments.categories ?? [{ key: 'otro', label: 'Otro', visibleToRoles: [] }]

  const onSend = () => runAction('send', async () => {
    if (missing.length) { toast.error(`Completa: ${missing.map((m) => m.label).join(', ')}`); return }
    const ok = await confirmDialog({
      title: 'Enviar informe',
      description: `Se enviará a ${r.recipientInstanceLabel}. Si guardaste tu firma personal, se incorporará al documento. Al enviarlo recibe un folio y queda inmutable: ya no podrás editarlo (si te lo devuelven, podrás crear una nueva versión).`,
      confirmText: 'Enviar',
    })
    if (ok) await send.mutateAsync()
  })

  const downloadDocument = (format: 'word' | 'pdf') => runAction(format, async () => {
    // El archivo debe reflejar lo que el docente acaba de completar en pantalla.
    if (r.permissions.canEdit && dirty) await save.mutateAsync()
    if (format === 'word') await formalReportsApi.downloadDocx(id, `${r.folio ?? 'borrador'}-${r.typeKey}.docx`)
    else await formalReportsApi.downloadPdf(id, `${r.folio ?? 'borrador'}-${r.typeKey}.pdf`)
  })

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
      <Link to={`/informes?section=documents&box=${r.permissions.isAuthor ? r.status === 'DRAFT' ? 'drafts' : 'sent' : 'inbox'}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Informes
      </Link>
      {r.reinforcementPlanId && <Link className="inline-flex text-sm text-primary hover:underline" to={`/refuerzo/casos/${r.reinforcementPlanId}?tab=documents`}>Volver al plan de refuerzo</Link>}

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
          {r.status === 'DRAFT' && r.typeConfig.pdfTemplate && <Button variant="outline" onClick={() => downloadDocument('word')} disabled={busy || r.contentHidden}>
            <ActionIcon active={activeAction === 'word'} icon={Download} /> {activeAction === 'word' ? 'Preparando Word…' : 'Revisar Word'}
          </Button>}
          {(r.status !== 'DRAFT' || !r.typeConfig.pdfTemplate) && <Button variant="outline" onClick={() => downloadDocument('pdf')} disabled={busy || r.contentHidden}>
            <ActionIcon active={activeAction === 'pdf'} icon={FileDown} /> {activeAction === 'pdf' ? 'Generando PDF…' : r.status === 'DRAFT' ? 'Revisar PDF' : 'PDF para imprimir'}
          </Button>}
          {r.permissions.canEdit && (
            <>
              <Button variant="outline" disabled={busy} onClick={() => runAction('delete', async () => {
                if (await confirmDialog({ title: 'Eliminar borrador', description: 'Se eliminará el borrador y sus anexos.', destructive: true, confirmText: 'Eliminar' })) await remove.mutateAsync()
              })}>
                <ActionIcon active={activeAction === 'delete'} icon={Trash2} /> {remove.isPending ? 'Eliminando…' : 'Eliminar'}
              </Button>
              <Button variant="outline" disabled={!dirty || busy} onClick={() => runAction('save', () => save.mutateAsync())}>
                <ActionIcon active={activeAction === 'save'} icon={Save} /> {activeAction === 'save' ? 'Guardando…' : 'Guardar'}
              </Button>
              <Button disabled={busy || preview.isFetching || missing.length > 0} onClick={onSend}>
                <ActionIcon active={activeAction === 'send'} icon={Send} /> {activeAction === 'send' ? 'Enviando…' : 'Enviar informe'}
              </Button>
            </>
          )}

          {r.permissions.canDerive && (r.typeConfig.canDeriveTo?.length ?? 0) > 0 && (
            <Button variant="outline" disabled={busy} onClick={() => setDialog('derive')}><GitBranch className="mr-2 h-4 w-4" /> Derivar</Button>
          )}
          {r.permissions.isAuthor && r.typeConfig.pdfTemplate === 'annex_alerts' && ['SENT', 'RECEIVED', 'ATTENDED'].includes(r.status) && <Button variant="outline" disabled={busy} onClick={() => runAction('amendment', () => amendment.mutateAsync())}><ActionIcon active={activeAction === 'amendment'} icon={CopyPlus} />{activeAction === 'amendment' ? 'Preparando ampliación…' : 'Preparar ampliación'}</Button>}
          {r.permissions.canNewVersion && (
            <Button onClick={() => runAction('version', () => newVersion.mutateAsync())} disabled={busy}><ActionIcon active={activeAction === 'version'} icon={CopyPlus} /> {activeAction === 'version' ? 'Preparando corrección…' : 'Corregir informe'}</Button>
          )}
        </div>
      </div>

      {r.permissions.canEdit && <p className="text-sm text-muted-foreground">{r.typeConfig.pdfTemplate ? 'Edita los datos en Auleka y revisa el borrador en Word. Los cambios del archivo descargado no se sincronizan. Al enviar tendrás el PDF con folio y firma.' : 'Revisa el borrador antes de enviar. Después del envío podrás descargar el PDF definitivo.'}</p>}
      {r.permissions.canEdit && missing.length > 0 && <p className="text-sm text-amber-700">Para enviar, completa: {missing.map((field) => field.label).join(', ')}.</p>}
      {activeAction === 'pdf' && <p role="status" className="text-sm text-muted-foreground">Preparando el PDF. Puede tardar unos segundos; espera a que termine la descarga.</p>}

      {r.typeConfig.pdfTemplate === 'annex_alerts' && <p className="rounded-lg border bg-muted/30 p-3 text-sm">{r.permissions.canEdit ? 'Este borrador agrupa a los alumnos de la misma asignatura y período. Actualiza la nómina antes de enviar; no necesitas un informe por alumno.' : 'Informe agrupado. Los alumnos adicionales se incorporan en una ampliación vinculada; esta versión conserva lo que se entregó.'}</p>}
      {!!r.subsequentVersions?.length && <div className="rounded-lg border p-3 text-sm"><p className="font-medium">Correcciones y ampliaciones vinculadas</p>{r.subsequentVersions.map((version) => <Link key={version.id} to={`/informes/${version.id}`} className="mt-1 block text-primary hover:underline">{version.folio ?? 'Borrador de actualización'} · {version.status === 'DRAFT' ? 'Por completar' : 'Enviado'}</Link>)}</div>}
      {(r.permissions.canEdit || r.permissions.canReceive) && <p className="text-sm text-muted-foreground">{r.permissions.canEdit ? 'El borrador muestra tu firma guardada como vista previa; se conservará una copia al enviar.' : 'Si guardaste tu firma, se incorporará al registrar el acuse.'} <button disabled={busy} className="font-medium text-primary hover:underline disabled:opacity-50" onClick={() => setSignatureOpen(true)}>Configurar mi firma</button></p>}
      {(r.signatures?.author || r.signatures?.recipient) && <div className="rounded-lg border p-3 text-sm">{r.signatures.author && <p>Firmado al enviar por {r.signatures.author.name} · {fmtDT(r.signatures.author.signedAt)}</p>}{r.signatures.recipient && <p>Firmado al recibir por {r.signatures.recipient.name} · {fmtDT(r.signatures.recipient.signedAt)}</p>}</div>}
      {(r.permissions.canReceive || r.permissions.canReturn || r.permissions.canAttend) && <Card className="border-primary/30 bg-primary/5">
        <CardContent className="space-y-3 p-4">
          <div><h2 className="font-semibold">Acciones del destinatario</h2><p className="mt-1 text-sm text-muted-foreground">{r.permissions.canReceive ? 'Revisa el PDF o Word y confirma que recibiste el informe. Si necesita correcciones, solicita cambios al docente.' : 'La recepción ya quedó registrada. Puedes marcarlo como atendido o solicitar cambios con observaciones.'}</p></div>
          <div className="flex flex-wrap gap-2">
            {r.permissions.canReceive && <Button disabled={busy} onClick={() => runAction('receive', () => receive.mutateAsync())}><ActionIcon active={activeAction === 'receive'} icon={CheckCircle2} />{activeAction === 'receive' ? 'Registrando acuse…' : 'Registrar acuse de recibo'}</Button>}
            {r.permissions.canReturn && <Button variant="outline" disabled={busy} onClick={() => setDialog('return')}><Undo2 className="mr-2 h-4 w-4" />Solicitar cambios</Button>}
            {r.permissions.canAttend && <Button disabled={busy} onClick={() => setDialog('attend')}><CheckCircle2 className="mr-2 h-4 w-4" />Marcar como atendido</Button>}
          </div>
        </CardContent>
      </Card>}
      {!r.permissions.isAuthor && !r.permissions.isRecipient && r.status !== 'DRAFT' && <p className="rounded-lg border bg-muted/30 p-4 text-sm">Estás en modo consulta. El acuse corresponde a los destinatarios registrados: {r.recipients.map((recipient) => recipient.name).join(', ') || r.recipientInstanceLabel}.</p>}
      {r.permissions.isAuthor && r.status === 'SENT' && <p className="rounded-lg border bg-muted/30 p-4 text-sm">Informe enviado a {r.recipientInstanceLabel}. Está pendiente de su acuse de recibo. El formulario se habilita en una versión de corrección si el destinatario solicita cambios.</p>}
      {r.status === 'RETURNED' && r.returnNote && (
        <Card className="border-amber-300 bg-amber-50"><CardContent className="p-4 text-sm"><p className="font-medium text-amber-800">Devuelto con observaciones</p><p className="mt-1 whitespace-pre-wrap">{r.returnNote}</p>{r.permissions.canNewVersion && <p className="mt-2 text-xs">Pulsa Corregir informe para abrir una versión editable. Luego podrás guardarla y enviarla; el informe anterior conservará su historial.</p>}</CardContent></Card>
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
              {r.permissions.canEdit && <Card>
                <CardHeader><CardTitle className="text-base">Contenido</CardTitle></CardHeader>
                <CardContent><fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
                  {fields.length === 0 && <p className="text-sm text-muted-foreground">Este informe no tiene campos de texto.</p>}
                  {fields.map((f) => (
                    <div key={f.key} className="space-y-1">
                      <Label>{f.label}{f.required && <span className="text-destructive"> *</span>}</Label>
                      {r.permissions.canEdit ? (
                        f.key === 'jornada' && r.typeConfig.pdfTemplate ? (
                          <fieldset className="flex flex-wrap gap-3" aria-label="Jornada">
                            {['Matutina', 'Vespertina'].map((shift) => <label key={shift} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 text-sm ${content[f.key]?.trim().toLowerCase() === shift.toLowerCase() ? 'border-primary bg-primary/5 font-medium' : 'hover:bg-muted/40'}`}>
                              <input type="radio" name={`jornada-${r.id}`} value={shift} checked={content[f.key]?.trim().toLowerCase() === shift.toLowerCase()} onChange={() => { setContent({ ...content, [f.key]: shift }); setDirty(true) }} className="h-4 w-4 accent-primary" />{shift}
                            </label>)}
                          </fieldset>
                        ) : r.typeConfig.pdfTemplate && ['entorno', 'agrupacion'].includes(f.key) ? (
                          <Select disabled={busy} value={content[f.key] ?? ''} onValueChange={(value) => { setContent({ ...content, [f.key]: value }); setDirty(true) }}>
                            <SelectTrigger aria-label={f.label}><SelectValue placeholder="Selecciona una opción" /></SelectTrigger>
                            <SelectContent>{[...new Set([...(f.key === 'entorno' ? ['Dentro del aula', 'Extra-clase'] : ['Pequeño grupo', 'Individual']), ...(content[f.key]?.trim() ? [content[f.key]] : [])])].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : f.type === 'textarea' ? (
                          <Textarea rows={4} value={content[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setContent({ ...content, [f.key]: e.target.value }); setDirty(true) }} />
                        ) : (
                          <Input type={f.type === 'date' ? 'date' : 'text'} value={content[f.key] ?? ''} placeholder={f.placeholder} onChange={(e) => { setContent({ ...content, [f.key]: e.target.value }); setDirty(true) }} />
                        )
                      ) : (
                        <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-sm">{r.content[f.key]?.trim() || '—'}</p>
                      )}
                    </div>
                  ))}
                </fieldset></CardContent>
              </Card>}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Datos del sistema</CardTitle>{r.permissions.canEdit && r.typeConfig.pdfTemplate === 'annex_alerts' && <Button variant="outline" size="sm" disabled={busy || preview.isFetching} onClick={() => runAction('roster', async () => { const result = await preview.refetch(); if (result.error) throw result.error })}><ActionIcon active={preview.isFetching} icon={CopyPlus} />{preview.isFetching ? 'Actualizando nómina…' : 'Actualizar nómina'}</Button>}
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
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setDialog('fromCase')}>Agregar desde el caso</Button>
                      )}
                      <UploadButton categories={categories} accept={flow?.config.attachments.allowedMime} busy={busy} uploading={activeAction === 'upload'} onUpload={(file, category) => { void runAction('upload', () => upload.mutateAsync({ file, category })) }} />
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
                            <Button size="icon" variant="ghost" aria-label={`Descargar ${a.fileName}`} disabled={busy} onClick={() => runAction(`attachment-${a.id}`, () => formalReportsApi.downloadAttachment(id, a.id, a.fileName))}><ActionIcon active={activeAction === `attachment-${a.id}`} icon={Download} compact /></Button>
                            {r.permissions.canEdit && <Button size="icon" variant="ghost" aria-label={`Eliminar ${a.fileName}`} disabled={busy} onClick={() => runAction(`remove-${a.id}`, () => delAtt.mutateAsync(a.id))}><ActionIcon active={activeAction === `remove-${a.id}`} icon={Trash2} compact /></Button>}
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

      <MySignatureDialog open={signatureOpen} onOpenChange={setSignatureOpen} />
      <NoteDialog
        open={dialog === 'return'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Solicitar cambios al docente"
        description="El autor verá tus observaciones y podrá crear una nueva versión."
        required
        confirm="Solicitar cambios"
        suggestions={['Completar los datos pendientes del informe.', 'Revisar la nómina de estudiantes y sus resultados.', 'Revisar las fechas y actividades del plan.', 'Adjuntar los respaldos o evidencias faltantes.']}
        onConfirm={(note) => formalReportsApi.returnReport(id, note).then((x) => { setReport(x); setDialog(null); toast.success('Informe devuelto') })}
      />
      <NoteDialog
        open={dialog === 'attend'}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Marcar como atendido"
        description="Registra la respuesta o acción tomada (opcional)."
        confirm="Marcar atendido"
        suggestions={['Informe revisado y seguimiento registrado.', 'Se coordinaron las acciones de acompañamiento correspondientes.', 'Se comunicaron las observaciones al responsable del seguimiento.']}
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

function ActionIcon({ active, icon: Icon, compact = false }: { active: boolean; icon: typeof Download; compact?: boolean }) {
  const Component = active ? Loader2 : Icon
  return <Component aria-hidden className={`${compact ? '' : 'mr-2 '}h-4 w-4${active ? ' animate-spin' : ''}`} />
}

function UploadButton({ categories, accept, busy, uploading, onUpload }: { categories: Array<{ key: string; label: string }>; accept?: string[]; busy: boolean; uploading: boolean; onUpload: (file: File, category: string) => void }) {
  const [category, setCategory] = React.useState(categories[0]?.key ?? 'otro')
  const ref = React.useRef<HTMLInputElement>(null)
  return (
    <div className="flex gap-2">
      <Select value={category} onValueChange={setCategory} disabled={busy}>
        <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
        <SelectContent>{categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
      </Select>
      <input
        ref={ref}
        type="file"
        disabled={busy}
        className="hidden"
        accept={accept?.join(',')}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f, category); e.target.value = '' }}
      />
      <Button size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        <ActionIcon active={uploading} icon={Upload} /> {uploading ? 'Subiendo…' : 'Subir'}
      </Button>
    </div>
  )
}

function NoteDialog({ open, onOpenChange, title, description, confirm, required, onConfirm, suggestions = [] }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; confirm: string; required?: boolean; onConfirm: (note: string) => Promise<unknown>; suggestions?: string[]
}) {
  const [note, setNote] = React.useState('')
  const { busy, runAction } = useExclusiveReportAction()
  React.useEffect(() => { if (open) setNote('') }, [open])
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        {!!suggestions.length && <Select disabled={busy} value={suggestions.includes(note) ? note : ''} onValueChange={setNote}><SelectTrigger aria-label="Seleccionar observación"><SelectValue placeholder="Elige una observación o escribe una propia" /></SelectTrigger><SelectContent>{suggestions.map((suggestion) => <SelectItem key={suggestion} value={suggestion}>{suggestion}</SelectItem>)}</SelectContent></Select>}
        <Textarea aria-label="Observaciones" disabled={busy} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={required ? 'Selecciona una observación o escribe la tuya.' : 'Observación adicional (opcional).'} />
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={busy || (required && !note.trim())}
            onClick={() => runAction('confirm', () => onConfirm(note.trim()))}
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
  const { busy, runAction } = useExclusiveReportAction()
  const derive = useMutation({
    mutationFn: () => formalReportsApi.derive(report.id, typeKey),
    onSuccess: (x) => { onOpenChange(false); toast.success('Borrador de derivación creado'); onDerived(x.id) },
  })
  React.useEffect(() => { if (open) setTypeKey(types[0]?.key ?? '') }, [open, types])
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Derivar caso</DialogTitle>
          <DialogDescription>Se crea un borrador con el mismo estudiante, asignatura y alerta, vinculado a este informe.</DialogDescription>
        </DialogHeader>
        {types.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay tipos de informe configurados para las instancias de derivación.</p>
        ) : (
          <Select disabled={busy} value={typeKey} onValueChange={setTypeKey}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{types.map((t) => <SelectItem key={t.key} value={t.key}>{t.label} → {instanceLabel(t.to)}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!typeKey || busy} onClick={() => runAction('derive', () => derive.mutateAsync())}><ActionIcon active={busy} icon={CopyPlus} />{busy ? 'Creando borrador…' : 'Crear borrador'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FromCaseDialog({ open, onOpenChange, planId, onConfirm }: { open: boolean; onOpenChange: (o: boolean) => void; planId: string; onConfirm: (ids: string[]) => Promise<unknown> }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['case-attachments', planId], queryFn: () => getCaseAttachments(planId), enabled: open })
  const [ids, setIds] = React.useState<string[]>([])
  const { busy, runAction } = useExclusiveReportAction()
  React.useEffect(() => { if (open) setIds([]) }, [open])
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
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
                  <input type="checkbox" disabled={busy} checked={ids.includes(a.id)} onChange={(e) => setIds(e.target.checked ? [...ids, a.id] : ids.filter((x) => x !== a.id))} />
                  <span className="font-medium">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground">{a.categoryLabel} · {kb(a.fileSize)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!ids.length || busy} onClick={() => runAction('copy', () => onConfirm(ids))}>
            <ActionIcon active={busy} icon={Paperclip} />{busy ? 'Agregando anexos…' : `Agregar (${ids.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
