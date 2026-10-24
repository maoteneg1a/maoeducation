import { Badge } from '@/shared/components/ui/badge'
import type { FormalReportStatus } from '../api/formal-reports.api'

export const REPORT_STATUS_LABEL: Record<FormalReportStatus, string> = {
  DRAFT: 'Borrador',
  SENT: 'Enviado',
  RECEIVED: 'Recibido',
  RETURNED: 'Devuelto',
  ATTENDED: 'Atendido',
}

const VARIANT: Record<FormalReportStatus, 'secondary' | 'default' | 'success' | 'warning' | 'outline'> = {
  DRAFT: 'secondary',
  SENT: 'default',
  RECEIVED: 'success',
  RETURNED: 'warning',
  ATTENDED: 'success',
}

export function ReportStatusBadge({ status, overdue }: { status: FormalReportStatus | string; overdue?: boolean }) {
  const s = status as FormalReportStatus
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge variant={VARIANT[s] ?? 'outline'}>{REPORT_STATUS_LABEL[s] ?? status}</Badge>
      {overdue && <Badge variant="destructive">Plazo vencido</Badge>}
    </span>
  )
}
