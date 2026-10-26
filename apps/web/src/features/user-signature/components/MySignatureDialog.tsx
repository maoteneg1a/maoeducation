import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiDelete, apiGet, apiPut } from '@/shared/lib/api-client'
import { getErrorMessage } from '@/shared/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { SignaturePad } from '@/features/parent-meetings/components/SignaturePad'
import { Button } from '@/shared/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/shared/components/ui/dialog'

type SavedSignature = { imageData: string | null; updatedAt: string | null }

export function MySignatureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const userId = useAuthStore((state) => state.user?.id)
  const qc = useQueryClient()
  const key = ['my-signature', userId]
  const signature = useQuery({ queryKey: key, queryFn: () => apiGet<SavedSignature>('users/me/signature'), enabled: open })
  const [pending, setPending] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'draw' | 'upload'>('draw')
  React.useEffect(() => { if (open) { setPending(null); setMode('draw') } }, [open])
  const save = useMutation({
    mutationFn: () => apiPut<SavedSignature>('users/me/signature', { imageData: pending }),
    onSuccess: (data) => { qc.setQueryData(key, data); setPending(null); toast.success('Firma personal guardada'); onOpenChange(false) },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  const remove = useMutation({
    mutationFn: () => apiDelete('users/me/signature'),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); setPending(null); toast.success('Firma personal eliminada') },
    onError: (error) => toast.error(getErrorMessage(error)),
  })
  async function upload(file?: File) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { toast.error('Selecciona una imagen PNG, JPG o WebP de hasta 2 MB'); return }
    const reader = new FileReader()
    reader.onload = () => setPending(String(reader.result))
    reader.onerror = () => toast.error('No se pudo leer la imagen')
    reader.readAsDataURL(file)
  }
  const busy = save.isPending || remove.isPending
  return <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Mi firma</DialogTitle><DialogDescription>Guarda tu propia firma. Se incorpora al enviar tus informes o registrar su acuse de recibo. Cada documento conserva la firma utilizada en ese momento.</DialogDescription></DialogHeader>
      {signature.isError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(signature.error)}</p>}
      {signature.data?.imageData && <div className="space-y-2"><p className="text-sm font-medium">Firma guardada</p><img src={signature.data.imageData} alt="Tu firma guardada" className="h-24 w-full rounded border bg-white object-contain" /><Button variant="ghost" size="sm" disabled={busy} onClick={() => remove.mutate()}>Eliminar firma guardada</Button></div>}
      <div className="flex gap-2"><Button variant={mode === 'draw' ? 'secondary' : 'outline'} disabled={busy} onClick={() => { setMode('draw'); setPending(null) }}>Dibujar firma</Button><Button variant={mode === 'upload' ? 'secondary' : 'outline'} disabled={busy} onClick={() => { setMode('upload'); setPending(null) }}>Subir imagen</Button></div>
      <fieldset disabled={busy}>
        {mode === 'draw' ? <SignaturePad onChange={setPending} /> : <label className="block space-y-2 text-sm"><span>Imagen de tu firma · máximo 2 MB</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(event.target.files?.[0])} /></label>}
      </fieldset>
      {pending && <img src={pending} alt="Vista previa de la nueva firma" className="h-24 w-full rounded border bg-white object-contain" />}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cerrar</Button><Button disabled={!pending || busy} onClick={() => save.mutate()}>Guardar mi firma</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
