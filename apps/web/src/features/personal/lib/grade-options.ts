/**
 * Catálogo de grados para los selectores de cuentas personales — compartido
 * entre el wizard de onboarding (PersonalSetupPage) y la edición posterior
 * (PersonalClassesPage en Configuración). Mismos datos que GRADE_CATALOG
 * (apps/api/src/shared/domain/grade-catalog.ts).
 */

export interface GradeOption {
  value: string
  label: string
  hint: string
}

/** Grado REAL que enseña el docente — incluye Inicial y BGU. */
export const GRADE_OPTIONS: GradeOption[] = [
  { value: 'INICIAL', label: 'Inicial', hint: 'Maternal / 3 a 5 años' },
  { value: '1B', label: '1ro de Básica', hint: 'Preparatoria' },
  { value: '2B', label: '2do de Básica', hint: 'Elemental' },
  { value: '3B', label: '3ro de Básica', hint: 'Elemental' },
  { value: '4B', label: '4to de Básica', hint: 'Elemental' },
  { value: '5B', label: '5to de Básica', hint: 'Media' },
  { value: '6B', label: '6to de Básica', hint: 'Media' },
  { value: '7B', label: '7mo de Básica', hint: 'Media' },
  { value: '8B', label: '8vo de Básica', hint: 'Superior' },
  { value: '9B', label: '9no de Básica', hint: 'Superior' },
  { value: '10B', label: '10mo de Básica', hint: 'Superior' },
  { value: '1BGU', label: '1ro de Bachillerato', hint: 'BGU' },
  { value: '2BGU', label: '2do de Bachillerato', hint: 'BGU' },
  { value: '3BGU', label: '3ro de Bachillerato', hint: 'BGU' },
]

/** Mismo catálogo de grados EGB que DEFAULT_LEVELS — BGU deliberadamente
 * excluido del modo multigrado (TIGA Multigrado v1.0: "BGU no está permitido"),
 * validado también server-side en shared/domain/multigrade.ts. */
export const MULTIGRADE_GRADE_OPTIONS: Array<{ value: string; label: string; superior: boolean }> = [
  { value: '1B', label: '1ro de Básica', superior: false },
  { value: '2B', label: '2do de Básica', superior: false },
  { value: '3B', label: '3ro de Básica', superior: false },
  { value: '4B', label: '4to de Básica', superior: false },
  { value: '5B', label: '5to de Básica', superior: false },
  { value: '6B', label: '6to de Básica', superior: false },
  { value: '7B', label: '7mo de Básica', superior: false },
  { value: '8B', label: '8vo de Básica', superior: true },
  { value: '9B', label: '9no de Básica', superior: true },
  { value: '10B', label: '10mo de Básica', superior: true },
]

export function isBgu(gradeCode: string): boolean {
  return gradeCode.endsWith('BGU')
}
