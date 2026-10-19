import * as XLSX from 'xlsx'
import type { AttendanceReportData, EnrollmentReportData, GradesReportData } from '../api/reports.api'

function safeName(s: string) {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_').slice(0, 80)
}

function download(sheets: Array<{ name: string; rows: Array<Array<string | number | null>> }>, fileName: string) {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows)
    ws['!cols'] = (sheet.rows[0] ?? []).map((_, i) => ({ wch: i === 1 ? 32 : 12 }))
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${safeName(fileName)}.xlsx`)
}

/** Libro de calificaciones: una columna por actividad + promedio del período. */
export function exportGradesReport(data: GradesReportData) {
  const acts = data.insumos.flatMap((i) => i.activities.map((a) => ({ ...a, insumo: i.name })))
  const header = ['#', 'Estudiante', 'Cédula', ...acts.map((a) => `${a.insumo} · ${a.name} (/${Number(a.maxScore)})`), 'Promedio']
  const rows = data.students.map((s, i) => [
    i + 1,
    `${s.student.profile.lastName} ${s.student.profile.firstName}`,
    s.student.profile.dni ?? '',
    ...acts.map((a) => (s.grades[a.id] != null ? Number(Number(s.grades[a.id]).toFixed(2)) : null)),
    s.summary?.total != null ? Number(Number(s.summary.total).toFixed(2)) : null,
  ])
  const a = data.assignment
  download(
    [{ name: 'Calificaciones', rows: [header, ...rows] }],
    `Notas_${a.subject.name}_${a.parallel.level.name}_${a.parallel.name}_${a.academicYear.name}`,
  )
}

/** Registro de asistencia por fecha con totales P/A/T/J. */
export function exportAttendanceReport(data: AttendanceReportData) {
  const short: Record<string, string> = { present: 'P', absent: 'A', late: 'T', excused: 'J' }
  const header = ['#', 'Estudiante', ...data.dates, 'P', 'A', 'T', 'J']
  const rows = data.students.map((s, i) => {
    const counts = { present: 0, absent: 0, late: 0, excused: 0 } as Record<string, number>
    const cells = data.dates.map((d) => {
      const st = s.records[d]
      if (st && st in counts) counts[st]++
      return st ? short[st] ?? st : ''
    })
    return [i + 1, `${s.student.profile.lastName} ${s.student.profile.firstName}`, ...cells, counts.present, counts.absent, counts.late, counts.excused]
  })
  const a = data.assignment
  download(
    [{ name: 'Asistencia', rows: [header, ...rows] }],
    `Asistencia_${a.subject.name}_${a.parallel.level.name}_${a.parallel.name}`,
  )
}

/** Nómina de matrícula: una hoja por paralelo + hoja consolidada. */
export function exportEnrollmentReport(data: EnrollmentReportData) {
  const header = ['#', 'Apellidos', 'Nombres', 'Cédula', 'Fecha nac.', 'Estado']
  const toRow = (e: EnrollmentReportData['parallels'][number]['enrollments'][number], i: number) => [
    i + 1,
    e.student.profile.lastName,
    e.student.profile.firstName,
    e.student.profile.dni ?? '',
    e.student.profile.birthDate?.slice(0, 10) ?? '',
    e.status,
  ]
  const all = data.parallels.flatMap((p) =>
    p.enrollments.map((e) => [`${p.parallel.level.name} ${p.parallel.name}`, ...toRow(e, 0).slice(1)]),
  )
  download(
    [
      { name: 'Todos', rows: [['Paralelo', ...header.slice(1)], ...all] },
      ...data.parallels.map((p) => ({
        name: `${p.parallel.level.name} ${p.parallel.name}`,
        rows: [header, ...p.enrollments.map(toRow)],
      })),
    ],
    `Matricula_${data.year.name}`,
  )
}
