import { describe, expect, it } from 'vitest'
import { MUTATING_METHODS, guardsRequest, isExempt } from './write-guard-policy'

describe('alcance del modo solo-lectura', () => {
  it('no intercepta lecturas — consultar y exportar nunca se bloquea', () => {
    for (const m of ['GET', 'HEAD', 'OPTIONS']) {
      expect(MUTATING_METHODS.has(m)).toBe(false)
      expect(guardsRequest(m, '/api/v1/grades')).toBe(false)
    }
  })

  it('intercepta todo lo que escribe', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(guardsRequest(m, '/api/v1/grades')).toBe(true)
    }
  })

  it('deja pasar pagar y renovar — si no, el cliente no puede salir del bloqueo', () => {
    expect(isExempt('/api/v1/subscription')).toBe(true)
    expect(guardsRequest('POST', '/api/v1/subscription/payments')).toBe(false)
  })

  it('deja pasar login y refresh', () => {
    expect(guardsRequest('POST', '/api/v1/auth/login')).toBe(false)
    expect(guardsRequest('POST', '/api/v1/auth/refresh')).toBe(false)
  })

  it('deja pasar al superadmin, incluidas sus rutas de suscripción', () => {
    expect(guardsRequest('POST', '/api/v1/platform/subscription-payments/abc/approve')).toBe(false)
    expect(guardsRequest('PUT', '/api/v1/platform/subscriptions/abc/validity')).toBe(false)
  })

  it('bloquea las rutas de negocio', () => {
    for (const p of ['/api/v1/grades', '/api/v1/activities', '/api/v1/planning/plans', '/api/v1/attendance']) {
      expect(guardsRequest('POST', p)).toBe(true)
    }
  })

  it('no exime por prefijo de texto: compara por segmento completo', () => {
    // Empieza con "/api/v1/auth" pero es otro recurso.
    expect(isExempt('/api/v1/authorizations')).toBe(false)
    expect(isExempt('/api/v1/subscriptions-legacy')).toBe(false)
    expect(isExempt('/api/v1/platformx')).toBe(false)
  })

  it('ignora el query string (lo recorta quien llama)', () => {
    expect(guardsRequest('POST', '/api/v1/subscription/payments')).toBe(false)
  })
})
