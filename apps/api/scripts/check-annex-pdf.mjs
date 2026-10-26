import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Comprueba una conversión real antes de publicar una imagen sin soporte PDF.
const directory = mkdtempSync(path.join(tmpdir(), 'auleka-pdf-check-'))
try {
  const input = fileURLToPath(new URL('../assets/reinforcement-annexes/annex-1.docx', import.meta.url))
  execFileSync(process.env.LIBREOFFICE_BIN || 'libreoffice', [
    `-env:UserInstallation=${pathToFileURL(path.join(directory, 'profile')).href}`,
    '--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', directory, input,
  ], { timeout: 120_000, stdio: 'pipe' })
  const pdf = readFileSync(path.join(directory, 'annex-1.pdf'))
  if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('PDF inválido')
  console.info('Conversión de anexos a PDF disponible.')
} catch (error) {
  console.error('No se puede convertir un anexo a PDF. Instala LibreOffice Writer y las fuentes en la imagen de la API.', error.message)
  process.exitCode = 1
} finally {
  rmSync(directory, { recursive: true, force: true })
}
