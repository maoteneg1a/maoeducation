import { describe, expect, it } from 'vitest'
import { withPlanReportDefaults, type PlanReportDefaults } from './plan-report-defaults'

const plan: PlanReportDefaults = { teacher: 'Docente de la asignatura', mode: 'GROUP', subject: 'Matemática', learningTarget: 'Fracciones equivalentes', objective: 'Resolver problemas de fracciones', strategy: 'Práctica guiada', resources: 'Material concreto', evaluation: 'Lista de cotejo', startDate: '2026-10-26' }
const fields = ['docente_refuerzo', 'agrupacion', 'objetivo', 'horario', 'fecha_inicio', 'matematica_saberes', 'matematica_estrategias', 'matematica_recursos', 'matematica_evaluacion', 'matematica_indicador', 'lengua_saberes'].map((key) => ({ key, label: key, type: 'text' as const, required: false }))
const type = { pdfTemplate: 'annex_plan' as const, fields }

describe('datos del plan reutilizados en anexos', () => {
  it('completa desde datos registrados sin inventar horarios ni indicadores curriculares', () => {
    const result = withPlanReportDefaults(type, {}, plan)
    expect(result).toMatchObject({ docente_refuerzo: plan.teacher, agrupacion: 'Pequeño grupo', objetivo: plan.objective, fecha_inicio: plan.startDate, matematica_saberes: plan.learningTarget, matematica_estrategias: plan.strategy })
    expect(result).not.toHaveProperty('horario')
    expect(result).not.toHaveProperty('matematica_indicador')
    expect(result).not.toHaveProperty('lengua_saberes')
  })
  it('conserva todos los valores explícitos, incluso los vaciados por el docente', () => {
    const content = { objetivo: 'Objetivo específico del informe', fecha_inicio: '', docente_refuerzo: 'Otro docente de refuerzo' }
    expect(withPlanReportDefaults(type, content, plan)).toMatchObject(content)
    expect(content).toEqual({ objetivo: 'Objetivo específico del informe', fecha_inicio: '', docente_refuerzo: 'Otro docente de refuerzo' })
  })
  it('no coloca aprendizajes de ciencias o inglés en la matriz de otra asignatura', () => {
    for (const subject of ['Ciencias Naturales', 'Lengua extranjera: Inglés']) {
      const result = withPlanReportDefaults(type, {}, { ...plan, subject, startDate: null })
      expect(result).not.toHaveProperty('matematica_saberes')
      expect(result).not.toHaveProperty('lengua_saberes')
      expect(result).not.toHaveProperty('fecha_inicio')
    }
  })
  it('solo completa los campos de la plantilla y no altera informes generales', () => {
    expect(withPlanReportDefaults({ ...type, fields: [] }, {}, plan)).toEqual({})
    expect(withPlanReportDefaults({ fields }, { objetivo: 'Original' }, plan)).toEqual({ objetivo: 'Original' })
    expect(withPlanReportDefaults(type, {}, null)).toEqual({})
  })
})
