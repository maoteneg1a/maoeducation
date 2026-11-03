/** Keep foreign student identifiers intact, including their letters and leading zeroes. */
export function normalizeStudentDocument(value: unknown): string {
  const document = String(value ?? '').trim().toUpperCase()
  // Recover a leading zero only when Excel supplied a numeric cell, never for source text.
  return typeof value === 'number' && /^\d{9}$/.test(document) ? document.padStart(10, '0') : document
}

export function isValidStudentDocument(value: string): boolean {
  return /^(?:\d{10}|(?=[A-Z0-9]{6,20}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+)$/.test(value)
}

export const STUDENT_DOCUMENT_ERROR = 'Ingresa una cédula de 10 dígitos o un código de extranjero alfanumérico de 6 a 20 caracteres'
