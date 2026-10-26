export function todayInEcuador(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Guayaquil', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => parts.find((entry) => entry.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
