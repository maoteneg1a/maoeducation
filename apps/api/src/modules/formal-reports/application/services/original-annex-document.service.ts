import { applyAnnexSignatures } from './annex-signatures.service'
import JSZip from 'jszip'
import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { AppError, BadRequestError } from '../../../../shared/domain/errors/app.errors'
import type { FormalReportPdfData } from './formal-report-pdf.service'
import type { ReportPdfTemplate } from '../../../../shared/domain/reinforcement-annexes'
import { applyAnnexLogo, type AnnexBranding } from './annex-branding.service'

const annexNumber: Record<ReportPdfTemplate, number> = { annex_alerts: 1, annex_commitment: 2, annex_plan: 3, annex_progress: 4, annex_attendance: 5 }
type Values = Record<string, string | undefined>
type ManifestEntry = { defaults: Record<string, string>; appends: Record<string, string>; groups: Record<string, { minimumRows: number; rows: string[] }> }
type Snapshot = {
  academicYear?: { name: string } | null
  student?: { name: string } | null
  parallel?: { name: string; grade?: string; section?: string; tutor: string | null } | null
  subject?: { name: string; teacher: string } | null
  period?: { name: string } | null
  alertRoster?: Array<{ student: string; result: string }>
  reinforcementCase?: { attendedClasses?: number; detection?: { initialResult: string | null }; reevaluations: Array<{ evaluation: string; initialResult: string | null; subsequentResult: string | null }> } | null
  sessions?: Array<{ date: string | null; attendance: Array<{ student: string; status: string }> }>
}

async function assetsDirectory() {
  const candidates = [path.resolve(process.cwd(), 'assets/reinforcement-annexes'), path.resolve(process.cwd(), 'apps/api/assets/reinforcement-annexes'), path.resolve(__dirname, '../assets/reinforcement-annexes')]
  for (const candidate of candidates) {
    try { await access(path.join(candidate, 'manifest.json')); return candidate } catch { /* siguiente ubicación */ }
  }
  throw new AppError('No se encuentran las plantillas originales de los anexos.', 503, 'ANNEX_TEMPLATES_UNAVAILABLE')
}

/** Escapa solo el dato insertado. Los saltos se escriben como saltos nativos de Word. */
function xmlValue(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\{/g, '&#123;').replace(/\}/g, '&#125;')
    .replace(/\r\n?|\n/g, '</w:t><w:br/><w:t xml:space="preserve">')
}
function fill(xml: string, values: Values, spec: ManifestEntry) {
  return xml.replace(/<!--APPEND:([a-z0-9_]+)-->/g, (_, key: string) => values[key]?.trim() ? spec.appends[key] : '')
    .replace(/\{\{([a-z0-9_]+)\}\}/g, (_, key: string) => {
    const base = key.split('__part')[0]
    if (key !== base && values[base]?.trim()) return ''
    return xmlValue(values[key]?.trim() ? values[key]! : spec.defaults[key] ?? '')
  })
}
const lines = (v?: string) => v?.split(/\r?\n/).filter((s) => s.trim()) ?? []
const chunks = <T>(items: T[], count: number): T[][] => items.length ? Array.from({ length: Math.ceil(items.length / count) }, (_, i) => items.slice(i * count, (i + 1) * count)) : [[]]

/** Completa el original y parametriza la identidad institucional, conservando su estructura. */
export async function buildOriginalAnnexDocx(data: FormalReportPdfData): Promise<Buffer> {
  if (!data.pdfTemplate || !(data.pdfTemplate in annexNumber)) throw new BadRequestError('Este informe no utiliza un anexo del documento original')
  const number = annexNumber[data.pdfTemplate]
  const directory = await assetsDirectory()
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as { branding: AnnexBranding; annexes: Record<string, ManifestEntry> }
  const spec = manifest.annexes[number]
  const zip = await JSZip.loadAsync(await readFile(path.join(directory, `annex-${number}.docx`)))
  const originalXml = await zip.file('word/document.xml')!.async('string')
  const c = data.content
  const s = data.snapshot as Snapshot
  const dateValue = c.fecha_documento || data.sentAt?.toISOString().slice(0, 10)
  const date = dateValue && /^\d{4}-\d{2}-\d{2}$/.test(dateValue) ? new Date(`${dateValue}T12:00:00Z`) : null
  const grade = c.grado || s.parallel?.grade || s.parallel?.name
  const parallel = c.paralelo || s.parallel?.section
  const tutor = c.tutor || s.parallel?.tutor || data.authorName
  const teacher = c.docente_refuerzo || s.subject?.teacher || data.authorName
  const v: Values = {
    header_institution: data.institutionName, institution_name: data.institutionName,
    header_academic_year: s.academicYear?.name,
    academic_year: s.academicYear?.name, student: s.student?.name, institution: data.institutionName,
    grade, parallel, tutor, teacher, subject: s.subject?.name, period: s.period?.name,
    teacher_signature: data.authorName, authority: c.autoridad || data.recipientNames.join(', '),
    acta: c.numero_acta || data.folio || undefined, date: date ? `${String(date.getUTCDate()).padStart(2, '0')} / ${String(date.getUTCMonth() + 1).padStart(2, '0')} / ${date.getUTCFullYear()}` : undefined,
    day: date?.getUTCDate().toString(), month: date ? new Intl.DateTimeFormat('es-EC', { month: 'long', timeZone: 'UTC' }).format(date) : undefined,
    year: date?.getUTCFullYear().toString(), grade_narrative: grade,
    guardian: c.representante, place_date: c.lugar_fecha || (c.lugar && dateValue ? `${c.lugar}, ${dateValue}` : undefined),
    schedule: c.horario, duration: c.duracion, start_date: c.fecha_inicio, objective: c.objetivo,
    observations: c.observaciones, achievements: c.logros, difficulties: c.dificultades, suggestions: c.sugerencias,
    reinforcement_teacher: teacher, attended: s.reinforcementCase?.attendedClasses?.toString(),
    grade_parallel: grade || parallel ? `Grado o Curso: ${grade || '________________'}      Paralelo: ${parallel || '________'}` : undefined,
    tutor_teacher: tutor || teacher ? `Tutor/a: ${tutor || '________________'}                    Profesor/a de refuerzo: ${teacher || '________________'}` : undefined,
  }
  if (/matutina/i.test(c.jornada ?? '')) v.jornada_matutina = '☒'
  else if (/vespertina/i.test(c.jornada ?? '')) v.jornada_vespertina = '☒'
  // En el Anexo 2 la jornada es un espacio de texto, no casillas.
  if (number === 2) v.jornada = c.jornada
  const environment = c.entorno || c.modalidad || ''
  const grouping = c.agrupacion || c.modalidad || ''
  const outside = /extra|fuera/i.test(environment)
  if (environment) v[outside ? 'outside_mark' : 'inside_mark'] = '(  X  )'
  if (grouping) v[`${outside ? 'outside' : 'inside'}_${/grupo/i.test(grouping) ? 'group' : 'individual'}`] = '(  X  )'
  for (const prefix of ['lengua', 'matematica']) {
    for (const suffix of ['competencia', 'indicador', 'saberes', 'estrategias', 'recursos', 'evaluacion']) {
      const legacy = prefix === 'matematica' ? /matem/i.test(s.subject?.name || '') : /lengua|literatura/i.test(s.subject?.name || '')
      const value = c[`${prefix}_${suffix}`] || (legacy ? c[suffix] : undefined)
      v[`${prefix}_${suffix}`] = value && suffix === 'competencia' ? `\n${value}` : value
    }
  }
  const subjects = lines(c.horario_asignaturas), days = lines(c.horario_dias), hours = lines(c.horario_horas)
  const scheduleRows = Array.from({ length: Math.max(subjects.length, days.length, hours.length, c.horario ? 1 : 0) }, (_, i) => ({ row_subject: subjects[i] || (i === 0 ? s.subject?.name : undefined), row_days: days[i], row_hours: hours[i] || (i === 0 ? c.horario : undefined) }))
  const progressRows: Values[] = s.reinforcementCase?.reevaluations?.map((r) => ({ row_indicator: c.indicador || r.evaluation, row_learning: c.competencia_saberes, row_before: r.initialResult || s.reinforcementCase?.detection?.initialResult || undefined, row_after: r.subsequentResult || undefined })) || []
  if (!progressRows.length) progressRows.push({ row_indicator: c.indicador, row_learning: c.competencia_saberes, row_before: s.reinforcementCase?.detection?.initialResult || undefined })
  const rosterRows = (s.alertRoster || []).map((a, i) => ({ row_no: String(i + 1), row_name: a.student, row_result: a.result }))

  function render(values: Values, groups: Record<string, Values[]>) {
    let xml = originalXml
    for (const [name, group] of Object.entries(spec.groups)) {
      const rows = groups[name] || []
      const count = Math.max(rows.length, group.minimumRows)
      const result = Array.from({ length: count }, (_, i) => fill(group.rows[Math.min(i, group.rows.length - 1)], { row_no: String(i + 1), ...rows[i] }, spec)).join('')
      xml = xml.replace(`<!--REPEAT:${name}-->`, () => result)
    }
    return fill(xml, values, spec)
  }

  let xml: string
  if (number === 5) {
    const sessions = s.sessions || []
    const dates = [...new Set(sessions.map((session) => session.date).filter((d): d is string => !!d))]
    const names = [...new Set(sessions.flatMap((session) => session.attendance.map((a) => a.student)))]
    const documents: string[] = []
    for (const dateGroup of chunks(dates, 8)) {
      for (const nameGroup of chunks(names, 10)) {
        const values = { ...v }
        dateGroup.forEach((date, i) => { values[`date_${i}`] = date.slice(5).split('-').reverse().join('/') })
        const attendance = nameGroup.map((name, i) => {
          const row: Values = { row_no: String(names.indexOf(name) + 1), row_name: name }
          dateGroup.forEach((date, j) => {
            const statuses = sessions.filter((session) => session.date === date).flatMap((session) => session.attendance.filter((a) => a.student === name).map((a) => a.status))
            row[`row_att_${j}`] = statuses.includes('present') ? '✓' : statuses.includes('absent') ? 'F' : statuses.includes('justified') ? 'J' : ''
          })
          return row
        })
        documents.push(render(values, { attendance }))
      }
    }
    const body = /(<w:body[^>]*>)([\s\S]*?)(<w:sectPr\b[\s\S]*?<\/w:sectPr>)(<\/w:body>)/
    const bodies = documents.map((document) => body.exec(document)![2])
    xml = documents[0].replace(body, (_, start, _content, section, end) => start + bodies.join('<w:p><w:r><w:br w:type="page"/></w:r></w:p>') + section + end)
  } else xml = render(v, { roster: rosterRows, schedule: scheduleRows, progress: progressRows })
  zip.file('word/document.xml', xml)
  for (const header of manifest.branding.headerParts) {
    zip.file(header, fill(await zip.file(header)!.async('string'), v, spec))
  }
  await applyAnnexLogo(zip, manifest.branding, data.logoUrl)
  await applyAnnexSignatures(zip, number, data.authorSignature, data.recipientSignature)
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/** El PDF se obtiene renderizando el Word original; no hay una segunda maqueta en PDFKit. */
export async function buildOriginalAnnexPdf(data: FormalReportPdfData): Promise<Buffer> {
  const docx = await buildOriginalAnnexDocx(data)
  const directory = await mkdtemp(path.join(tmpdir(), 'auleka-annex-'))
  try {
    const input = path.join(directory, 'anexo.docx')
    await writeFile(input, docx)
    await promisify(execFile)(process.env.LIBREOFFICE_BIN || 'libreoffice', [
      `-env:UserInstallation=${pathToFileURL(path.join(directory, 'profile')).href}`,
      '--headless', '--convert-to', 'pdf:writer_pdf_Export', '--outdir', directory, input,
    ], { timeout: 120_000, maxBuffer: 1024 * 1024 })
    const pdf = await readFile(path.join(directory, 'anexo.pdf'))
    if (pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('El conversor no produjo un PDF válido')
    return pdf
  } catch (error) {
    throw new AppError('No se pudo convertir el anexo original a PDF. Revisa LibreOffice en el servidor; el documento Word está disponible para descargar.', 503, 'ANNEX_PDF_UNAVAILABLE')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
