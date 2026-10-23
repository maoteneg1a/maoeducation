import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2, FileDown, FileText } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'
import { getErrorMessage } from '@/shared/lib/utils'
import { formalReportsApi } from '../api/formal-reports.api'
import { ReportStatusBadge } from './ReportStatusBadge'

/**
 * Informes recibidos por el representante (portal de familias). Solo lectura:
 * confirmar recepción y descargar el PDF. El representante nunca sube archivos.
 */
export function GuardianReportsCard() {
  const qc = useQueryClient()
  const { data = [] } = useQuery({
    queryKey: ['formal-reports', 'inbox', 'guardian'],
    queryFn: () => formalReportsApi.list({ box: 'inbox' }),
    staleTime: 60_000,
  })
  const receive = useMutation({
    mutationFn: (id: string) => formalReportsApi.receive(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['formal-reports'] }); toast.success('Recepción confirmada') },
    onError: (e) => toast.error(getErrorMessage(e)),
  })
  if (data.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><FileText className="h-4 w-4 text-primary" />Informes de la institución</CardTitle>
      </CardHeader>
      <CardContent className="divide-y">
        {data.slice(0, 8).map((r) => (
          <div key={r.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">{r.typeLabel}</p>
              <p className="text-xs text-muted-foreground">
                {r.folio} · {r.student?.name ?? ''} · {r.sentAt ? new Date(r.sentAt).toLocaleDateString('es-EC') : ''}
              </p>
              <div className="mt-1"><ReportStatusBadge status={r.status} /></div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => formalReportsApi.downloadPdf(r.id, `${r.folio ?? 'informe'}.pdf`).catch((e) => toast.error(getErrorMessage(e)))}>
                <FileDown className="mr-1 h-4 w-4" /> PDF
              </Button>
              {r.permissions.canReceive && (
                <Button size="sm" disabled={receive.isPending} onClick={() => receive.mutate(r.id)}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmo recepción
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
