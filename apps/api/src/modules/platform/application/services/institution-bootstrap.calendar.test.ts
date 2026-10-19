import { describe, expect, it } from 'vitest'
import { regimeCalendar } from './institution-bootstrap'

describe('regimeCalendar', () => {
  it('usa el año lectivo vigente para Sierra/Amazonía', () => {
    expect(regimeCalendar('SIERRA_AMAZONIA', new Date('2026-10-19')).yearName).toBe('2026-2027')
    // Antes del 9 de julio 2027 sigue vigente 2026-2027; después, el siguiente.
    expect(regimeCalendar('SIERRA_AMAZONIA', new Date('2027-03-01')).yearName).toBe('2026-2027')
    expect(regimeCalendar('SIERRA_AMAZONIA', new Date('2027-07-10')).yearName).toBe('2027-2028')
  })

  it('usa el año lectivo vigente para Costa/Galápagos', () => {
    expect(regimeCalendar('COSTA_GALAPAGOS', new Date('2027-03-01')).yearName).toBe('2027-2028')
    expect(regimeCalendar('COSTA_GALAPAGOS', new Date('2028-01-05')).yearName).toBe('2027-2028')
  })

  it('desplaza también las fechas de los períodos', () => {
    const cal = regimeCalendar('SIERRA_AMAZONIA', new Date('2029-01-15'))
    expect(cal.yearName).toBe('2028-2029')
    expect(cal.startDate).toBe('2028-09-01')
    expect(cal.periods[2].endDate).toBe('2029-07-09')
  })
})
