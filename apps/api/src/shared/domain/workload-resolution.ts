/**
 * Resolución de carga horaria oficial — calcado de resolve_weekly_periods() en
 * TIGA (curricular_workload.py). Autoridad nacional -> distribución
 * institucional validada -> períodos efectivos. Sin redistribuciones
 * inventadas: si un bloque agrupado (ej. "ECA+EF") no tiene reparto
 * institucional, el resultado es explícitamente "requiere configuración", no
 * un valor adivinado.
 */

export type WorkloadEffectiveSource = 'OFFICIAL' | 'INSTITUTIONAL' | 'MISSING'

export interface WorkloadEntryInput {
  sublevel: string
  levelCodes: string[]
  educationOffer: string
  subjectCodes: string[]
  weeklyPeriods: number | null
  groupWeeklyPeriods: number | null
  periodMinutes: number
  sourceType: string
  sourceDocument: string
  notes: string | null
}

export interface ResolvedWorkload {
  weeklyPeriods: number | null
  periodMinutes: number | null
  sourceType: string | null
  sourceDocument: string | null
  effectiveSource: WorkloadEffectiveSource
  groupWeeklyPeriods: number | null
  status: 'VERIFIED' | 'INSTITUTIONAL_CONFIGURATION_REQUIRED' | 'MISSING' | 'NOT_APPLICABLE'
  notes: string | null
}

const NOT_APPLICABLE: ResolvedWorkload = {
  weeklyPeriods: null,
  periodMinutes: null,
  sourceType: null,
  sourceDocument: null,
  effectiveSource: 'MISSING',
  groupWeeklyPeriods: null,
  status: 'NOT_APPLICABLE',
  notes: null,
}

const MISSING: ResolvedWorkload = {
  weeklyPeriods: null,
  periodMinutes: null,
  sourceType: null,
  sourceDocument: null,
  effectiveSource: 'MISSING',
  groupWeeklyPeriods: null,
  status: 'MISSING',
  notes: null,
}

/**
 * Resuelve la carga horaria oficial para un grado+materia. `institutionalOverride`
 * es el `CourseAssignment.weeklyPeriodsOverride` ya cargado por el llamador — solo
 * se usa cuando la entrada oficial es un bloque agrupado.
 */
export function resolveWorkload(
  entries: WorkloadEntryInput[],
  levelCode: string,
  workloadSubjectCode: string | null,
  educationOffer: string | null,
  institutionalOverride: number | null | undefined,
): ResolvedWorkload {
  if (!workloadSubjectCode) return NOT_APPLICABLE

  const offer = educationOffer ?? 'EGB'
  const matches = entries.filter(
    (e) => e.levelCodes.includes(levelCode) && e.subjectCodes.includes(workloadSubjectCode) && e.educationOffer === offer,
  )
  const entry = matches[0]
  if (!entry) return MISSING

  if (entry.sourceType === 'OFFICIAL_GROUPED') {
    if (institutionalOverride == null) {
      return {
        weeklyPeriods: null,
        periodMinutes: entry.periodMinutes,
        sourceType: entry.sourceType,
        sourceDocument: entry.sourceDocument,
        effectiveSource: 'MISSING',
        groupWeeklyPeriods: entry.groupWeeklyPeriods,
        status: 'INSTITUTIONAL_CONFIGURATION_REQUIRED',
        notes: entry.notes,
      }
    }
    return {
      weeklyPeriods: institutionalOverride,
      periodMinutes: entry.periodMinutes,
      sourceType: entry.sourceType,
      sourceDocument: entry.sourceDocument,
      effectiveSource: 'INSTITUTIONAL',
      groupWeeklyPeriods: entry.groupWeeklyPeriods,
      status: 'VERIFIED',
      notes: entry.notes,
    }
  }

  return {
    weeklyPeriods: entry.weeklyPeriods,
    periodMinutes: entry.periodMinutes,
    sourceType: entry.sourceType,
    sourceDocument: entry.sourceDocument,
    effectiveSource: 'OFFICIAL',
    groupWeeklyPeriods: null,
    status: 'VERIFIED',
    notes: entry.notes,
  }
}

/**
 * Densidad de actividades por fase según períodos semanales — calcado de
 * _weekly_phase_counts() en TIGA (competency_planning_service.py), con un
 * mínimo de 2 actividades por fase siempre (pedido explícito: la IA debe
 * generar mínimo 2 actividades en Inicio/Desarrollo/Cierre sin excepción,
 * incluso con poca carga horaria — antes 1-2 períodos dejaba Inicio/Cierre
 * en 1 sola actividad). Determinista, sin IA: la carga horaria mueve cuántas
 * actividades sugiere el generador por fase, nunca menos del mínimo.
 */
export function weeklyPhaseCounts(weeklyPeriods: number | null): { anticipation: number; construction: number; consolidation: number } {
  const periods = Math.max(2, weeklyPeriods ?? 3)
  if (periods <= 3) return { anticipation: 2, construction: 2, consolidation: 2 }
  if (periods <= 6) return { anticipation: 2, construction: 3, consolidation: 2 }
  return { anticipation: 2, construction: 4, consolidation: 2 }
}

/**
 * Reparte un TOTAL de actividades explícito entre las 3 fases — usado cuando
 * el docente elige "una actividad por saber" o un número fijo en vez del
 * cálculo por carga horaria. Mismo piso pedagógico que weeklyPhaseCounts:
 * nunca menos de 2 por fase. El resto por encima de 6 (2×3) se reparte
 * dándole prioridad a Desarrollo (donde ocurre la construcción del
 * aprendizaje), igual que ya hace weeklyPhaseCounts con cargas horarias altas.
 */
export function phaseCountsFromTotal(total: number): { anticipation: number; construction: number; consolidation: number } {
  const extra = Math.max(0, total - 6)
  return { anticipation: 2, construction: 2 + extra, consolidation: 2 }
}
