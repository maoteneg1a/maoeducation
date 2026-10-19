import * as React from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { getErrorMessage } from '@/shared/lib/utils'

export type ImportEntries = Record<string, unknown>

export interface ImportResultRow {
  label: string
  status: string
  reason?: string
}

interface BulkImportDialogProps<Row> {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: React.ReactNode
  /** Fila de ejemplo para la plantilla descargable (claves = encabezados). */
  templateRow: Record<string, string>
  templateFileName: string
  maxRows: number
  /** Convierte una fila (encabezados normalizados a minúsculas_con_guion_bajo) al payload. */
  mapRow: (entries: ImportEntries) => Row
  /** Etiqueta para la vista previa de cada fila. */
  previewLabel: (row: Row) => string
  onSubmit: (rows: Row[]) => Promise<{ summary: string; results: ImportResultRow[] }>
  /** Contenido extra sobre el selector de archivo (p. ej. elegir rol). */
  children?: React.ReactNode
}

const STATUS_VARIANT: Record<string, 'success' | 'secondary' | 'destructive' | 'warning'> = {
  created: 'success',
  linked: 'success',
  enrolled: 'success',
  existing: 'secondary',
  skipped: 'destructive',
}
const STATUS_LABEL: Record<string, string> = {
  created: 'Creado',
  linked: 'Vinculado',
  enrolled: 'Matriculado',
  existing: 'Ya existía',
  skipped: 'Omitido',
}

/** Cédula desde Excel: recupera el 0 inicial que Excel elimina en celdas numéricas. */
export function normalizeDni(raw: unknown): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return typeof raw === 'number' && digits.length === 9 ? digits.padStart(10, '0') : digits
}

export function pick(entries: ImportEntries, ...keys: string[]): unknown {
  for (const k of keys) if (entries[k] !== undefined && entries[k] !== '') return entries[k]
  return ''
}

/** Importación genérica desde Excel/CSV con plantilla, vista previa y resultado por fila. */
export function BulkImportDialog<Row>(props: BulkImportDialogProps<Row>) {
  const { open, onOpenChange, title, description, templateRow, templateFileName, maxRows, mapRow, previewLabel, onSubmit, children } = props
  const [rows, setRows] = React.useState<Row[]>([])
  const [result, setResult] = React.useState<{ summary: string; results: ImportResultRow[] } | null>(null)
  const [pending, setPending] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (open) {
      setRows([])
      setResult(null)
    }
  }, [open])

  function downloadTemplate() {
    const sheet = XLSX.utils.json_to_sheet([templateRow])
    sheet['!cols'] = Object.keys(templateRow).map((k) => ({ wch: Math.max(14, k.length + 4) }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, 'Datos')
    XLSX.writeFile(wb, templateFileName)
  }

  async function handleFile(file?: File) {
    if (!file) return
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
      const parsed = raw.map((r) =>
        mapRow(
          Object.fromEntries(
            Object.entries(r).map(([k, v]) => [
              k.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '_'),
              typeof v === 'string' ? v.trim() : v,
            ]),
          ),
        ),
      )
      if (parsed.length === 0) throw new Error('El archivo no tiene filas')
      if (parsed.length > maxRows) throw new Error(`El archivo supera el máximo de ${maxRows} filas`)
      setRows(parsed)
      setResult(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo leer el archivo')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function submit() {
    setPending(true)
    try {
      const r = await onSubmit(rows)
      setResult(r)
      setRows([])
      toast.success(r.summary)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" aria-hidden />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {children}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4" /> Descargar plantilla
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Elegir archivo (.xlsx, .csv)
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {rows.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{rows.length} filas listas para importar</p>
              <ul className="max-h-56 overflow-y-auto text-sm">
                {rows.slice(0, 200).map((r, i) => (
                  <li key={i} className="border-b px-3 py-1.5 last:border-0">{previewLabel(r)}</li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <div className="rounded-md border">
              <p className="border-b bg-muted/40 px-3 py-2 text-sm font-medium">{result.summary}</p>
              <ul className="max-h-64 overflow-y-auto text-sm">
                {result.results.map((r, i) => (
                  <li key={i} className="flex items-center gap-2 border-b px-3 py-1.5 last:border-0">
                    <Badge variant={STATUS_VARIANT[r.status] ?? 'secondary'}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {r.reason && <span className="text-xs text-muted-foreground">{r.reason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          <Button onClick={submit} disabled={rows.length === 0} loading={pending}>
            Importar {rows.length > 0 ? rows.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
