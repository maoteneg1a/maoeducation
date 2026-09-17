/**
 * Dominio de Multigrado — calcado de las reglas de negocio autoritativas de
 * TIGA Multigrado v1.0 (MULTIGRADO-v1.0-FREEZE.md / multigrade_planning_domain.py
 * / multigrade_curriculum_gateway.py, con acuerdo explícito de reutilización):
 *
 *  - Unidocente y pluridocente usan selección flexible; NO hay número fijo de
 *    grados (mínimo 2 selecciones grado+materia para que tenga sentido un
 *    "contexto multigrado" — MINIMUM_SELECTIONS_REQUIRED).
 *  - Cada participación se selecciona explícitamente como grado + asignatura
 *    (nunca "todos los grados con todas las materias" implícito).
 *  - Prioridad de producto 1.º-7.º EGB. 8.º-10.º EGB requieren activar
 *    explícitamente una "extensión superior" (flag aparte, nunca automático).
 *  - BGU NO está permitido en multigrado — se rechaza explícitamente.
 *  - 1.º EGB reutiliza el currículo de Preparatoria (en Auleka: subnivel
 *    "preparatoria" del catálogo ya existente).
 *  - Cada grado conserva SU PROPIO currículo/competencia/indicador/saberes
 *    independientes — nunca se inventa un currículo común "promedio".
 *
 * Adaptado a la convención real de Auleka: Level.code usa "1B".."10B" para EGB
 * y "1BGU".."3BGU" para bachillerato (ver DEFAULT_LEVELS en institution-bootstrap.ts),
 * en vez de la convención "1EGB".."10EGB" de TIGA — el mapeo de subnivel es el
 * mismo (confirmado contra DEFAULT_LEVELS): 1B=preparatoria, 2B-4B=elemental,
 * 5B-7B=media, 8B-10B=superior.
 */

export const MINIMUM_MULTIGRADE_SELECTIONS = 2

export class MultigradeDomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly gradeCode?: string,
  ) {
    super(message)
    this.name = 'MultigradeDomainError'
  }
}

export type MultigradeSubnivel = 'preparatoria' | 'elemental' | 'media' | 'superior'

/** Grados EGB permitidos en multigrado, en el mismo orden que DEFAULT_LEVELS. */
const EGB_GRADE_SUBNIVEL: Record<string, MultigradeSubnivel> = {
  '1B': 'preparatoria',
  '2B': 'elemental',
  '3B': 'elemental',
  '4B': 'elemental',
  '5B': 'media',
  '6B': 'media',
  '7B': 'media',
  '8B': 'superior',
  '9B': 'superior',
  '10B': 'superior',
}

/** Grados que requieren `allowSuperiorExtension=true` explícito (8vo-10mo EGB). */
const SUPERIOR_EXTENSION_GRADES = new Set(['8B', '9B', '10B'])

/** Normaliza el código de grado recibido (tolera minúsculas/espacios) contra el catálogo real de Level.code. */
function normalizeGradeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

/**
 * Valida y resuelve un código de grado para multigrado — rechaza BGU
 * explícitamente, rechaza cualquier código fuera del catálogo EGB 1-10, y
 * exige `allowSuperiorExtension` si el grado es 8vo-10mo EGB. Calcado 1:1 de
 * `MultigradeCurriculumGateway._canonical_grade` de TIGA.
 */
export function resolveMultigradeGrade(
  rawGradeCode: string,
  allowSuperiorExtension: boolean,
): { gradeCode: string; subnivel: MultigradeSubnivel } {
  const gradeCode = normalizeGradeCode(rawGradeCode)

  if (gradeCode.endsWith('BGU')) {
    throw new MultigradeDomainError(
      `BGU no está disponible en el modo multigrado (grado recibido: ${rawGradeCode}). El multigrado solo cubre 1.º a 10.º de EGB.`,
      'BGU_NOT_ALLOWED_IN_MULTIGRADE',
      gradeCode,
    )
  }

  const subnivel = EGB_GRADE_SUBNIVEL[gradeCode]
  if (!subnivel) {
    throw new MultigradeDomainError(
      `El grado "${rawGradeCode}" está fuera del rango permitido en multigrado (1.º a 10.º de EGB).`,
      'GRADE_OUTSIDE_MULTIGRADE_RANGE',
      gradeCode,
    )
  }

  if (SUPERIOR_EXTENSION_GRADES.has(gradeCode) && !allowSuperiorExtension) {
    throw new MultigradeDomainError(
      `El grado "${rawGradeCode}" (8vo-10mo de EGB) requiere confirmar explícitamente la extensión superior antes de continuar. Activa "allowSuperiorExtension" para incluirlo.`,
      'SUPERIOR_EXTENSION_REQUIRED',
      gradeCode,
    )
  }

  return { gradeCode, subnivel }
}

export interface MultigradeSelectionInput {
  gradeCode: string
  subjectAreaId: string
}

export interface ResolvedMultigradeSelection {
  gradeCode: string
  subnivel: MultigradeSubnivel
  subjectAreaId: string
}

/**
 * Valida la lista completa de selecciones grado+materia del wizard: mínimo 2
 * (MINIMUM_MULTIGRADE_SELECTIONS), sin duplicados exactos (mismo grado+área
 * dos veces), y cada una pasando por `resolveMultigradeGrade`. All-or-nothing:
 * si UNA selección falla, se rechaza la lista completa (calcado del
 * orquestador de TIGA — nunca se crea un grupo multigrado a medias).
 */
export function resolveMultigradeSelections(
  selections: MultigradeSelectionInput[],
  allowSuperiorExtension: boolean,
): ResolvedMultigradeSelection[] {
  if (selections.length < MINIMUM_MULTIGRADE_SELECTIONS) {
    throw new MultigradeDomainError(
      `El modo multigrado requiere al menos ${MINIMUM_MULTIGRADE_SELECTIONS} selecciones de grado+materia — con solo una no hay contexto multigrado que coordinar.`,
      'MINIMUM_SELECTIONS_REQUIRED',
    )
  }

  const resolved = selections.map((s) => ({
    ...resolveMultigradeGrade(s.gradeCode, allowSuperiorExtension),
    subjectAreaId: s.subjectAreaId,
  }))

  const seen = new Set<string>()
  for (const r of resolved) {
    const key = `${r.gradeCode}::${r.subjectAreaId}`
    if (seen.has(key)) {
      throw new MultigradeDomainError(
        `La combinación grado "${r.gradeCode}" + materia ya fue seleccionada más de una vez.`,
        'DUPLICATE_SELECTION',
        r.gradeCode,
      )
    }
    seen.add(key)
  }

  return resolved
}

/** Level.code -> nombre legible, mismo catálogo que DEFAULT_LEVELS (institution-bootstrap.ts). */
export const MULTIGRADE_GRADE_NAME: Record<string, string> = {
  '1B': '1ro de Básica',
  '2B': '2do de Básica',
  '3B': '3ro de Básica',
  '4B': '4to de Básica',
  '5B': '5to de Básica',
  '6B': '6to de Básica',
  '7B': '7mo de Básica',
  '8B': '8vo de Básica',
  '9B': '9no de Básica',
  '10B': '10mo de Básica',
}

export const MULTIGRADE_GRADE_SORT_ORDER: Record<string, number> = {
  '1B': 1,
  '2B': 2,
  '3B': 3,
  '4B': 4,
  '5B': 5,
  '6B': 6,
  '7B': 7,
  '8B': 8,
  '9B': 9,
  '10B': 10,
}
