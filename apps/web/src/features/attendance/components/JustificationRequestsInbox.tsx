import * as React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Check, Inbox, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { getErrorMessage } from '@/shared/lib/utils'
import { listJustificationRequests, reviewJustificationRequest, type JustificationRequest } from '../api/attendance.api'

/** Bandeja de solicitudes de justificación enviadas por las familias. */
export function JustificationRequestsInbox() {
  const qc = useQueryClient()
  const { data: requests = [] } = useQuery({
    queryKey: ['justification-requests', 'pending'],
    queryFn: () => listJustificationRequests('pending'),
  })
  const [notes, setNotes] = React.useState<Record<string, string>>({})

  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      reviewJustificationRequest(id, { approve, notes: notes[id]?.trim() || undefined }),
    onSuccess: (_, { approve }) => {
      qc.invalidateQueries({ queryKey: ['justification-requests'] })
      qc.invalidateQueries({ queryKey: ['student-absences'] })
      toast.success(approve ? 'Faltas justificadas' : 'Solicitud rechazada')
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  })

  if (requests.length === 0) return null

  return (
    <Card className="border-amber-300">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="h-4 w-4" aria-hidden />
          Solicitudes de las familias
          <Badge variant="warning">{requests.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y p-0">
        {requests.map((r: JustificationRequest) => (
          <div key={r.id} className="space-y-2 px-6 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium">{r.student.name}</p>
              <p className="text-xs text-muted-foreground">
                Enviada por {r.requestedBy} · {new Date(r.createdAt).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            <p className="text-sm">{r.reason}</p>
            <div className="flex flex-wrap gap-1">
              {r.records.map((rec) => (
                <Badge key={rec.id} variant="outline" className="text-xs">
                  {new Date(`${rec.date}T12:00:00`).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}
                  {' · '}
                  {rec.status === 'absent' ? 'Falta' : rec.status === 'late' ? 'Atraso' : rec.status}
                  {rec.subject ? ` · ${rec.subject}` : ''}
                </Badge>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={notes[r.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                placeholder="Nota para la familia (opcional)"
                className="h-8 text-sm sm:max-w-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => review.mutate({ id: r.id, approve: true })} disabled={review.isPending}>
                  <Check className="h-4 w-4" /> Aprobar
                </Button>
                <Button size="sm" variant="outline" onClick={() => review.mutate({ id: r.id, approve: false })} disabled={review.isPending}>
                  <X className="h-4 w-4" /> Rechazar
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
