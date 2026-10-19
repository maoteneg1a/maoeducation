import { describe, expect, it } from 'vitest'
import { DeceCrypto } from './dece-crypto'
const crypto = new DeceCrypto('1a'.repeat(32))
describe('cifrado del expediente DECE', () => {
  it('cifra con IV independiente y recupera el contenido sin texto plano', () => {
    const content = { narrative: 'Relato confidencial de prueba', safeContact: 'Contacto seguro' }
    const first = crypto.encrypt(content, 'tenant:case:report')
    const second = crypto.encrypt(content, 'tenant:case:report')
    expect(first).not.toBe(second)
    expect(first).not.toContain(content.narrative)
    expect(crypto.decrypt(first, 'tenant:case:report')).toEqual(content)
  })
  it('rechaza copiar el contenido a otra institución o expediente, o usar otra clave', () => {
    const encrypted = crypto.encrypt({ narrative: 'Prueba' }, 'tenant:case:report')
    expect(() => crypto.decrypt(encrypted, 'other:case:report')).toThrow()
    expect(() => crypto.decrypt(encrypted, 'tenant:other:report')).toThrow()
    expect(() => new DeceCrypto('2b'.repeat(32)).decrypt(encrypted, 'tenant:case:report')).toThrow()
    const parts = encrypted.split('.')
    const changed = Buffer.from(parts[3], 'base64')
    changed[0] ^= 1
    parts[3] = changed.toString('base64')
    expect(() => crypto.decrypt(parts.join('.'), 'tenant:case:report')).toThrow()
  })
  it('no permite escribir ni leer si la clave no está configurada', () => {
    expect(new DeceCrypto().ready).toBe(false)
    expect(() => new DeceCrypto().encrypt({}, 'context')).toThrow()
    expect(() => new DeceCrypto().decrypt('v1.invalid', 'context')).toThrow()
  })
})
