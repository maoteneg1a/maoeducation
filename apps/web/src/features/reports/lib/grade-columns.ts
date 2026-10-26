import type { GradeSummary, GradesReportData } from '../api/reports.api'

export function evaluationLabel(code: string): string {
  return code === 'exam' ? 'Sumativa · Examen' : code === 'project' ? 'Sumativa · Proyecto' : 'Formativa'
}

/** Mismos componentes y porcentajes de la asignatura en pantalla y Excel. */
export function gradeSummaryColumns(assignment: GradesReportData['assignment']): Array<{ key: keyof Pick<GradeSummary, 'insumosBase' | 'examenAvg' | 'proyectoAvg' | 'summativeAvg' | 'total'>; label: string }> {
  const sum = assignment.examWeight
  const project = assignment.projectWeight ?? sum / 2
  return [
    { key: 'insumosBase' as const, label: `Formativa (${100 - sum} %)` },
    ...(sum - project > 0 ? [{ key: 'examenAvg' as const, label: `Examen (${sum - project} %)` }] : []),
    ...(project > 0 ? [{ key: 'proyectoAvg' as const, label: `Proyecto (${project} %)` }] : []),
    ...(sum > 0 ? [{ key: 'summativeAvg' as const, label: `Sumativa (${sum} %)` }] : []),
    { key: 'total' as const, label: 'Promedio del período' },
  ]
}
