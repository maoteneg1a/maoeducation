/** La estructura académica identifica las jornadas mediante nombres como A-M y B-V. */
export function preparatoryParallelLabel(parallel: { levelName: string; name: string; yearName: string }) {
  const match = /^(.*?)\s*[-–]\s*([MVN])$/i.exec(parallel.name.trim())
  const shifts: Record<string, string> = { M: 'Matutina', V: 'Vespertina', N: 'Nocturna' }
  const course = `${parallel.levelName} ${match ? match[1] : parallel.name}`.trim()
  return `${course} · ${match ? shifts[match[2].toUpperCase()] : 'Jornada sin indicar'} · ${parallel.yearName}`
}
