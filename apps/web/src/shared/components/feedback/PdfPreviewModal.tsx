import * as React from 'react'
import { Download, AlertCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { PageLoader } from './loading-spinner'
import { getErrorMessage } from '@/shared/lib/utils'

interface PdfPreviewModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** Descarga el PDF y devuelve el Blob — se llama cada vez que el modal se abre. */
  fetchPdf: () => Promise<Blob>
}

/**
 * Preview embebido de un PDF dentro de un modal (vía <iframe> sobre un blob: URL),
 * en vez de abrir una pestaña nueva. Reusable para cualquier documento del sistema
 * (planificación, reportes, actas...).
 */
export function PdfPreviewModal({ open, onOpenChange, title, fetchPdf }: PdfPreviewModalProps) {
  const [url, setUrl] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let currentUrl: string | null = null
    setLoading(true)
    setError(null)
    fetchPdf()
      .then((blob) => {
        currentUrl = URL.createObjectURL(blob)
        setUrl(currentUrl)
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
    return () => {
      if (currentUrl) URL.revokeObjectURL(currentUrl)
      setUrl(null)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>{title}</DialogTitle>
            {url && (
              <a href={url} download="documento.pdf">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Descargar
                </Button>
              </a>
            )}
          </div>
        </DialogHeader>
        <div className="h-[75vh] w-full overflow-hidden rounded-md border bg-muted/20">
          {loading && <PageLoader />}
          {!loading && error && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-6 w-6" />
              {error}
            </div>
          )}
          {!loading && !error && url && (
            <iframe src={url} title={title} className="h-full w-full border-0" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
