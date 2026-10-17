export interface BulletinWeights {
  /** Peso conjunto de examen + proyecto. */
  examWeight?: number
  projectWeight?: number | null
}

export type BulletinGradeKey = 'regularAvg' | 'examenAvg' | 'proyectoAvg' | 'total'
export interface BulletinGradeColumn {
  key: BulletinGradeKey
  label: string
  weight: number | null
}

export function bulletinWeight(subject: BulletinWeights, key: BulletinGradeKey): number {
  const sum = subject.examWeight ?? 30
  const project = subject.projectWeight ?? sum / 2
  if (key === 'regularAvg') return 100 - sum
  if (key === 'examenAvg') return sum - project
  if (key === 'proyectoAvg') return project
  return 100
}

/** Oculta componentes sin peso y usa porcentajes comunes solo si todas las materias coinciden. */
export function bulletinGradeColumns(subjects: BulletinWeights[]): BulletinGradeColumn[] {
  if (subjects.length === 0) return [{ key: 'total', label: 'Prom.', weight: null }]
  const components: BulletinGradeColumn[] = [
    { key: 'regularAvg', label: 'Form.', weight: 70 },
    { key: 'examenAvg', label: 'Exam.', weight: 15 },
    { key: 'proyectoAvg', label: 'Proy.', weight: 15 },
  ]
  const columns = components.flatMap((column) => {
    const weights = subjects.map((subject) => bulletinWeight(subject, column.key))
    if (weights.every((weight) => weight === 0)) return []
    return [{ ...column, weight: weights.every((weight) => weight === weights[0]) ? weights[0] : null }]
  })
  return [...columns, { key: 'total', label: 'Prom.', weight: null }]
}
