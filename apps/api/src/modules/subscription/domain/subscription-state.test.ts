import { describe, expect, it } from 'vitest'
import { computeSubscriptionStatus, type SubscriptionPeriod } from './subscription-state'

const DAY = 24 * 60 * 60 * 1000
const NOW = new Date('2026-06-15T12:00:00.000Z')

function period(overrides: Partial<SubscriptionPeriod> = {}): SubscriptionPeriod {
  return {
    plan: 'paid',
    startsAt: new Date(NOW.getTime() - 100 * DAY),
    expiresAt: new Date(NOW.getTime() + 100 * DAY),
    graceDays: 7,
    suspendedAt: null,
    ...overrides,
  }
}

describe('estado de la suscripción', () => {
  it('está activa y escribe cuando falta mucho para vencer', () => {
    const s = computeSubscriptionStatus(period(), NOW)
    expect(s.state).toBe('active')
    expect(s.readOnly).toBe(false)
    expect(s.expiringSoon).toBe(false)
    expect(s.daysRemaining).toBe(100)
  })

  it('distingue prueba de pagada aunque las fechas sean iguales', () => {
    expect(computeSubscriptionStatus(period({ plan: 'trial' }), NOW).state).toBe('trial')
  })

  it('avisa a los 30 días pero sigue escribiendo', () => {
    const s = computeSubscriptionStatus(
      period({ expiresAt: new Date(NOW.getTime() + 30 * DAY) }),
      NOW,
    )
    expect(s.state).toBe('active')
    expect(s.expiringSoon).toBe(true)
    expect(s.readOnly).toBe(false)
  })

  it('a los 31 días todavía no avisa', () => {
    const s = computeSubscriptionStatus(
      period({ expiresAt: new Date(NOW.getTime() + 31 * DAY) }),
      NOW,
    )
    expect(s.expiringSoon).toBe(false)
  })

  it('entra en gracia al vencer y NO corta la escritura', () => {
    const s = computeSubscriptionStatus(
      period({ expiresAt: new Date(NOW.getTime() - 1 * DAY) }),
      NOW,
    )
    expect(s.state).toBe('grace')
    expect(s.readOnly).toBe(false)
    expect(s.daysRemaining).toBeLessThanOrEqual(0)
  })

  it('aguanta hasta el último instante de la gracia', () => {
    const expiresAt = new Date(NOW.getTime() - 7 * DAY + 1000)
    expect(computeSubscriptionStatus(period({ expiresAt }), NOW).state).toBe('grace')
  })

  it('pasa a solo-lectura cuando se cumple la gracia', () => {
    const s = computeSubscriptionStatus(
      period({ expiresAt: new Date(NOW.getTime() - 7 * DAY) }),
      NOW,
    )
    expect(s.state).toBe('readonly')
    expect(s.readOnly).toBe(true)
  })

  it('con graceDays 0 corta apenas vence', () => {
    const s = computeSubscriptionStatus(
      period({ expiresAt: new Date(NOW.getTime() - 1000), graceDays: 0 }),
      NOW,
    )
    expect(s.state).toBe('readonly')
  })

  it('la suspensión manual gana aunque las fechas estén vigentes', () => {
    const s = computeSubscriptionStatus(period({ suspendedAt: NOW }), NOW)
    expect(s.state).toBe('suspended')
    expect(s.readOnly).toBe(true)
    // No debe anunciarse como "por vencer" mientras está suspendida.
    expect(s.expiringSoon).toBe(false)
  })

  it('expone graceEndsAt como el corte real de escritura', () => {
    const expiresAt = new Date('2026-07-01T00:00:00.000Z')
    const s = computeSubscriptionStatus(period({ expiresAt, graceDays: 7 }), NOW)
    expect(s.graceEndsAt).toBe('2026-07-08T00:00:00.000Z')
  })
})
