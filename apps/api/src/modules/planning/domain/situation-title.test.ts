import { describe, expect, it } from 'vitest'
import { SITUATION_TITLE_MAX, buildSituationTitle } from './situation-title'

const LONG_COMPETENCY =
  'Resolver problemas de la vida cotidiana mediante el uso reflexivo de tecnologías digitales, estrategias de cálculo y algoritmos de las operaciones básicas con números naturales, decimales y fraccionarios'

describe('título derivado de la competencia', () => {
  it('junta código y texto cuando el texto es corto', () => {
    expect(buildSituationTitle('CE.M.3.1', 'Resolver problemas simples')).toBe(
      'CE.M.3.1 — Resolver problemas simples',
    )
  })

  it('nunca pasa el límite de la columna, aun con textos reales del CNC', () => {
    const title = buildSituationTitle('CE.M.3.1', LONG_COMPETENCY)
    expect(title.length).toBeLessThanOrEqual(SITUATION_TITLE_MAX)
  })

  it('no parte palabras a la mitad', () => {
    const title = buildSituationTitle('CE.M.3.1', LONG_COMPETENCY)
    const withoutEllipsis = title.replace(/…$/, '')
    // La última palabra del título recortado debe existir completa en el original.
    const lastWord = withoutEllipsis.split(' ').pop()!
    expect(LONG_COMPETENCY).toContain(lastWord)
  })

  it('marca con puntos suspensivos solo si recortó', () => {
    expect(buildSituationTitle('CE.M.3.1', 'Texto corto')).not.toContain('…')
    expect(buildSituationTitle('CE.M.3.1', LONG_COMPETENCY)).toContain('…')
  })

  it('normaliza espacios y saltos de línea del texto original', () => {
    expect(buildSituationTitle('CE.LL.2.1', '  Leer   textos\n  variados  ')).toBe(
      'CE.LL.2.1 — Leer textos variados',
    )
  })

  it('aguanta un código vacío sin dejar el separador huérfano', () => {
    expect(buildSituationTitle('', 'Resolver problemas')).toBe('Resolver problemas')
  })

  it('aguanta texto vacío devolviendo solo el código', () => {
    expect(buildSituationTitle('CE.M.3.1', '   ')).toBe('CE.M.3.1')
  })

  it('corta duro una palabra sin espacios en vez de reventar la columna', () => {
    const title = buildSituationTitle('CE.M.3.1', 'a'.repeat(400))
    expect(title.length).toBeLessThanOrEqual(SITUATION_TITLE_MAX)
  })

  it('no deja puntuación colgando antes de los puntos suspensivos', () => {
    const title = buildSituationTitle('CE.M.3.1', LONG_COMPETENCY)
    expect(title).not.toMatch(/[.,;:]…$/)
  })
})
