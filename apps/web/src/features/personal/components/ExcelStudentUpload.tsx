import { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'

export interface ParsedStudent {
  firstName: string
  lastName: string
  dni: string
  birthDate?: string
}

interface Props {
  onStudentsParsed: (students: ParsedStudent[]) => void
}

const EXPECTED_COLUMNS = ['nombre', 'apellido', 'cedula', 'fecha_nacimiento']

function normalizeHeader(h: string) {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

export function ExcelStudentUpload({ onStudentsParsed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<ParsedStudent[]>([])
  const [error, setError] = useState<string | null>(null)

  function handleFile(file: File) {
    setError(null)
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

        if (!rows.length) {
          setError('El archivo está vacío.')
          return
        }

        // Normalize column names
        const firstRow = rows[0]
        const headerMap: Record<string, string> = {}
        for (const key of Object.keys(firstRow)) {
          headerMap[normalizeHeader(key)] = key
        }

        const getCol = (normalized: string) => headerMap[normalized] ?? null

        const nombreCol = getCol('nombre') ?? getCol('nombres') ?? getCol('primer_nombre')
        const apellidoCol = getCol('apellido') ?? getCol('apellidos') ?? getCol('primer_apellido')
        const cedulaCol = getCol('cedula') ?? getCol('ci') ?? getCol('dni') ?? getCol('identificacion')

        if (!nombreCol || !apellidoCol) {
          setError('No se encontraron columnas "nombre" y "apellido". Revisa la plantilla.')
          return
        }

        const students: ParsedStudent[] = rows
          .filter((r) => r[nombreCol]?.trim())
          .map((r) => ({
            firstName: String(r[nombreCol] ?? '').trim(),
            lastName: String(r[apellidoCol] ?? '').trim(),
            dni: cedulaCol ? String(r[cedulaCol] ?? '').trim() : '',
            birthDate: r['fecha_nacimiento'] ? String(r['fecha_nacimiento']).trim() : undefined,
          }))
          .filter((s) => s.firstName && s.lastName)

        if (!students.length) {
          setError('No se encontraron estudiantes válidos en el archivo.')
          return
        }

        setPreview(students)
        onStudentsParsed(students)
      } catch {
        setError('No se pudo leer el archivo. Asegúrate de que sea un .xlsx o .csv válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function clear() {
    setFileName(null)
    setPreview([])
    setError(null)
    onStudentsParsed([])
    if (inputRef.current) inputRef.current.value = ''
  }

  function downloadTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nombre', 'apellido', 'cedula', 'fecha_nacimiento'],
      ['Ana', 'García', '1234567890', '2010-03-15'],
      ['Juan', 'López', '0987654321', '2011-07-22'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Estudiantes')
    XLSX.writeFile(wb, 'plantilla_estudiantes.xlsx')
  }

  return (
    <div className="space-y-3">
      {!fileName ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700">Arrastra tu Excel aquí o haz clic para seleccionar</p>
          <p className="text-xs text-gray-500 mt-1">Formatos: .xlsx, .xls, .csv</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleChange}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <FileSpreadsheet className="w-5 h-5 text-green-600 shrink-0" />
          <span className="text-sm text-green-800 flex-1 truncate">{fileName}</span>
          <button onClick={clear} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 border-b">
            {preview.length} estudiante{preview.length !== 1 ? 's' : ''} encontrado{preview.length !== 1 ? 's' : ''}
          </div>
          <div className="max-h-48 overflow-auto">
            <table className="w-full min-w-[520px] text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Nombre</th>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Apellido</th>
                  <th className="text-left px-3 py-1.5 font-medium text-gray-500">Cédula</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.slice(0, 20).map((s, i) => (
                  <tr key={i}>
                    <td className="px-3 py-1.5 text-gray-700">{s.firstName}</td>
                    <td className="px-3 py-1.5 text-gray-700">{s.lastName}</td>
                    <td className="px-3 py-1.5 text-gray-500">{s.dni || '—'}</td>
                  </tr>
                ))}
                {preview.length > 20 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-1.5 text-gray-400 text-center">
                      ... y {preview.length - 20} más
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-xs text-blue-600 hover:text-blue-700 px-0"
        onClick={downloadTemplate}
      >
        Descargar plantilla de ejemplo (.xlsx)
      </Button>

      <div className="text-xs text-gray-500">
        <p>Columnas requeridas: <code className="bg-gray-100 px-1 rounded">nombre</code>, <code className="bg-gray-100 px-1 rounded">apellido</code></p>
        <p>Columnas opcionales: <code className="bg-gray-100 px-1 rounded">cedula</code>, <code className="bg-gray-100 px-1 rounded">fecha_nacimiento</code></p>
      </div>
    </div>
  )
}
