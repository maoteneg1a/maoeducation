/**
 * Catálogo completo de grados reales (EGB 1B-10B + BGU 1BGU-3BGU) con su
 * subnivel MINEDUC — mismos datos que `DEFAULT_LEVELS` (institution-bootstrap.ts)
 * y que `MULTIGRADE_GRADE_NAME`/`MULTIGRADE_GRADE_SORT_ORDER` (multigrade.ts),
 * pero de alcance GENERAL (incluye BGU, que multigrado rechaza explícitamente) —
 * lo usan los perfiles `subject-first`/`classroom-first` del wizard de
 * "Profesor Personal" para resolver un `Level.code` real en vez del código
 * sintético `'PERSONAL'` (bug real: sin un grado real, el filtro de
 * `CompetencySaber.gradeCodes` — que distingue saberes por grado dentro de un
 * mismo subnivel compartido — nunca encuentra coincidencia y bloquea la
 * generación de planificación por completo).
 */

export type Subnivel = 'inicial' | 'preparatoria' | 'elemental' | 'media' | 'superior' | 'bgu'

export interface GradeCatalogEntry {
  code: string
  name: string
  sortOrder: number
  subnivel: Subnivel
}

/**
 * Mismo orden y datos que DEFAULT_LEVELS (institution-bootstrap.ts) para EGB/BGU
 * — fuente única de verdad para grado->subnivel. "INICIAL" es la excepción: no
 * existe en DEFAULT_LEVELS (MINEDUC no lo distingue por grado individual, ni
 * TIGA ni el importador de gradeCodes lo cubren) y se crea aquí bajo demanda
 * la primera vez que un docente de Inicial completa el wizard — mismo patrón
 * findOrCreate que ya usan los Levels de multigrado.
 */
export const GRADE_CATALOG: GradeCatalogEntry[] = [
  { code: 'INICIAL', name: 'Inicial', sortOrder: 0, subnivel: 'inicial' },
  { code: '1B', name: '1ro de Básica', sortOrder: 1, subnivel: 'preparatoria' },
  { code: '2B', name: '2do de Básica', sortOrder: 2, subnivel: 'elemental' },
  { code: '3B', name: '3ro de Básica', sortOrder: 3, subnivel: 'elemental' },
  { code: '4B', name: '4to de Básica', sortOrder: 4, subnivel: 'elemental' },
  { code: '5B', name: '5to de Básica', sortOrder: 5, subnivel: 'media' },
  { code: '6B', name: '6to de Básica', sortOrder: 6, subnivel: 'media' },
  { code: '7B', name: '7mo de Básica', sortOrder: 7, subnivel: 'media' },
  { code: '8B', name: '8vo de Básica', sortOrder: 8, subnivel: 'superior' },
  { code: '9B', name: '9no de Básica', sortOrder: 9, subnivel: 'superior' },
  { code: '10B', name: '10mo de Básica', sortOrder: 10, subnivel: 'superior' },
  { code: '1BGU', name: '1ro de Bachillerato', sortOrder: 11, subnivel: 'bgu' },
  { code: '2BGU', name: '2do de Bachillerato', sortOrder: 12, subnivel: 'bgu' },
  { code: '3BGU', name: '3ro de Bachillerato', sortOrder: 13, subnivel: 'bgu' },
]

const BY_CODE = new Map(GRADE_CATALOG.map((g) => [g.code, g]))

/** Busca un grado real por code (ej. "6B") — null si no es un código de grado reconocido. */
export function findGradeByCode(code: string): GradeCatalogEntry | null {
  return BY_CODE.get(code.trim().toUpperCase()) ?? null
}
