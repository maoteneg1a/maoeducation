import * as React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Label } from '@/shared/components/ui/label'
import { Card, CardContent } from '@/shared/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select'
import { confirmDialog } from '@/shared/components/ui/confirm-dialog'
import { EmptyState } from '@/shared/components/feedback/empty-state'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAsyncAction } from '@/shared/hooks/useAsyncAction'
import { reinforcementDeskApi, type CaseDetail } from '../api/reinforcement-desk.api'

const NONE = 'none'
const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

/** Archivos del caso. Solo el personal con permiso de edición sube; el representante nunca. */
export function AttachmentsTab({ planId, detail }: { planId: string; detail: CaseDetail }) {
  const qc = useQueryClient()
  const cfg = detail.attachmentConfig
  const [category, setCategory] = React.useState(cfg.categories[0]?.key ?? '')
  const [sessionId, setSessionId] = React.useState(NONE)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const downloads = useAsyncAction()

  const refresh = (data: CaseDetail) => qc.setQueryData(['reinforcement-desk-detail', planId], data)

  const upload = useMutation({
    mutationFn: (file: File) => reinforcementDeskApi.uploadAttachment(planId, file, category, sessionId === NONE ? undefined : sessionId),
    onSuccess: (data) => { refresh(data); toast.success('Archivo subido') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: (attachmentId: string) => reinforcementDeskApi.deleteAttachment(planId, attachmentId),
    onSuccess: (data) => { refresh(data); toast.success('Archivo eliminado') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > cfg.maxSizeMb * 1024 * 1024) return toast.error(`El archivo supera ${cfg.maxSizeMb} MB`)
    if (cfg.allowedMime.length && !cfg.allowedMime.includes(file.type)) return toast.error('Tipo de archivo no permitido')
    upload.mutate(file)
  }

  async function onDelete(id: string, name: string) {
    const ok = await confirmDialog({ title: 'Eliminar archivo', description: `Se eliminará "${name}" del caso. Los informes ya enviados conservan su copia.`, confirmText: 'Eliminar', destructive: true })
    if (ok) remove.mutate(id)
  }

  async function download(a: { id: string; fileName: string }) {
    await downloads.run(a.id, async () => {
      try { await reinforcementDeskApi.downloadAttachment(planId, a) }
      catch (e) { toast.error(getErrorMessage(e)) }
    })
  }

  return (
    <div className="space-y-4">
      {detail.canEdit && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cfg.categories.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <Label>Sesión (opcional)</Label>
              <Select value={sessionId} onValueChange={setSessionId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Del caso en general</SelectItem>
                  {detail.sessions.map((s) => <SelectItem key={s.id} value={s.id}>{s.date} · {s.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <input ref={inputRef} type="file" className="hidden" accept={cfg.allowedMime.join(',')} onChange={onFile} />
              <Button onClick={() => inputRef.current?.click()} loading={upload.isPending} disabled={!category}>
                <Upload className="mr-1.5 h-4 w-4" /> Subir archivo
              </Button>
              <p className="mt-1 text-xs text-muted-foreground">Máx. {cfg.maxSizeMb} MB</p>
            </div>
          </CardContent>
        </Card>
      )}

      {detail.attachments.length === 0 ? (
        <EmptyState icon={Paperclip} title="Sin archivos" description="Aún no se han subido evidencias a este caso." />
      ) : (
        <div className="space-y-2">
          {detail.attachments.map((a) => {
            const session = a.sessionId ? detail.sessions.find((s) => s.id === a.sessionId) : null
            return (
              <Card key={a.id}>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{a.fileName}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary">{a.categoryLabel}</Badge>
                      {session && <span>Sesión: {session.title}</span>}
                      <span>{a.uploadedBy}</span>
                      <span>{a.createdAt.slice(0, 10)}</span>
                      <span>{kb(a.fileSize)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button variant="outline" size="sm" loading={downloads.isPending(a.id)} onClick={() => download(a)}>{!downloads.isPending(a.id) && <Download className="h-3.5 w-3.5" />}</Button>
                    {a.canDelete && (
                      <Button variant="outline" size="sm" onClick={() => onDelete(a.id, a.fileName)} disabled={remove.isPending}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
