/**
 * Motor de distribución de competencias/saberes por semana — reemplaza el
 * concepto de "situación de aprendizaje" elegida a mano por el docente: dado
 * un período con N semanas, decide CUÁNTAS competencias entran (capacidad),
 * reparte las semanas ENTRE ellas de forma proporcional a su densidad de
 * saberes, y dentro del bloque de semanas de cada competencia reparte 1 saber
 * declarativo por semana + procedimentales/actitudinales round-robin.
 *
 * Calcado del motor real de TIGA (cnc_curriculum_distribution_engine.py:
 * competency_capacity/_select_scope/_weekly_units) — bug real corregido: la
 * versión anterior agotaba TODOS los declarativos de la competencia 1 antes
 * de tocar la competencia 2, así que una competencia con muchos declarativos
 * podía ocupar el trimestre completo (reportado por el usuario con captura:
 * la misma competencia en las 8 semanas de un período). Puro y testeado — no
 * toca la BD, el caller (repositorio) resuelve qué competencias pasar y
 * persiste el resultado.
 */

export interface DistributionSaber {
  id: string
  type: 'declarativo' | 'procedimental' | 'actitudinal'
  code: string
  description: string
}

export interface DistributionCompetency {
  id: string
  code: string
  text: string
  sabers: DistributionSaber[]
}

export interface WeekDistribution {
  weekNumber: number
  competencyId: string
  competencyCode: string
  competencyText: string
  saberIds: string[]
  sabers: DistributionSaber[]
}

export interface DistributionResult {
  weeks: WeekDistribution[]
  coverageWarning?: string
}

/**
 * Reparte round-robin `items` entre `bucketCount` cajas — usado para repartir
 * los saberes procedimentales/actitudinales de una competencia SOLO entre las
 * semanas que ella ocupa (no todas las semanas del bloque).
 */
function roundRobinBuckets<T>(items: T[], bucketCount: number): T[][] {
  const buckets: T[][] = Array.from({ length: bucketCount }, () => [])
  items.forEach((item, i) => buckets[i % bucketCount].push(item))
  return buckets
}

/**
 * Cuántas competencias caben en un período de `weeksCount` semanas — TIGA usa
 * ~12 "períodos-semana" (periodos semanales × semanas) por competencia; sin
 * carga horaria conocida, cae al fallback de TIGA para ese caso: 1 semana si
 * el período es de 1 semana, si no ceil(weeksCount/4).
 */
function competencyCapacity(weeksCount: number, weeklyPeriods: number | null | undefined): number {
  if (weeklyPeriods && weeklyPeriods > 0) {
    return Math.max(1, Math.floor((weeklyPeriods * weeksCount) / 12))
  }
  return weeksCount <= 1 ? 1 : Math.ceil(weeksCount / 4)
}

/**
 * Reparte `weeksCount` semanas entre `competencies` — 1 semana garantizada
 * por competencia, el resto va, una semana a la vez, a la competencia con
 * menor `allocated/knowledgeWeight` (peso = cantidad de declarativos; más
 * saberes pendientes por cubrir → más probabilidad de recibir la siguiente
 * semana). Calcado de _weekly_units en TIGA.
 */
function allocateWeeksAcrossCompetencies(competencies: DistributionCompetency[], weeksCount: number): number[] {
  const allocations = competencies.map(() => 1)
  const knowledgeWeight = competencies.map((c) => Math.max(1, c.sabers.filter((s) => s.type === 'declarativo').length))
  let remaining = weeksCount - competencies.length
  while (remaining > 0) {
    let pick = 0
    for (let i = 1; i < competencies.length; i++) {
      if (allocations[i] / knowledgeWeight[i] < allocations[pick] / knowledgeWeight[pick]) pick = i
    }
    allocations[pick]++
    remaining--
  }
  return allocations
}

export function distributeCompetencyWeeks(
  competencies: DistributionCompetency[],
  weeksCount: number,
  weeklyPeriods?: number | null,
): DistributionResult {
  const usable = competencies.filter((c) => c.sabers.some((s) => s.type === 'declarativo'))
  if (usable.length === 0) {
    return {
      weeks: [],
      coverageWarning: 'Ninguna de las competencias disponibles tiene saberes declarativos cargados — no se puede generar una sugerencia automática.',
    }
  }

  // Fase 1 — capacidad y selección: nunca "todas hasta agotarlas", un
  // subconjunto acotado proporcional a las semanas disponibles. Si hay menos
  // semanas que competencias con capacidad, se recorta a las primeras
  // `weeksCount` (mismo efecto que el achicamiento de scope de TIGA para ese
  // caso, sin portar su rama de "coverage_state" que aquí no aplica).
  const capacity = Math.min(competencyCapacity(weeksCount, weeklyPeriods), usable.length)
  const selected = usable.slice(0, Math.min(capacity, weeksCount))
  const leftoverCount = usable.length - selected.length

  // Fase 2 — repartir las semanas ENTRE las competencias seleccionadas,
  // proporcional a su densidad de declarativos (nunca una sola ocupa todo el
  // bloque si hay más de una competencia disponible).
  const allocations = allocateWeeksAcrossCompetencies(selected, weeksCount)

  let cycled = false
  const weeks: WeekDistribution[] = []
  let weekNumber = 1
  for (let ci = 0; ci < selected.length; ci++) {
    const competency = selected[ci]
    const blockWeeks = allocations[ci]
    const declarativos = competency.sabers.filter((s) => s.type === 'declarativo')
    const extras = competency.sabers.filter((s) => s.type !== 'declarativo')
    const extraBuckets = roundRobinBuckets(extras, blockWeeks)

    for (let w = 0; w < blockWeeks; w++) {
      if (w >= declarativos.length) cycled = true
      const declarativo = declarativos[w % declarativos.length]
      const sabers = [declarativo, ...extraBuckets[w]]
      weeks.push({
        weekNumber,
        competencyId: competency.id,
        competencyCode: competency.code,
        competencyText: competency.text,
        saberIds: sabers.map((s) => s.id),
        sabers,
      })
      weekNumber++
    }
  }

  const warnings: string[] = []
  if (cycled) {
    warnings.push('Alguna competencia tiene menos saberes declarativos que semanas asignadas — se repitieron desde el inicio de su bloque para completarlo.')
  }
  if (leftoverCount > 0) {
    warnings.push(`Quedaron ${leftoverCount} competencia(s) sin espacio en este período — se cubrirán en periodos siguientes.`)
  }

  return {
    weeks,
    coverageWarning: warnings.length > 0 ? warnings.join(' ') : undefined,
  }
}
