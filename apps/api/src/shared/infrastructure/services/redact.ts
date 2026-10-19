/** Copia del body sin campos sensibles (password, token, secret, apiKey...). */
export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        /password|token|secret|apikey|api_key/i.test(k) ? [k, '[redactado]'] : [k, redactSecrets(v)],
      ),
    )
  }
  return value ?? null
}
