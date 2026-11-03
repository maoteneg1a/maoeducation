/** Preserve foreign student codes; never discard letters or punctuation to make a document valid. */
export function normalizeStudentDocument(value: string): string {
  return value.trim().toUpperCase()
}

export function isValidStudentDocument(value: string): boolean {
  return /^(?:\d{10}|(?=[A-Z0-9]{6,20}$)(?=.*[A-Z])(?=.*\d)[A-Z0-9]+)$/.test(value)
}

export const STUDENT_DOCUMENT_ERROR = 'Ingresa una cédula de 10 dígitos o un código de extranjero alfanumérico de 6 a 20 caracteres'
