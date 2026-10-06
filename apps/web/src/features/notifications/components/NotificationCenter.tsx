import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/shared/components/ui/button'
import { cn } from '@/shared/lib/utils'
import { notificationsApi, type UserNotification } from '../api/notifications.api'

export function NotificationCenter() {
  const [open, setOpen] = React.useState(false)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    refetchInterval: 60_000,
  })
  const refresh = () => qc.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({ mutationFn: notificationsApi.markRead, onSuccess: refresh })
  const markAll = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: refresh })

  React.useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  function openNotification(item: UserNotification) {
    if (!item.readAt) markRead.mutate(item.id)
    setOpen(false)
    if (item.url) navigate(item.url)
  }

  return (
    <div ref={rootRef} className="relative">
      <Button variant="ghost" size="icon" className="relative h-8 w-8" title="Notificaciones" onClick={() => setOpen((value) => !value)}>
        <Bell className="h-4 w-4" />
        {!!data?.unread && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {data.unread > 99 ? '99+' : data.unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="fixed inset-x-3 top-14 z-50 max-h-[70vh] overflow-hidden rounded-lg border bg-background shadow-xl sm:absolute sm:inset-auto sm:right-0 sm:top-10 sm:w-96">
          <div className="flex items-center justify-between border-b p-3">
            <div><p className="font-semibold">Notificaciones</p><p className="text-xs text-muted-foreground">{data?.unread ?? 0} sin leer</p></div>
            <Button variant="ghost" size="sm" disabled={!data?.unread} onClick={() => markAll.mutate()}><CheckCheck className="h-4 w-4" /> Leer todas</Button>
          </div>
          <div className="max-h-[58vh] overflow-y-auto">
            {!data?.items.length ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No tienes notificaciones</p>
            ) : data.items.map((item) => (
              <button key={item.id} type="button" onClick={() => openNotification(item)} className={cn('block w-full border-b p-3 text-left transition-colors hover:bg-muted/50', !item.readAt && 'bg-primary/5')}>
                <div className="flex gap-2"><span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', item.readAt ? 'bg-transparent' : 'bg-primary')} /><div className="min-w-0"><p className="text-sm font-medium">{item.title}</p><p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}</p></div></div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
