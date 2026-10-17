import { describe, expect, it } from 'vitest'
import { bulletinGradeColumns, bulletinWeight } from './bulletin-grade-columns'

describe('bulletin columns match the configured grading percentages', () => {
  it('shows 70/20/10 instead of fixed 70/15/15 labels', () => {
    expect(bulletinGradeColumns([{ examWeight: 30, projectWeight: 10 }])).toEqual([
      { key: 'regularAvg', label: 'Form.', weight: 70 },
      { key: 'examenAvg', label: 'Exam.', weight: 20 },
      { key: 'proyectoAvg', label: 'Proy.', weight: 10 },
      { key: 'total', label: 'Prom.', weight: null },
    ])
  })

  it('removes project columns when project is disabled in all subjects', () => {
    const columns = bulletinGradeColumns([{ examWeight: 30, projectWeight: 0 }, { examWeight: 30, projectWeight: 0 }])
    expect(columns.map((column) => column.key)).toEqual(['regularAvg', 'examenAvg', 'total'])
    expect(columns[1].weight).toBe(30)
  })

  it('keeps a project column if at least one subject uses it and marks differing weights', () => {
    const columns = bulletinGradeColumns([{ examWeight: 30, projectWeight: 0 }, { examWeight: 30, projectWeight: 10 }])
    expect(columns.find((column) => column.key === 'proyectoAvg')).toMatchObject({ weight: null })
    expect(bulletinWeight({ examWeight: 30, projectWeight: 0 }, 'proyectoAvg')).toBe(0)
  })

  it('shows just formative and average when exam and project are both zero', () => {
    expect(bulletinGradeColumns([{ examWeight: 0, projectWeight: 0 }]).map((column) => column.key)).toEqual(['regularAvg', 'total'])
  })

  it('preserves the legacy split for existing subjects without project weights', () => {
    expect(bulletinGradeColumns([{ examWeight: 30 }]).map((column) => column.weight)).toEqual([70, 15, 15, null])
  })

  it('does not show arbitrary percentage headers when there are no quantitative subjects', () => {
    expect(bulletinGradeColumns([])).toEqual([{ key: 'total', label: 'Prom.', weight: null }])
  })
})
