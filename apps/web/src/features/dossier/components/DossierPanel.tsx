import * as React from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, AlertCircle, XCircle, MinusCircle, Upload, FilePlus2, Download, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Textarea } from '@/shared/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { PageLoader } from '@/shared/components/feedback/loading-spinner'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { cn, getErrorMessage } from '@/shared/lib/utils'
import { getYears } from '@/features/enrollment/api/enrollment.api'
import { academicApi } from '@/features/academic/api/academic.api'
import { ReportComposerDialog } from '@/features/formal-reports/components/ReportComposerDialog'
import { getDossier, uploadDossierFile, downloadDossierFile, removeDossierFile, setDossierApplicability, type DossierEvidence, type DossierItem, type DossierItemStatus } from '../api/dossier.api'

const STATUS: Record<DossierItemStatus, { label: string; icon: React.ElementType; className: string }> = {
  ok: { label: 'Completo', icon: CheckCircle2, className: 'text-green-700' },
  partial: { label: 'Incompleto', icon: AlertCircle, className: 'text-amber-700' },
  missing: { label: 'Pendiente', icon: XCircle, className: 'text-red-600' },
  na: { label: 'No aplica', icon: MinusCircle, className: 'text-muted-foreground' },
}
const LABEL: Record<string, string> = { DRAFT: 'Borrador', SENT: 'Enviado, pendiente de recepción', RECEIVED: 'Recibido', RETURNED: 'Devuelto', ATTENDED: 'Atendido', SIGNED: 'Firmada', UNSIGNED: 'Falta firma', SIGNED_FILE: 'Archivo con firmas', UPLOADED: 'Archivo subido', REGISTERED: 'Registrado' }
const evidenceLink = (e: DossierEvidence) => e.kind === 'formal_report' ? `/informes/${e.id}` : e.kind === 'reinforcement_case' ? `/refuerzo/casos/${e.id}` : e.kind === 'parent_meeting' ? `/parent-meetings/${e.id}` : null

/** Bitácora anual para el respaldo del docente frente al riesgo de reprobar. */
export function DossierPanel({ studentId }: { studentId: string }) {
  const qc = useQueryClient()
  const [yearId, setYearId] = React.useState('')
  const [subjectId, setSubjectId] = React.useState('')
  const [periodId, setPeriodId] = React.useState('')
  const [caseId, setCaseId] = React.useState('none')
  const [generate, setGenerate] = React.useState<DossierItem | null>(null)
  const [upload, setUpload] = React.useState<DossierItem | null>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [signed, setSigned] = React.useState(false)
  const [observation, setObservation] = React.useState('')
  const [exception, setException] = React.useState<DossierItem | null>(null)
  const [reason, setReason] = React.useState('')
  const onError = (e: unknown) => toast.error(getErrorMessage(e))
  const refresh = () => qc.invalidateQueries({ queryKey: ['dossier', studentId] })
  const context = (item: DossierItem) => ({ studentId, academicYearId: yearId, courseAssignmentId: subjectId || undefined, itemKey: item.key })
  const { data: years = [], isLoading: yearsLoading } = useQuery({ queryKey: ['years'], queryFn: getYears })
  React.useEffect(() => { if (!yearId && years.length) setYearId(years.find((y) => y.isActive)?.id || years[0].id) }, [yearId, years])
  React.useEffect(() => { setSubjectId(''); setPeriodId(''); setCaseId('none') }, [yearId, studentId])
  React.useEffect(() => { setCaseId('none') }, [subjectId])
  const { data: periods = [] } = useQuery({ queryKey: ['periods', yearId], queryFn: () => academicApi.getPeriods(yearId), enabled: !!yearId })
  React.useEffect(() => { if (!periodId && periods.length) setPeriodId(periods.find((p) => p.isActive)?.id || periods[0].id) }, [periodId, periods])
  const { data, isLoading, isError, error } = useQuery({ queryKey: ['dossier', studentId, yearId, subjectId], queryFn: () => getDossier(studentId, yearId, subjectId || undefined), enabled: !!yearId })
  React.useEffect(() => { if (!subjectId && data?.subjects.length) setSubjectId(data.subjects[0].id) }, [data, subjectId])
  const selectedCase = data?.cases.find((c) => c.id === caseId)
  const saveFile = useMutation({ mutationFn: () => uploadDossierFile(context(upload!), file!, signed, observation), onSuccess: () => { toast.success('Documento agregado a la bitácora'); setUpload(null); setFile(null); refresh() }, onError })
  const removeFile = useMutation({ mutationFn: removeDossierFile, onSuccess: () => { toast.success('Archivo retirado'); refresh() }, onError })
  const saveException = useMutation({ mutationFn: ({ item, notApplicable, reason }: { item: DossierItem; notApplicable: boolean; reason?: string }) => setDossierApplicability(context(item), notApplicable, reason), onSuccess: () => { setException(null); refresh() }, onError })
  if (yearsLoading) return <PageLoader />

  return <div className="space-y-4">
    <div>
      <h2 className="text-lg font-semibold">Bitácora de respaldo ante riesgo de reprobar</h2>
      <p className="mt-1 text-sm text-muted-foreground">Completa los documentos del estudiante con informes generados en Auleka y respaldos PDF o escaneados. Los documentos generales se comparten entre sus asignaturas; los demás se revisan para la materia seleccionada.</p>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1"><Label>Año lectivo</Label><Select value={yearId} onValueChange={setYearId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Asignatura en seguimiento</Label><Select value={subjectId} onValueChange={setSubjectId}><SelectTrigger><SelectValue placeholder="Selecciona la materia" /></SelectTrigger><SelectContent>{data?.subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Periodo para generar documentos</Label><Select value={periodId} onValueChange={(v) => { setPeriodId(v); setCaseId('none') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{periods.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1"><Label>Caso de refuerzo para plan, resultados y asistencia</Label><Select value={caseId} onValueChange={(v) => { setCaseId(v); const c = data?.cases.find((x) => x.id === v); if (c) setPeriodId(c.periodId) }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Selecciona un caso cuando corresponda</SelectItem>{data?.cases.map((c) => <SelectItem key={c.id} value={c.id}>{c.subject} · {c.period}</SelectItem>)}</SelectContent></Select></div>
    </div>
    {isLoading ? <PageLoader /> : isError ? <EmptyState title="No se pudo cargar la bitácora" description={getErrorMessage(error)} /> : data && <>
      {!data.applies && <p className="rounded-md border p-3 text-sm">La bitácora no está habilitada para este subnivel según la configuración institucional.</p>}
      <Card><CardContent className="space-y-2 p-4"><div className="flex justify-between text-sm"><span>{data.parallel.name} · {data.academicYear.name}</span><b>{data.completion}% completo</b></div><div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-green-600" style={{ width: `${data.completion}%` }} /></div><p className="text-xs text-muted-foreground">{data.items.filter((i) => i.status === 'ok').length} completos · {data.items.filter((i) => i.status === 'na').length} no aplican · {data.items.filter((i) => i.status === 'missing' || i.status === 'partial').length} pendientes</p></CardContent></Card>
      <div className="space-y-3">{data.items.map((item, index) => {
        const ui = STATUS[item.status], Icon = ui.icon
        return <Card key={item.key}><CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><Icon className={cn('mt-0.5 h-5 w-5 shrink-0', ui.className)} /><div><p className="text-sm font-semibold">{index + 1}. {item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.perSubject ? 'Por asignatura' : 'Documento general del estudiante'} · Respaldos completos: {item.acknowledged}/{item.minCount}{item.requiresSignature ? ' · Requiere firma' : ''}{item.optional ? ' · Si corresponde' : ''}</p></div></div><Badge variant={item.status === 'ok' ? 'success' : item.status === 'na' ? 'outline' : 'warning'}>{ui.label}</Badge></div>
          {item.notApplicableReason && <p className="text-sm text-muted-foreground">Motivo de no aplicación: {item.notApplicableReason}</p>}
          {!!item.evidence.length && <ul className="divide-y rounded-md border text-sm">{item.evidence.map((e) => {
            const href = evidenceLink(e)
            return <li key={`${e.kind}-${e.id}`} className="flex items-start justify-between gap-2 p-3"><div className="min-w-0"><p className="text-xs text-muted-foreground">{e.kind === 'uploaded_file' ? 'Archivo subido' : 'Generado / registrado en Auleka'} · {e.date || 'Sin fecha'}{e.uploader ? ` · ${e.uploader}` : ''}</p>{href && e.canOpen ? <Link className="text-primary hover:underline" to={href}>{e.folio ? `${e.folio} · ` : ''}{e.label}</Link> : <p className="break-words">{e.label}</p>}<p className="text-xs text-muted-foreground">{LABEL[e.status] || e.status}</p>{e.observation && <p className="text-xs">{e.observation}</p>}</div><div className="flex shrink-0 gap-1">{e.kind === 'uploaded_file' && e.canOpen && <Button size="icon" variant="ghost" title="Descargar respaldo" onClick={() => downloadDossierFile(e.id, e.label).catch(onError)}><Download className="h-4 w-4" /></Button>}{e.canRemove && <Button size="icon" variant="ghost" title="Retirar archivo" disabled={removeFile.isPending} onClick={async () => { if (await confirmDialog({ title: 'Retirar archivo del expediente', description: e.label, confirmText: 'Retirar', destructive: true })) removeFile.mutate(e.id) }}><Trash2 className="h-4 w-4" /></Button>}</div></li>
          })}</ul>}
          {item.status !== 'na' && <div className="flex flex-wrap gap-2">
            {item.canGenerate && item.reportType && <Button size="sm" variant="outline" disabled={!data.applies || !periodId || (item.requiresReinforcementCase && !selectedCase)} onClick={() => setGenerate(item)}><FilePlus2 className="mr-1 h-4 w-4" />Generar en Auleka</Button>}
            {item.source === 'parent_meetings' && <Button size="sm" variant="outline" asChild><Link to="/parent-meetings">Registrar reunión / acta</Link></Button>}
            <Button size="sm" variant="outline" disabled={!item.canUpload} onClick={() => { setUpload(item); setFile(null); setSigned(false); setObservation('') }}><Upload className="mr-1 h-4 w-4" />Subir PDF o escaneado</Button>
            {item.optional && item.canUpload && <Button size="sm" variant="ghost" onClick={() => { setException(item); setReason('') }}>No aplica</Button>}
          </div>}
          {item.status === 'na' && item.canUpload && <Button size="sm" variant="outline" disabled={saveException.isPending} onClick={() => saveException.mutate({ item, notApplicable: false })}>Este documento sí corresponde</Button>}
          {item.status !== 'na' && item.requiresReinforcementCase && !selectedCase && <p className="text-xs text-muted-foreground">Para generarlo, selecciona arriba el caso de refuerzo de esta asignatura. También puedes adjuntar el documento existente.</p>}
          {item.requiresSignature && item.status !== 'ok' && item.status !== 'na' && <p className="text-xs text-muted-foreground">Completa este punto con el acta firmada o su respaldo escaneado.</p>}
        </CardContent></Card>
      })}</div>
    </>}
    <Dialog open={!!upload} onOpenChange={(open) => { if (!open && !saveFile.isPending) setUpload(null) }}><DialogContent><DialogHeader><DialogTitle>Agregar respaldo a la bitácora</DialogTitle><DialogDescription>{upload?.label}</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-1"><Label>Archivo PDF o imagen escaneada · máximo {data?.uploadSettings.maxSizeMb || 10} MB</Label><Input type="file" accept={data?.uploadSettings.allowedMime.join(',')} onChange={(e) => setFile(e.target.files?.[0] || null)} /></div><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={signed} onChange={(e) => setSigned(e.target.checked)} /><span>Confirmo que el archivo contiene las firmas requeridas.</span></label><div className="space-y-1"><Label>Observación (opcional)</Label><Textarea value={observation} maxLength={2000} onChange={(e) => setObservation(e.target.value)} /></div></div><DialogFooter><Button variant="outline" disabled={saveFile.isPending} onClick={() => setUpload(null)}>Cancelar</Button><Button disabled={!file || saveFile.isPending} onClick={() => saveFile.mutate()}>{saveFile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Agregar documento</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!exception} onOpenChange={(open) => !open && setException(null)}><DialogContent><DialogHeader><DialogTitle>Justificar que el documento no aplica</DialogTitle><DialogDescription>{exception?.label}</DialogDescription></DialogHeader><Textarea value={reason} maxLength={2000} onChange={(e) => setReason(e.target.value)} placeholder="Indica por qué no corresponde a este estudiante." /><DialogFooter><Button variant="outline" onClick={() => setException(null)}>Cancelar</Button><Button disabled={reason.trim().length < 5 || saveException.isPending} onClick={() => exception && saveException.mutate({ item: exception, notApplicable: true, reason })}>Guardar motivo</Button></DialogFooter></DialogContent></Dialog>
    <ReportComposerDialog open={!!generate} onOpenChange={(open) => !open && setGenerate(null)} defaultTypeKey={generate?.reportType || undefined} typeKeys={generate?.reportType ? [generate.reportType] : []} context={{ studentId, academicYearId: yearId, parallelId: data?.parallel.id, courseAssignmentId: subjectId || undefined, academicPeriodId: periodId || undefined, reinforcementPlanId: generate?.requiresReinforcementCase ? selectedCase?.id : undefined }} onCreated={refresh} />
  </div>
}
