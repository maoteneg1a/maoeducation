import { useEffect, useState } from 'react'

const clock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'America/Guayaquil',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function useScheduleClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 10_000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const parts = clock.formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return {
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday') ?? ''),
    time: `${part('hour')}:${part('minute')}`,
  }
}
