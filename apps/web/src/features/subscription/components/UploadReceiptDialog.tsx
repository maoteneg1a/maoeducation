import { useRef, useState } from 'react'
import { FileText, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { useSubmitPayment } from '../hooks/useSubscription'

const ACCEPT = 'image/png,image/jpeg,image/webp,image/heic,application/pdf'
const MAX_BYTES = 8 * 1024 * 1024

interface Props {
  open: boolean
  onClose: () => void
}

/** Hoy = valor por defecto de la fecha de transferencia. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function UploadReceiptDialog({ open, onClose }: Props) {
  const submit = useSubmitPayment()
  const fileInput = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [transferredAt, setTransferredAt] = useState(today())
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')

  const reset = () => {
    if (preview) URL.revokeObjectURL(preview)
    setFile(null)
    setPreview(null)
    setFileError(null)
    setAmount('')
    setTransferredAt(today())
    setReference('')
    setNotes('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const pickFile = (selected: File | null) => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    setFileError(null)

    if (!selected) {
      setFile(null)
      return
    }
    if (selected.size > MAX_BYTES) {
      setFile(null)
      setFileError('El comprobante no debe superar 8 MB')
      return
    }
    setFile(selected)
    if (selected.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(selected))
    }
  }

  const handleSubmit = () => {
    if (!file) {
      setFileError('Adjunta la captura del comprobante')
      return
    }
    submit.mutate(
      {
        file,
        amount: amount.trim() || undefined,
        transferredAt: transferredAt ? new Date(transferredAt).toISOString() : undefined,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      },
      { onSuccess: handleClose },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enviar comprobante</DialogTitle>
          <DialogDescription>
            Sube la captura de la transferencia. Revisamos el pago y activamos tu cuenta.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Comprobante</Label>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              {preview ? (
                <img src={preview} alt="Comprobante" className="max-h-40 rounded object-contain" />
              ) : file ? (
                <>
                  <FileText className="h-6 w-6" />
                  <span className="font-medium text-slate-700">{file.name}</span>
                </>
              ) : (
                <>
                  <Upload className="h-6 w-6" />
                  <span>Elegir captura o PDF</span>
                  <span className="text-xs text-slate-400">PNG, JPG, WebP o PDF · máx. 8 MB</span>
                </>
              )}
            </button>
            {file && (
              <button
                type="button"
                onClick={() => pickFile(null)}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                Quitar archivo
              </button>
            )}
            {fileError && <p className="text-xs text-red-600">{fileError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Monto (USD)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="transferredAt">Fecha de transferencia</Label>
              <Input
                id="transferredAt"
                type="date"
                value={transferredAt}
                onChange={(e) => setTransferredAt(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reference">Banco y referencia</Label>
            <Input
              id="reference"
              placeholder="Pichincha · 123456789"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Input
              id="notes"
              placeholder="Algo que debamos saber del pago"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} loading={submit.isPending} disabled={!file}>
            Enviar comprobante
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
