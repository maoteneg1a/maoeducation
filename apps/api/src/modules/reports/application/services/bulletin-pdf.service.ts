import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { getImageSize } from '../../../../shared/infrastructure/services/pdf-helpers'

interface PeriodGrade {
  periodId: string
  regularAvg: number | null
  examenAvg: number | null
  proyectoAvg: number | null
  total: number | null
  code: string | null
}
interface SubjectRow {
  subjectName: string
  isQualitative: boolean
  periodGrades: PeriodGrade[]
  supletorio: number | null
  promFinal: number | null
  finalCode: string | null
}
interface PeriodCol {
  id: string
  name: string
}
interface AttendanceRow {
  periodId: string
  justifiedAbsences: number
  unjustifiedAbsences: number
  attendedDays: number
  lateCount: number
}
interface BehaviorRow {
  periodId: string
  code: string | null
  notes: string | null
}

export interface QualitativeLevel {
  min: number
  max: number
  code: string
  label: string
}
export interface QualitativeValue {
  min: number
  max: number
  code: string
}

export interface BulletinPdfData {
  institutionName: string
  title: string
  logoUrl: string | null
  directorName: string
  directorRole: string
  teacherLabel: string
  studentName: string
  studentDni: string | null
  studentCode: string | null
  parallelName: string
  levelName: string
  tutorName: string
  yearName: string
  periods: PeriodCol[]
  subjects: SubjectRow[]
  qualitativeSubjects: SubjectRow[]
  overallAverage: number | null
  attendanceByPeriod: AttendanceRow[]
  behaviorByPeriod: BehaviorRow[]
  qualitativeScale: QualitativeLevel[]
  qualitativeValueScale: QualitativeValue[]
}

const NUM = (n: number | null) => (n == null ? '—' : n.toFixed(2))
const fmtDate = (d: Date) => new Intl.DateTimeFormat('es-EC').format(d)

function resolveLogo(logoUrl: string | null): Buffer | string | null {
  if (!logoUrl) return null
  const dm = /^data:[^;]+;base64,(.+)$/.exec(logoUrl)
  if (dm) {
    try {
      return Buffer.from(dm[1], 'base64')
    } catch {
      return null
    }
  }
  const m = /\/uploads\/(.+)$/.exec(logoUrl)
  if (!m) return null
  const p = path.join(process.cwd(), 'uploads', m[1])
  return fs.existsSync(p) ? p : null
}

export function buildBulletinPdf(data: BulletinPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 24 })
    const chunks: Buffer[] = []
    doc.on('data', (c) => chunks.push(c as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right
    const left = doc.page.margins.left
    let y = doc.page.margins.top

    // ── Encabezado ──
    // El logo se dibujaba en la misma Y que el título (y + 2), quedando
    // superpuestos — ambos centrados en el mismo punto horizontal. Se calcula
    // la altura real que ocupará el logo dentro de la caja `fit` (36x36; con
    // `fit`, PDFKit escala por el lado más restrictivo, así que la altura
    // real puede ser menor a 36 si el aspect ratio no es cuadrado) y el
    // título arranca debajo, nunca en el mismo renglón.
    const logo = resolveLogo(data.logoUrl)
    let logoBottom = y
    if (logo) {
      try {
        const boxSize = 36
        const { width: naturalW, height: naturalH } = getImageSize(doc, logo)
        const scale = Math.min(boxSize / naturalW, boxSize / naturalH)
        const logoH = naturalH * scale
        doc.image(logo, doc.page.width / 2 - 18, y, { fit: [boxSize, boxSize] })
        logoBottom = y + logoH + 4
      } catch {
        /* ignore */
      }
    }
    doc.font('Helvetica-Bold').fontSize(13).text(data.institutionName.toUpperCase(), left, logoBottom, {
      width: pageW,
      align: 'center',
    })
    doc.fontSize(9).text(data.yearName, { width: pageW, align: 'center' })
    y = doc.y + 6

    // ── Datos del estudiante (grilla) ──
    doc.fontSize(8).font('Helvetica')
    const infoRow = (cells: Array<[string, string]>) => {
      const cw = pageW / cells.length
      cells.forEach(([label, value], i) => {
        doc.font('Helvetica-Bold').text(`${label}: `, left + i * cw, y, { continued: true, width: cw })
        doc.font('Helvetica').text(value || '—')
      })
      y = doc.y + 3
    }
    infoRow([
      ['CÓDIGO', data.studentCode ?? '—'],
      ['ESTUDIANTE', data.studentName],
      ['FECHA', fmtDate(new Date())],
    ])
    infoRow([
      ['CURSO', data.levelName],
      ['PARALELO', data.parallelName],
      ['DOCENTE TUTOR/A', data.tutorName || '—'],
    ])
    y += 4

    // ── Tabla de calificaciones ──
    const periods = data.periods
    const subjW = 150
    const supleW = 34
    const finalW = 40
    const perPeriodW = (pageW - subjW - supleW - finalW) / Math.max(periods.length, 1)
    const subW = perPeriodW / 4 // Form / Exam / Proy / Prom
    const rowH = 15

    const colX = (pi: number, sub: number) => left + subjW + pi * perPeriodW + sub * subW
    const supleX = left + subjW + periods.length * perPeriodW
    const finalX = supleX + supleW

    // Cabecera fila 1
    doc.font('Helvetica-Bold').fontSize(7)
    doc.rect(left, y, subjW, rowH * 2).stroke()
    doc.text('ASIGNATURA', left + 3, y + rowH - 4, { width: subjW - 6 })
    periods.forEach((p, i) => {
      doc.rect(left + subjW + i * perPeriodW, y, perPeriodW, rowH).stroke()
      doc.text(p.name.toUpperCase(), left + subjW + i * perPeriodW, y + 4, { width: perPeriodW, align: 'center' })
    })
    doc.rect(supleX, y, supleW, rowH * 2).stroke()
    doc.text('SUPLE.', supleX, y + rowH - 4, { width: supleW, align: 'center' })
    doc.rect(finalX, y, finalW, rowH * 2).stroke()
    doc.text('PROM. FINAL', finalX, y + rowH - 6, { width: finalW, align: 'center' })

    // Cabecera fila 2 (sub-columnas)
    const subLabels = ['Form.', 'Exam.', 'Proy.', 'Prom.']
    doc.fontSize(6)
    periods.forEach((_, pi) => {
      subLabels.forEach((lbl, si) => {
        doc.rect(colX(pi, si), y + rowH, subW, rowH).stroke()
        doc.text(lbl, colX(pi, si), y + rowH + 4, { width: subW, align: 'center' })
      })
    })
    y += rowH * 2

    const cell = (x: number, w: number, txt: string, bold = false) => {
      doc.rect(x, y, w, rowH).stroke()
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).text(txt, x, y + 4, { width: w, align: 'center' })
    }

    // Filas de materias cuantitativas
    data.subjects.forEach((s) => {
      doc.rect(left, y, subjW, rowH).stroke()
      doc.font('Helvetica').fontSize(7).text(s.subjectName, left + 3, y + 4, { width: subjW - 6, ellipsis: true })
      periods.forEach((p, pi) => {
        const g = s.periodGrades.find((x) => x.periodId === p.id)
        cell(colX(pi, 0), subW, NUM(g?.regularAvg ?? null))
        cell(colX(pi, 1), subW, NUM(g?.examenAvg ?? null))
        cell(colX(pi, 2), subW, NUM(g?.proyectoAvg ?? null))
        cell(colX(pi, 3), subW, NUM(g?.total ?? null), true)
      })
      cell(supleX, supleW, NUM(s.supletorio))
      cell(finalX, finalW, NUM(s.promFinal), true)
      y += rowH
    })

    // PROM. general por trimestre
    doc.rect(left, y, subjW, rowH).stroke()
    doc.font('Helvetica-Bold').fontSize(7).text('PROM.', left + 3, y + 4, { width: subjW - 6, align: 'right' })
    periods.forEach((p, pi) => {
      const vals = data.subjects
        .map((s) => s.periodGrades.find((x) => x.periodId === p.id)?.total)
        .filter((v): v is number => v != null)
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      doc.rect(colX(pi, 0), y, perPeriodW, rowH).stroke()
      doc.text(NUM(avg), colX(pi, 0), y + 4, { width: perPeriodW, align: 'center' })
    })
    doc.rect(supleX, y, supleW, rowH).stroke()
    cell(finalX, finalW, NUM(data.overallAverage), true)
    y += rowH

    // Filas de materias cualitativas (letra por trimestre)
    data.qualitativeSubjects.forEach((s) => {
      doc.rect(left, y, subjW, rowH).stroke()
      doc.font('Helvetica').fontSize(7).text(s.subjectName, left + 3, y + 4, { width: subjW - 6, ellipsis: true })
      periods.forEach((p, pi) => {
        const g = s.periodGrades.find((x) => x.periodId === p.id)
        doc.rect(colX(pi, 0), y, perPeriodW, rowH).stroke()
        doc.font('Helvetica-Bold').fontSize(7).text(g?.code ?? '—', colX(pi, 0), y + 4, { width: perPeriodW, align: 'center' })
      })
      doc.rect(supleX, y, supleW, rowH).stroke()
      cell(finalX, finalW, s.finalCode ?? '—', true)
      y += rowH
    })

    y += 10

    // ── Comportamiento + Faltas (izquierda) y Escala (derecha) ──
    const startY = y
    doc.font('Helvetica-Bold').fontSize(8).text('COMPORTAMIENTO', left, y)
    y = doc.y + 2
    doc.font('Helvetica').fontSize(7)
    const behaviorMap = new Map(data.behaviorByPeriod.map((b) => [b.periodId, b]))
    periods.forEach((p) => {
      const b = behaviorMap.get(p.id)
      doc.text(`${p.name}: ${b?.code ?? '—'}${b?.notes ? ` — ${b.notes}` : ''}`, left, doc.y + 1, { width: pageW * 0.6 })
    })
    y = doc.y + 6

    doc.font('Helvetica-Bold').fontSize(8).text('FALTAS / ATRASOS', left, y)
    y = doc.y + 2
    doc.font('Helvetica').fontSize(7)
    const att = new Map(data.attendanceByPeriod.map((a) => [a.periodId, a]))
    periods.forEach((p) => {
      const a = att.get(p.id)
      doc.text(
        `${p.name}: justif. ${a?.justifiedAbsences ?? 0} · injustif. ${a?.unjustifiedAbsences ?? 0} · asistidos ${a?.attendedDays ?? 0} · atrasos ${a?.lateCount ?? 0}`,
        left,
        doc.y + 1,
      )
    })

    // Escala (derecha)
    const scaleX = left + pageW * 0.62
    const scaleW = pageW * 0.38
    let sy = startY
    doc.font('Helvetica-Bold').fontSize(7)
    doc.text('ESCALA', scaleX, sy)
    sy = doc.y + 2
    data.qualitativeScale.forEach((lvl) => {
      const codes = data.qualitativeValueScale
        .filter((v) => v.min >= lvl.min && v.max <= lvl.max)
        .map((v) => v.code)
        .join(' ')
      doc.font('Helvetica').fontSize(6.5).text(
        `${lvl.label}  (${lvl.min.toFixed(2)}–${lvl.max.toFixed(2)})  ${codes}`,
        scaleX,
        sy,
        { width: scaleW },
      )
      sy = doc.y + 1
    })

    // ── Firmas ──
    const signY = doc.page.height - doc.page.margins.bottom - 30
    const colW = pageW / 2
    doc.font('Helvetica').fontSize(8)
    doc.text('_______________________________', left, signY, { width: colW, align: 'center' })
    doc.text(data.tutorName || '', left, signY + 12, { width: colW, align: 'center' })
    doc.text(data.teacherLabel || 'DOCENTE TUTOR/A', left, signY + 22, { width: colW, align: 'center' })
    doc.text('_______________________________', left + colW, signY, { width: colW, align: 'center' })
    doc.text(data.directorName || '', left + colW, signY + 12, { width: colW, align: 'center' })
    doc.text(data.directorRole || 'DIRECTOR/A', left + colW, signY + 22, { width: colW, align: 'center' })

    doc.end()
  })
}
