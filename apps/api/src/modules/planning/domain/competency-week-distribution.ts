/**
 * Motor de distribución de competencias/saberes por semana — reemplaza el
 * concepto de "situación de aprendizaje" elegida a mano por el docente: dado
 * un período con N semanas, reparte automáticamente 1 saber declarativo por
 * semana entre las competencias disponibles (en el orden dado, normalmente
 * código ascendente y ya excluyendo competencias usadas en otros períodos del
 * mismo plan). Cuando una competencia se queda sin declarativos, la siguiente
 * semana pasa a la siguiente competencia. Puro y testeado — no toca la BD, el
 * caller (repositorio) resuelve qué competencias pasar y persiste el resultado.
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

export function distributeCompetencyWeeks(competencies: DistributionCompetency[], weeksCount: number): DistributionResult {
  const usable = competencies.filter((c) => c.sabers.some((s) => s.type === 'declarativo'))
  if (usable.length === 0) {
    return {
      weeks: [],
      coverageWarning: 'Ninguna de las competencias disponibles tiene saberes declarativos cargados — no se puede generar una sugerencia automática.',
    }
  }

  // Secuencia plana de (competencia, declarativo) en el orden dado — un
  // elemento = una semana. Cuando se agota, se cicla desde el inicio.
  const anchorSequence: { competency: DistributionCompetency; declarativo: DistributionSaber }[] = []
  for (const competency of usable) {
    for (const declarativo of competency.sabers.filter((s) => s.type === 'declarativo')) {
      anchorSequence.push({ competency, declarativo })
    }
  }

  let cycled = false
  const weekAnchors = Array.from({ length: weeksCount }, (_, i) => {
    if (i >= anchorSequence.length) cycled = true
    return anchorSequence[i % anchorSequence.length]
  })

  // Índices de semana (0-based) que ocupa cada competencia — para repartir sus
  // procedimentales/actitudinales solo entre esas semanas.
  const weekIndicesByCompetency = new Map<string, number[]>()
  weekAnchors.forEach((anchor, idx) => {
    const list = weekIndicesByCompetency.get(anchor.competency.id) ?? []
    list.push(idx)
    weekIndicesByCompetency.set(anchor.competency.id, list)
  })

  const extrasByWeekIndex = new Map<number, DistributionSaber[]>()
  for (const [competencyId, weekIndices] of weekIndicesByCompetency) {
    const competency = usable.find((c) => c.id === competencyId)!
    const extras = competency.sabers.filter((s) => s.type !== 'declarativo')
    const buckets = roundRobinBuckets(extras, weekIndices.length)
    weekIndices.forEach((weekIndex, i) => extrasByWeekIndex.set(weekIndex, buckets[i]))
  }

  const weeks: WeekDistribution[] = weekAnchors.map((anchor, idx) => {
    const sabers = [anchor.declarativo, ...(extrasByWeekIndex.get(idx) ?? [])]
    return {
      weekNumber: idx + 1,
      competencyId: anchor.competency.id,
      competencyCode: anchor.competency.code,
      competencyText: anchor.competency.text,
      saberIds: sabers.map((s) => s.id),
      sabers,
    }
  })

  return {
    weeks,
    coverageWarning: cycled
      ? 'El número de semanas supera los saberes declarativos disponibles — se repitieron competencias desde el inicio para completar el bloque.'
      : undefined,
  }
}
