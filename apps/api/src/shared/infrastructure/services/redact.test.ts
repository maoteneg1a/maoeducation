import { describe, expect, it } from 'vitest'
import { redactSecrets } from './redact'

describe('redactSecrets', () => {
  it('oculta contraseñas, tokens y secretos en cualquier nivel', () => {
    expect(
      redactSecrets({ email: 'a@b.co', password: 'x', admin: { newPassword: 'y', apiKey: 'z' }, list: [{ token: 't' }] }),
    ).toEqual({
      email: 'a@b.co',
      password: '[redactado]',
      admin: { newPassword: '[redactado]', apiKey: '[redactado]' },
      list: [{ token: '[redactado]' }],
    })
  })

  it('devuelve null para valores vacíos', () => {
    expect(redactSecrets(undefined)).toBeNull()
  })
})
