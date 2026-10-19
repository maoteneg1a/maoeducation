import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { AppError } from '../../../shared/domain/errors/app.errors'

/** Clave independiente de JWT. No se genera automáticamente ni se escribe en la BD. */
export class DeceCrypto {
  private key: Buffer | null
  constructor(hexKey?: string) {
    this.key = hexKey && /^[a-f0-9]{64}$/i.test(hexKey) ? Buffer.from(hexKey, 'hex') : null
  }
  get ready() {
    return !!this.key
  }
  private requireKey() {
    if (!this.key)
      throw new AppError(
        'El almacenamiento protegido de DECE no está configurado. Contacta al administrador técnico.',
        503,
        'DECE_UNAVAILABLE',
      )
    return this.key
  }
  encrypt(value: unknown, context: string) {
    const iv = randomBytes(12)
    const authenticated = createCipheriv('aes-256-gcm', this.requireKey(), iv)
    authenticated.setAAD(Buffer.from(context))
    const encrypted = Buffer.concat([
      authenticated.update(JSON.stringify(value), 'utf8'),
      authenticated.final(),
    ])
    return [
      'v1',
      iv.toString('base64'),
      authenticated.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.')
  }
  decrypt<T>(value: string, context: string): T {
    const key = this.requireKey()
    try {
      const [version, iv, tag, payload] = value.split('.')
      if (version !== 'v1') throw new Error('version')
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
      decipher.setAAD(Buffer.from(context))
      decipher.setAuthTag(Buffer.from(tag, 'base64'))
      return JSON.parse(
        Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString(
          'utf8',
        ),
      ) as T
    } catch {
      throw new AppError(
        'No se pudo abrir el registro protegido. Contacta al administrador técnico.',
        503,
        'DECE_UNAVAILABLE',
      )
    }
  }
}
