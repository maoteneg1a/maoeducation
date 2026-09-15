/**
 * Título de una situación de aprendizaje derivado de su competencia.
 *
 * Existe para que el docente no escriba nada al crear el bloque: elige periodo y
 * competencia, y el título sale de ahí. Puro y testeado porque el campo
 * `learning_situations.title` es VarChar(200) y los textos de competencia del
 * CNC pasan de 150 caracteres — truncar mal es un error que solo aparece al
 * guardar, con un fallo de base de datos poco legible.
 */

/** Tope real de la columna. */
export const SITUATION_TITLE_MAX = 200

/** Margen para el código + separador sin arriesgar el límite de la columna. */
const TEXT_BUDGET = 150

/**
 * "CE.M.3.1 — Resolver problemas de la vida cotidiana mediante el uso…"
 *
 * Corta en el último espacio antes del presupuesto para no partir una palabra,
 * y agrega puntos suspensivos solo si de verdad recortó.
 */
export function buildSituationTitle(code: string, text: string): string {
  const cleanCode = code.trim()
  const cleanText = text.trim().replace(/\s+/g, ' ')

  if (!cleanText) return cleanCode

  let shortText = cleanText
  if (cleanText.length > TEXT_BUDGET) {
    const cut = cleanText.slice(0, TEXT_BUDGET)
    const lastSpace = cut.lastIndexOf(' ')
    // Sin espacios (una sola palabra larguísima) se corta duro: mejor eso que
    // devolver la cadena entera y reventar el límite de la columna.
    shortText = `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:]$/, '')}…`
  }

  const title = cleanCode ? `${cleanCode} — ${shortText}` : shortText
  // Cinturón por si el código viniera anormalmente largo.
  return title.length > SITUATION_TITLE_MAX ? title.slice(0, SITUATION_TITLE_MAX - 1) + '…' : title
}
